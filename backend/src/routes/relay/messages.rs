use axum::{
    body::Body,
    extract::State,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::post,
    Json, Router,
};
use bytes::Bytes;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use std::sync::Arc;
use std::time::Instant;

use crate::error::AppError;
use crate::models::billing::BillingTransaction;
use crate::models::relay_key::RelayKey;
use crate::models::request_log::{CreateRequestLog, RequestLog};
use crate::models::user::User;
use crate::models::pricing_group::PricingGroup;
use crate::relay::dispatcher::{Dispatcher, strip_model_suffix};
use crate::middleware::rate_limiter::RateLimiter;
use crate::relay::token_counter;

pub fn router(pool: PgPool, dispatcher: Arc<Dispatcher>, rate_limiter: RateLimiter) -> Router {
    let client = Client::new();
    Router::new()
        .route("/messages", post(messages))
        .with_state((pool, dispatcher, rate_limiter, client))
}

/// Extract relay key from Authorization header or x-api-key header
fn extract_key(headers: &HeaderMap) -> Result<String, AppError> {
    // Try Authorization: Bearer first
    if let Some(auth) = headers.get("Authorization").and_then(|v| v.to_str().ok()) {
        if let Some(key) = auth.strip_prefix("Bearer ") {
            return Ok(key.to_string());
        }
    }
    // Try x-api-key (Anthropic style)
    if let Some(key) = headers.get("x-api-key").and_then(|v| v.to_str().ok()) {
        return Ok(key.to_string());
    }
    Err(AppError::Unauthorized("Missing API key".into()))
}

#[derive(Deserialize)]
struct MessagesRequest {
    model: String,
    #[serde(default)]
    stream: bool,
    #[serde(flatten)]
    rest: serde_json::Value,
}

#[derive(Deserialize)]
struct AnthropicUsage {
    input_tokens: Option<u32>,
    output_tokens: Option<u32>,
}

#[derive(Deserialize)]
struct AnthropicResponse {
    usage: Option<AnthropicUsage>,
}

