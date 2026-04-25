use axum::{
    Json, Router,
    body::Body,
    extract::State,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::post,
};
use sqlx::PgPool;
use std::sync::Arc;
use std::time::Instant;

use crate::error::AppError;
use crate::middleware::rate_limiter::RateLimiter;
use crate::models::billing::BillingTransaction;
use crate::models::pricing_group::PricingGroup;
use crate::models::relay_key::RelayKey;
use crate::models::request_log::CreateRequestLog;
use crate::models::request_log::RequestLog;
use crate::models::user::User;
use crate::relay::dispatcher::{Dispatcher, strip_model_suffix};
use crate::relay::providers::{ChatRequest, ProviderError};
use crate::relay::streaming::SseCollector;
use crate::relay::token_counter;

pub fn router(pool: PgPool, dispatcher: Arc<Dispatcher>, rate_limiter: RateLimiter) -> Router {
    Router::new()
        .route("/chat/completions", post(chat_completions))
        .with_state((pool, dispatcher, rate_limiter))
}

/// Extract relay key from Authorization header
fn extract_relay_key(headers: &HeaderMap) -> Result<String, AppError> {
    let auth = headers
        .get("Authorization")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| AppError::Unauthorized("Missing Authorization header".into()))?;

    let key = auth
        .strip_prefix("Bearer ")
        .ok_or_else(|| AppError::Unauthorized("Invalid Authorization format".into()))?;

    Ok(key.to_string())
}

async fn chat_completions(
    State((pool, dispatcher, rate_limiter)): State<(PgPool, Arc<Dispatcher>, RateLimiter)>,
    headers: HeaderMap,
    Json(mut request): Json<ChatRequest>,
) -> Result<Response, AppError> {
    let start = Instant::now();
    let raw_key = extract_relay_key(&headers)?;

    // Authenticate relay key
    let relay_key = RelayKey::find_by_key(&pool, &raw_key)
        .await?
        .ok_or_else(|| AppError::Unauthorized("Invalid API key".into()))?;

    // Check user is active
    let user = User::find_by_id(&pool, relay_key.user_id)
        .await?
        .ok_or_else(|| AppError::Unauthorized("User not found".into()))?;

    if !user.is_active {
        return Err(AppError::Forbidden("Account is disabled".into()));
    }

    let requested_model = request.model.clone();
    let clean_model = strip_model_suffix(&requested_model).to_string();
    if !relay_key.allows_model(&clean_model) {
        return Err(AppError::Forbidden(
            "Model not allowed for this API key".into(),
        ));
    }

    // Rate limiting: check per-key RPM if set, then user-level default 60 RPM
    if let Some(rpm) = relay_key.rpm_limit {
        if let Err(retry_after) = rate_limiter.check_key_rpm(relay_key.id, rpm as u32) {
            return Err(AppError::TooManyRequests {
                message: format!("Rate limited. Retry after {retry_after}s"),
                retry_after: Some(retry_after),
            });
        }
    }
    if let Err(retry_after) = rate_limiter.check_user_rpm(user.id, 60) {
        return Err(AppError::TooManyRequests {
            message: format!("Rate limited. Retry after {retry_after}s"),
            retry_after: Some(retry_after),
        });
    }

    // Group permission check: if key has a group, verify the model's channel is allowed
    let group_multiplier = if let Some(gid) = relay_key.group_id {
        let group = PricingGroup::find_by_id(&pool, gid)
            .await?
            .ok_or_else(|| AppError::Forbidden("Pricing group not found".into()))?;
        if !group.is_active {
            return Err(AppError::Forbidden("Pricing group is disabled".into()));
        }
        let allowed_channels = PricingGroup::get_channel_ids(&pool, gid).await?;
        if !allowed_channels.is_empty() {
            // Check if the model matches any allowed channel
            let channels = crate::models::channel::Channel::list(&pool).await?;
            let model_allowed = channels.iter().any(|ch| {
                if !ch.is_active || !allowed_channels.contains(&ch.id) {
                    return false;
                }
                // Check model against channel's model_pattern (comma-separated or wildcard)
                model_matches(&ch.model_pattern, &clean_model)
            });
            if !model_allowed {
                return Err(AppError::Forbidden(
                    "Model not available in your pricing group".into(),
                ));
            }
        }
        Some(group.multiplier)
    } else {
        None
    };

    // Balance pre-check: estimate minimum cost and reject if insufficient
    let prompt_tokens_est = token_counter::count_message_tokens(&request.messages, &clean_model);
    let est_cost =
        token_counter::estimate_cost_from_db(&pool, &clean_model, prompt_tokens_est, 100).await;
    if user.balance < est_cost {
        return Err(AppError::Forbidden("Insufficient balance".into()));
    }

    let is_stream = request.stream.unwrap_or(false);
    request.model = clean_model.clone();

    if is_stream {
        handle_stream(
            pool,
            dispatcher,
            relay_key,
            user,
            request,
            requested_model,
            clean_model,
            start,
            group_multiplier,
        )
        .await
    } else {
        handle_non_stream(
            pool,
            dispatcher,
            relay_key,
            user,
            request,
            requested_model,
            clean_model,
            start,
            group_multiplier,
        )
        .await
    }
}

async fn handle_non_stream(
    pool: PgPool,
    dispatcher: Arc<Dispatcher>,
    relay_key: RelayKey,
    user: User,
    request: ChatRequest,
    requested_model: String,
    clean_model: String,
    start: Instant,
    group_multiplier: Option<f64>,
) -> Result<Response, AppError> {
    let prompt_tokens_est = token_counter::count_message_tokens(&request.messages, &clean_model);

    match dispatcher.dispatch(&request).await {
        Ok(result) => {
            let latency = start.elapsed().as_millis() as i32;
            let usage = result.response.usage.as_ref();
            let prompt_tokens = usage.map(|u| u.prompt_tokens).unwrap_or(prompt_tokens_est);
            let completion_tokens = usage.map(|u| u.completion_tokens).unwrap_or(0);
            let total_tokens = prompt_tokens + completion_tokens;
            let cache_creation_tokens = usage.map(|u| u.cache_creation_tokens).unwrap_or(0);
            let cache_read_tokens = usage.map(|u| u.cache_read_tokens).unwrap_or(0);
            let mut cost = token_counter::estimate_cost_from_db(
                &pool,
                &clean_model,
                prompt_tokens,
                completion_tokens,
            )
            .await;
            if let Some(gm) = group_multiplier {
                cost = (cost as f64 * gm).ceil() as i64;
            }
            cost = cost.max(0);

            let log = CreateRequestLog {
                user_id: Some(user.id),
                relay_key_id: Some(relay_key.id),
                provider_key_id: Some(result.provider_key_id),
                channel_id: Some(result.channel_id),
                model: requested_model.clone(),
                method: "POST".into(),
                path: "/v1/chat/completions".into(),
                status_code: 200,
                prompt_tokens: prompt_tokens as i32,
                completion_tokens: completion_tokens as i32,
                total_tokens: total_tokens as i32,
                cost,
                latency_ms: latency,
                is_stream: false,
                error_message: None,
                ip_address: None,
                cache_creation_tokens: cache_creation_tokens as i32,
                cache_read_tokens: cache_read_tokens as i32,
            };
            let recorded = BillingTransaction::record_usage(
                &pool,
                user.id,
                &log,
                Some(&format!("API usage: {requested_model}")),
            )
            .await?;
            if recorded.is_none() {
                return Err(AppError::Forbidden(
                    "Insufficient balance for final usage cost".into(),
                ));
            }

            Ok(Json(result.response).into_response())
        }
        Err(e) => {
            log_error(&pool, &relay_key, &user, &requested_model, &e, start).await;
            Err(provider_err_to_app_err(e))
        }
    }
}