async fn messages(
    State((pool, dispatcher, rate_limiter, client)): State<(PgPool, Arc<Dispatcher>, RateLimiter, Client)>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Response, AppError> {
    let start = Instant::now();
    let raw_key = extract_key(&headers)?;

    // Parse request to get model and stream flag
    let req: MessagesRequest = serde_json::from_slice(&body)
        .map_err(|e| AppError::BadRequest(format!("Invalid request: {e}")))?;

    let original_model = req.model.clone();
    let clean_model = strip_model_suffix(&original_model).to_string();
    let is_stream = req.stream;

    // Auth
    let relay_key = RelayKey::find_by_key(&pool, &raw_key)
        .await?
        .ok_or_else(|| AppError::Unauthorized("Invalid API key".into()))?;

    let user = User::find_by_id(&pool, relay_key.user_id)
        .await?
        .ok_or_else(|| AppError::Unauthorized("User not found".into()))?;

    if !user.is_active {
        return Err(AppError::Forbidden("Account is disabled".into()));
    }

    // Rate limiting
    if let Some(rpm) = relay_key.rpm_limit {
        if let Err(retry_after) = rate_limiter.check_key_rpm(relay_key.id, rpm as u32) {
            return Err(AppError::BadRequest(format!("Rate limited. Retry after {retry_after}s")));
        }
    }
    if let Err(retry_after) = rate_limiter.check_user_rpm(user.id, 60) {
        return Err(AppError::BadRequest(format!("Rate limited. Retry after {retry_after}s")));
    }

    // Group permission check
    let group_multiplier = if let Some(gid) = relay_key.group_id {
        let group = PricingGroup::find_by_id(&pool, gid).await?
            .ok_or_else(|| AppError::Forbidden("Pricing group not found".into()))?;
        if !group.is_active {
            return Err(AppError::Forbidden("Pricing group is disabled".into()));
        }
        let allowed_channels = PricingGroup::get_channel_ids(&pool, gid).await?;
        if !allowed_channels.is_empty() {
            let channels = crate::models::channel::Channel::list(&pool).await?;
            let model_allowed = channels.iter().any(|ch| {
                if !ch.is_active || !allowed_channels.contains(&ch.id) {
                    return false;
                }
                ch.model_pattern.split(',').any(|pat| {
                    let pat = pat.trim();
                    if pat.ends_with('*') {
                        clean_model.starts_with(&pat[..pat.len()-1])
                    } else {
                        pat == clean_model
                    }
                })
            });
            if !model_allowed {
                return Err(AppError::Forbidden("Model not available in your pricing group".into()));
            }
        }
        Some(group.multiplier)
    } else {
        None
    };

    // Balance pre-check
    let est_cost = token_counter::estimate_cost_from_db(&pool, &clean_model, 500, 100).await;
    if user.balance < est_cost {
        return Err(AppError::Forbidden("Insufficient balance".into()));
    }

    // Get route: channel + provider keys
    let (_channel, keys) = dispatcher.get_route(&clean_model).await
        .map_err(|e| AppError::NotFound(e.message))?;

    // Rewrite model name in request body to clean version
    let mut body_json: serde_json::Value = serde_json::from_slice(&body)
        .map_err(|e| AppError::BadRequest(format!("Invalid JSON: {e}")))?;
    body_json["model"] = serde_json::Value::String(clean_model.clone());

    // Try each provider key with failover
    let mut last_err = None;
    for key in &keys {
        let base_url = key.base_url.as_deref().unwrap_or("https://api.anthropic.com");
        let url = format!("{}/v1/messages", base_url.trim_end_matches('/'));

        let result = client
            .post(&url)
            .header("x-api-key", &key.api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .body(body_json.to_string())
            .send()
            .await;

        match result {
            Ok(resp) => {
                let status = resp.status().as_u16();
                if status == 429 || status >= 500 {
                    let body = resp.text().await.unwrap_or_default();
                    tracing::warn!("Provider {} key {} failed: {status} {body}", key.provider, key.name);
                    last_err = Some((status, body));
                    continue;
                }
                if !resp.status().is_success() {
                    let body = resp.text().await.unwrap_or_default();
                    return Err(AppError::BadRequest(body));
                }

                let provider_key_id = key.id;
                let channel_id = _channel.id;

                if is_stream {
                    // Stream response through, collect usage at the end
                    let raw_stream = resp.bytes_stream();
                    let pool2 = pool.clone();
                    let model2 = clean_model.clone();
                    let relay_key_id = relay_key.id;
                    let user_id = user.id;

                    let mut input_tokens: u32 = 0;
                    let mut output_tokens: u32 = 0;

                    let body_stream = futures::stream::unfold(
                        (raw_stream, false),
                        move |(mut stream, done)| {
                            let pool3 = pool2.clone();
                            let model3 = model2.clone();
                            async move {
                                if done {
                                    return None;
                                }
                                use futures::StreamExt;
                                match stream.next().await {
                                    Some(Ok(chunk)) => {
                                        // Parse SSE events for usage tracking
                                        let text = String::from_utf8_lossy(&chunk);
                                        for line in text.lines() {
                                            if let Some(data) = line.strip_prefix("data: ") {
                                                if let Ok(evt) = serde_json::from_str::<serde_json::Value>(data) {
                                                    if let Some(usage) = evt.get("usage") {
                                                        if let Some(it) = usage.get("input_tokens").and_then(|v| v.as_u64()) {
                                                            input_tokens = it as u32;
                                                        }
                                                        if let Some(ot) = usage.get("output_tokens").and_then(|v| v.as_u64()) {
                                                            output_tokens = ot as u32;
                                                        }
                                                    }
                                                    // message_stop = end of stream
                                                    if evt.get("type").and_then(|v| v.as_str()) == Some("message_stop") {
                                                        let total = input_tokens + output_tokens;
                                                        let mut cost = token_counter::estimate_cost_from_db(
                                                            &pool3, &model3, input_tokens as u32, output_tokens as u32
                                                        ).await;
                                                        if let Some(gm) = group_multiplier {
                                                            cost = (cost as f64 * gm).ceil() as i64;
                                                        }
                                                        let latency = start.elapsed().as_millis() as i32;
                                                        let pool4 = pool3.clone();
                                                        let model4 = model3.clone();
                                                        tokio::spawn(async move {
                                                            if let Ok(updated) = User::update_balance(&pool4, user_id, -cost).await {
                                                                let _ = BillingTransaction::create(
                                                                    &pool4, user_id, "usage", -cost, updated.balance,
                                                                    Some(&format!("API usage: {model4}")), None,
                                                                ).await;
                                                            }
                                                            let _ = RequestLog::create(&pool4, &CreateRequestLog {
                                                                user_id: Some(user_id),
                                                                relay_key_id: Some(relay_key_id),
                                                                provider_key_id: Some(provider_key_id),
                                                                channel_id: Some(channel_id),
                                                                model: model4,
                                                                method: "POST".into(),
                                                                path: "/v1/messages".into(),
                                                                status_code: 200,
                                                                prompt_tokens: input_tokens as i32,
                                                                completion_tokens: output_tokens as i32,
                                                                total_tokens: total as i32,
                                                                cost,
                                                                latency_ms: latency,
                                                                is_stream: true,
                                                                error_message: None,
                                                                ip_address: None,
                                                            }).await;
                                                        });
                                                    }
                                                }
                                            }
                                        }
                                        Some((Ok::<_, std::io::Error>(chunk), (stream, false)))
                                    }
                                    Some(Err(e)) => {
                                        let err = Bytes::from(format!("event: error\ndata: {e}\n\n"));
                                        Some((Ok(err), (stream, true)))
                                    }
                                    None => None,
                                }
                            }
                        },
                    );

                    return Ok(Response::builder()
                        .status(StatusCode::OK)
                        .header("content-type", "text/event-stream")
                        .header("cache-control", "no-cache")
                        .body(Body::from_stream(body_stream))
                        .unwrap());
                } else {
                    // Non-streaming: read full response, bill, return
                    let resp_bytes = resp.bytes().await.map_err(|e| AppError::Internal(e.to_string()))?;
                    let latency = start.elapsed().as_millis() as i32;

                    let (prompt_tokens, completion_tokens) = if let Ok(parsed) = serde_json::from_slice::<AnthropicResponse>(&resp_bytes) {
                        (
                            parsed.usage.as_ref().and_then(|u| u.input_tokens).unwrap_or(0),
                            parsed.usage.as_ref().and_then(|u| u.output_tokens).unwrap_or(0),
                        )
                    } else {
                        (0, 0)
                    };
                    let total_tokens = prompt_tokens + completion_tokens;
                    let mut cost = token_counter::estimate_cost_from_db(&pool, &clean_model, prompt_tokens, completion_tokens).await;
                    if let Some(gm) = group_multiplier {
                        cost = (cost as f64 * gm).ceil() as i64;
                    }

                    let pool2 = pool.clone();
                    let model2 = clean_model.clone();
                    let relay_key_id = relay_key.id;
                    let user_id = user.id;
                    tokio::spawn(async move {
                        if let Ok(updated) = User::update_balance(&pool2, user_id, -cost).await {
                            let _ = BillingTransaction::create(
                                &pool2, user_id, "usage", -cost, updated.balance,
                                Some(&format!("API usage: {model2}")), None,
                            ).await;
                        }
                        let _ = RequestLog::create(&pool2, &CreateRequestLog {
                            user_id: Some(user_id),
                            relay_key_id: Some(relay_key_id),
                            provider_key_id: Some(provider_key_id),
                            channel_id: Some(channel_id),
                            model: model2,
                            method: "POST".into(),
                            path: "/v1/messages".into(),
                            status_code: 200,
                            prompt_tokens: prompt_tokens as i32,
                            completion_tokens: completion_tokens as i32,
                            total_tokens: total_tokens as i32,
                            cost,
                            latency_ms: latency,
                            is_stream: false,
                            error_message: None,
                            ip_address: None,
                        }).await;
                    });

                    return Ok(Response::builder()
                        .status(StatusCode::OK)
                        .header("content-type", "application/json")
                        .body(Body::from(resp_bytes))
                        .unwrap());
                }
            }
            Err(e) => {
                tracing::warn!("Provider {} key {} request failed: {e}", key.provider, key.name);
                last_err = Some((502, e.to_string()));
                continue;
            }
        }
    }

    let (status, msg) = last_err.unwrap_or((503, "All provider keys exhausted".into()));
    log_error(&pool, &relay_key, &user, &clean_model, status, &msg, start).await;
    Err(AppError::Internal(msg))
}

async fn log_error(pool: &PgPool, relay_key: &RelayKey, user: &User, model: &str, status: u16, msg: &str, start: Instant) {
    let latency = start.elapsed().as_millis() as i32;
    let _ = RequestLog::create(pool, &CreateRequestLog {
        user_id: Some(user.id),
        relay_key_id: Some(relay_key.id),
        provider_key_id: None,
        channel_id: None,
        model: model.to_string(),
        method: "POST".into(),
        path: "/v1/messages".into(),
        status_code: status as i32,
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
        cost: 0,
        latency_ms: latency,
        is_stream: false,
        error_message: Some(msg.to_string()),
        ip_address: None,
    }).await;
}