async fn handle_stream(
    pool: PgPool,
    dispatcher: Arc<Dispatcher>,
    relay_key: RelayKey,
    user: User,
    request: ChatRequest,
    requested_model: String,
    clean_model: String,
    start: Instant,
    group_multiplier: Option<f64>,
) -> Result<Response, AppError> {
    let prompt_tokens_est = token_counter::count_message_tokens(&request.messages, &clean_model);

    match dispatcher.dispatch_stream(&request).await {
        Ok(result) => {
            let (collector, collected) = SseCollector::new(result.stream);

            // When stream ends, log and bill
            let pool2 = pool.clone();
            let model2 = requested_model.clone();
            let clean_model2 = clean_model.clone();
            let provider_key_id = result.provider_key_id;
            let channel_id = result.channel_id;
            let relay_key_id = relay_key.id;
            let user_id = user.id;

            let body_stream = futures::stream::unfold(
                (collector, collected, false),
                move |(mut collector, collected, done)| {
                    let pool3 = pool2.clone();
                    let model3 = model2.clone();
                    let clean_model3 = clean_model2.clone();
                    async move {
                        if done {
                            return None;
                        }

                        use futures::StreamExt;
                        match collector.next().await {
                            Some(Ok(bytes)) => Some((
                                Ok::<_, std::io::Error>(bytes),
                                (collector, collected, false),
                            )),
                            Some(Err(e)) => {
                                let err_bytes =
                                    bytes::Bytes::from(format!("data: {{\"error\":\"{e}\"}}\n\n"));
                                Some((Ok(err_bytes), (collector, collected, true)))
                            }
                            None => {
                                // Stream ended, do billing + logging
                                let content = collected.lock().unwrap().clone();
                                let completion_tokens =
                                    content.completion_tokens.unwrap_or_else(|| {
                                        token_counter::count_tokens(&content.text, &clean_model3)
                                    });
                                let prompt_tokens =
                                    content.prompt_tokens.unwrap_or(prompt_tokens_est);
                                let total_tokens = prompt_tokens + completion_tokens;
                                let cache_creation_tokens =
                                    content.cache_creation_tokens.unwrap_or(0);
                                let cache_read_tokens = content.cache_read_tokens.unwrap_or(0);
                                let mut cost = token_counter::estimate_cost_from_db(
                                    &pool3,
                                    &clean_model3,
                                    prompt_tokens,
                                    completion_tokens,
                                )
                                .await;
                                if let Some(gm) = group_multiplier {
                                    cost = (cost as f64 * gm).ceil() as i64;
                                }
                                cost = cost.max(0);
                                let latency = start.elapsed().as_millis() as i32;

                                let log = CreateRequestLog {
                                    user_id: Some(user_id),
                                    relay_key_id: Some(relay_key_id),
                                    provider_key_id: Some(provider_key_id),
                                    channel_id: Some(channel_id),
                                    model: model3.clone(),
                                    method: "POST".into(),
                                    path: "/v1/chat/completions".into(),
                                    status_code: 200,
                                    prompt_tokens: prompt_tokens as i32,
                                    completion_tokens: completion_tokens as i32,
                                    total_tokens: total_tokens as i32,
                                    cost,
                                    latency_ms: latency,
                                    is_stream: true,
                                    error_message: None,
                                    ip_address: None,
                                    cache_creation_tokens: cache_creation_tokens as i32,
                                    cache_read_tokens: cache_read_tokens as i32,
                                };
                                match BillingTransaction::record_usage(
                                    &pool3,
                                    user_id,
                                    &log,
                                    Some(&format!("API usage: {model3}")),
                                )
                                .await
                                {
                                    Ok(Some(_)) => {}
                                    Ok(None) => {
                                        tracing::warn!(
                                            "Insufficient balance while billing streamed request for user {user_id}"
                                        );
                                    }
                                    Err(e) => {
                                        tracing::error!("Failed to record streamed usage: {e}");
                                    }
                                }

                                None
                            }
                        }
                    }
                },
            );

            let body = Body::from_stream(body_stream);

            Ok(Response::builder()
                .status(StatusCode::OK)
                .header("Content-Type", "text/event-stream")
                .header("Cache-Control", "no-cache")
                .header("Connection", "keep-alive")
                .body(body)
                .unwrap())
        }
        Err(e) => {
            log_error(&pool, &relay_key, &user, &requested_model, &e, start).await;
            Err(provider_err_to_app_err(e))
        }
    }
}

async fn log_error(
    pool: &PgPool,
    relay_key: &RelayKey,
    user: &User,
    model: &str,
    err: &ProviderError,
    start: Instant,
) {
    let latency = start.elapsed().as_millis() as i32;
    let _ = RequestLog::create(
        pool,
        &CreateRequestLog {
            user_id: Some(user.id),
            relay_key_id: Some(relay_key.id),
            provider_key_id: None,
            channel_id: None,
            model: model.to_string(),
            method: "POST".into(),
            path: "/v1/chat/completions".into(),
            status_code: err.status as i32,
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
            cost: 0,
            latency_ms: latency,
            is_stream: false,
            error_message: Some(err.message.clone()),
            ip_address: None,
            cache_creation_tokens: 0,
            cache_read_tokens: 0,
        },
    )
    .await;
}

fn provider_err_to_app_err(e: ProviderError) -> AppError {
    match e.status {
        429 => AppError::TooManyRequests {
            message: format!("Rate limited by provider: {}", e.message),
            retry_after: None,
        },
        404 => AppError::NotFound(e.message),
        503 => AppError::Internal(e.message),
        _ => AppError::Internal(e.message),
    }
}

fn model_matches(patterns: &str, model: &str) -> bool {
    patterns.split(',').any(|pat| {
        let pat = pat.trim();
        if pat.is_empty() {
            return false;
        }
        if pat == model {
            return true;
        }
        pat.strip_suffix('*')
            .map(|prefix| model.starts_with(prefix))
            .unwrap_or(false)
    })
}
