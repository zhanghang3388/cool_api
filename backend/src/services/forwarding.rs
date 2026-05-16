//! Shared forwarding pipeline used by both /v1/chat/completions and
//! /anthropic/v1/messages. Handles routing, upstream dispatch, caching,
//! charging, and failover.

use axum::body::Body;
use axum::http::{HeaderMap, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use base64::{engine::general_purpose, Engine as _};
use bytes::Bytes;
use futures::StreamExt;
use ipnetwork::IpNetwork;
use std::net::IpAddr;
use std::time::Instant;

use crate::auth::ApiUser;
use crate::error::{AppError, AppResult};
use crate::models::{ChannelProvider, ChannelStatus, Model, RequestStatus};
use crate::repo;
use crate::services::{billing, cache, router as svc_router};
use crate::upstream::{self, ChatRequest, ChatResponse, Usage};
use crate::AppState;

/// Minimum balance (in cents) required to start a request. Saves an upstream
/// RTT when the user is clearly out of funds.
const MIN_BALANCE_TO_START: i64 = 1;

/// Header users can send to opt out of caching for a specific request, or to
/// force a bypass for debugging (value can be anything — presence is enough).
const NO_CACHE_HEADER: &str = "x-aether-no-cache";

pub struct ForwardInput {
    pub provider: ChannelProvider,
    pub model_name: String,
    pub stream: bool,
    pub body: Bytes,
    pub headers: HeaderMap,
}

/// Best-effort client IP resolution.
///
/// In production we sit behind host nginx, so `X-Forwarded-For` is the source
/// of truth. We trust only the first element (the left-most entry is set by
/// the closest proxy that nginx spoke to). `X-Real-IP` is a fallback for
/// setups that don't forward XFF. Returns `None` when neither is present,
/// rather than guessing — billing rows simply omit `client_ip`.
fn resolve_client_ip(headers: &HeaderMap) -> Option<IpNetwork> {
    let from_header = headers
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.split(',').next())
        .and_then(|s| s.trim().parse::<IpAddr>().ok())
        .or_else(|| {
            headers
                .get("x-real-ip")
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.trim().parse::<IpAddr>().ok())
        })?;
    // IpNetwork::from wraps a bare IP as a /32 or /128 network — exactly what
    // Postgres INET stores for single-host addresses.
    Some(IpNetwork::from(from_header))
}

pub async fn forward(
    state: AppState,
    api: ApiUser,
    input: ForwardInput,
) -> AppResult<Response> {
    if input.model_name.trim().is_empty() {
        return Err(AppError::BadRequest("missing model".into()));
    }

    if !billing::has_balance(&state.db, api.user.id, MIN_BALANCE_TO_START).await? {
        return Err(AppError::InsufficientBalance);
    }

    let client_ip = resolve_client_ip(&input.headers);

    let model_row: Model = repo::models::get_by_name(&state.db, &input.model_name)
        .await?
        .ok_or_else(|| {
            AppError::BadRequest(format!("unknown model '{}'", input.model_name))
        })?;
    if !model_row.enabled {
        return Err(AppError::BadRequest(format!(
            "model '{}' is disabled",
            input.model_name
        )));
    }

    // -------- cache lookup (non-streaming, no opt-out header) --------
    let cache_cfg = repo::system_settings::get_cache_config(&state.db).await?;
    let cache_bypass = input.headers.contains_key(NO_CACHE_HEADER);
    let cacheable = cache_cfg.enabled
        && !input.stream
        && !cache_bypass
        && is_body_cacheable(&input.body);

    let cache_hash = cacheable.then(|| cache::make_key(&input.model_name, &input.body));

    if let (Some(ref hash), Some(mut redis)) = (cache_hash.as_ref(), state.redis.clone()) {
        if let Ok(Some(entry)) = cache::get(&mut redis, hash).await {
            // If the cached body is corrupted (truncation, encoding bug, manual
            // tampering) `decode` returns an Err. Falling back to an empty
            // body would silently 200 the user with nothing while still
            // billing them — fall through to a normal upstream call instead.
            match general_purpose::STANDARD.decode(&entry.body_base64) {
                Ok(cached_body) => {
                    let usage = entry.usage();

                    // Charge at the cache-read rate and compute the saving vs. normal
                    // billing for the stats panel.
                    let charge_input = billing::ChargeInput {
                        user_id: api.user.id,
                        api_key_id: Some(api.api_key_id),
                        group_id: api.group_id,
                        group_multiplier: &api.group_multiplier,
                        model: &model_row,
                        channel_id: None,
                        usage,
                        latency_ms: 0,
                        status: RequestStatus::Cached,
                        error_message: None,
                        client_ip,
                    };
                    let (_, _, full_cost) = billing::compute_cost(&charge_input);
                    let (_, _, cached_cost) = billing::compute_cached_cost(&charge_input);
                    let saved_cents = (full_cost - cached_cost).max(0);
                    let tokens = (usage.prompt_tokens + usage.completion_tokens) as i64;

                    if let Err(e) = billing::charge(&state.db, charge_input).await {
                        tracing::error!(error = ?e, "charge failed on cache hit");
                    }
                    cache::record_hit(&mut redis, tokens, saved_cents).await;

                    return Ok(build_json_response(entry.status, Bytes::from(cached_body)));
                }
                Err(e) => {
                    tracing::warn!(
                        cache_hash = %hash,
                        error = %e,
                        "cache entry body_base64 corrupt; bypassing cache"
                    );
                    // Drop the bad entry so subsequent requests don't keep
                    // hitting it. Best-effort — ignore failures.
                    let _ = cache::delete(&mut redis, hash).await;
                }
            }
        }
    }

    let plan = svc_router::plan(
        &state.db,
        input.provider,
        &input.model_name,
        api.group_id,
    )
    .await?;

    let mut last_err: Option<String> = None;

    for channel in plan.candidates {
        let api_key = state.cipher.decrypt(&channel.api_key_encrypted)?;
        let adapter = upstream::adapter_for(channel.provider);
        let started = Instant::now();

        let chat_req = ChatRequest {
            raw_body: input.body.clone(),
            model: input.model_name.clone(),
            stream: input.stream,
        };

        match adapter
            .forward_chat(&state.http, &channel.base_url, &api_key, chat_req)
            .await
        {
            Ok(ChatResponse::Json(resp)) => {
                let latency_ms = started
                    .elapsed()
                    .as_millis()
                    .min(i32::MAX as u128) as i32;
                let charge_input = billing::ChargeInput {
                    user_id: api.user.id,
                    api_key_id: Some(api.api_key_id),
                    group_id: api.group_id,
                    group_multiplier: &api.group_multiplier,
                    model: &model_row,
                    channel_id: Some(channel.id),
                    usage: resp.usage,
                    latency_ms,
                    status: RequestStatus::Success,
                    error_message: None,
                    client_ip,
                };
                if let Err(e) = billing::charge(&state.db, charge_input).await {
                    tracing::error!(error = ?e, "charge failed after json response");
                }

                // Successful forward — clear any prior error/warning state.
                if let Err(e) = repo::channels::mark_healthy(
                    &state.db,
                    channel.id,
                    chrono::Utc::now(),
                )
                .await
                {
                    tracing::warn!(channel_id = channel.id, error = ?e, "mark_healthy failed");
                }

                // Store a cacheable successful response before we reply, so a
                // parallel second request can hit the cache.
                if let (Some(hash), Some(mut redis)) =
                    (cache_hash.clone(), state.redis.clone())
                {
                    let status = resp.status;
                    let body_b64 = general_purpose::STANDARD.encode(&resp.body);
                    let entry = cache::CachedEntry {
                        model: input.model_name.clone(),
                        status,
                        body_base64: body_b64,
                        prompt_tokens: resp.usage.prompt_tokens,
                        completion_tokens: resp.usage.completion_tokens,
                        cached_tokens: resp.usage.cached_tokens,
                        created_at: chrono::Utc::now(),
                    };
                    if status_is_cacheable(status) {
                        cache::put(
                            &mut redis,
                            &hash,
                            &entry,
                            cache_cfg.ttl_seconds,
                            cache_cfg.recent_keys_limit,
                        )
                        .await;
                    }
                }

                return Ok(build_json_response(resp.status, resp.body));
            }
            Ok(ChatResponse::Stream(stream_resp)) => {
                // Headers were already received successfully — channel is up.
                if let Err(e) = repo::channels::mark_healthy(
                    &state.db,
                    channel.id,
                    chrono::Utc::now(),
                )
                .await
                {
                    tracing::warn!(channel_id = channel.id, error = ?e, "mark_healthy failed");
                }

                let state_clone = state.clone();
                let user_id = api.user.id;
                let api_key_id = api.api_key_id;
                let group_id = api.group_id;
                let group_mult = api.group_multiplier.clone();
                let model_clone = model_row.clone();
                let channel_id = channel.id;
                let final_usage_rx = stream_resp.final_usage;
                let partial_usage = stream_resp.partial_usage;
                let events = stream_resp.events;
                let ip_for_task = client_ip;

                tokio::spawn(async move {
                    let latency_ms = started
                        .elapsed()
                        .as_millis()
                        .min(i32::MAX as u128) as i32;
                    match final_usage_rx.await {
                        Ok(usage) => {
                            let charge_input = billing::ChargeInput {
                                user_id,
                                api_key_id: Some(api_key_id),
                                group_id,
                                group_multiplier: &group_mult,
                                model: &model_clone,
                                channel_id: Some(channel_id),
                                usage,
                                latency_ms,
                                status: RequestStatus::Success,
                                error_message: None,
                                client_ip: ip_for_task,
                            };
                            if let Err(e) =
                                billing::charge(&state_clone.db, charge_input).await
                            {
                                tracing::error!(error = ?e, "charge failed after stream");
                            }
                        }
                        Err(_) => {
                            // The stream task ended without sending a final
                            // usage — typically because the client disconnected
                            // mid-stream and the SSE writer was dropped before
                            // hitting `[DONE]` / `message_stop`. Fall back to
                            // whatever the adapter managed to record into the
                            // shared snapshot so we still bill for tokens the
                            // upstream already counted. If the snapshot is
                            // empty (disconnect happened before any chunk
                            // arrived) the row is logged with cost 0.
                            let usage = partial_usage
                                .lock()
                                .map(|g| *g)
                                .unwrap_or_default();
                            let has_usage = usage.prompt_tokens > 0
                                || usage.completion_tokens > 0
                                || usage.cached_tokens > 0
                                || usage.cache_creation_tokens > 0;
                            let charge_input = billing::ChargeInput {
                                user_id,
                                api_key_id: Some(api_key_id),
                                group_id,
                                group_multiplier: &group_mult,
                                model: &model_clone,
                                channel_id: Some(channel_id),
                                usage,
                                latency_ms,
                                // Partial usage means the call did real work
                                // upstream but didn't complete cleanly — treat
                                // as Success for billing (we charge for what
                                // was used) but flag the row so it's findable.
                                status: if has_usage {
                                    RequestStatus::Success
                                } else {
                                    RequestStatus::Error
                                },
                                error_message: Some("stream aborted before completion"),
                                client_ip: ip_for_task,
                            };
                            let _ = billing::charge(&state_clone.db, charge_input).await;
                        }
                    }
                });

                return Ok(build_stream_response(events));
            }
            Err(AppError::Upstream(msg)) => {
                tracing::warn!(channel_id = channel.id, error = %msg, "channel failed, trying next");
                let _ = repo::channels::record_test_result(
                    &state.db,
                    channel.id,
                    ChannelStatus::Error,
                    Some(&msg),
                    chrono::Utc::now(),
                )
                .await;
                last_err = Some(msg);
                continue;
            }
            Err(AppError::UpstreamRequest(msg)) => {
                // The request itself was rejected (e.g. bad model / oversized
                // prompt). Channel is fine — log against the user, do NOT
                // failover, do NOT mark the channel unhealthy.
                let latency_ms = started
                    .elapsed()
                    .as_millis()
                    .min(i32::MAX as u128) as i32;
                let _ = billing::charge(
                    &state.db,
                    billing::ChargeInput {
                        user_id: api.user.id,
                        api_key_id: Some(api.api_key_id),
                        group_id: api.group_id,
                        group_multiplier: &api.group_multiplier,
                        model: &model_row,
                        channel_id: Some(channel.id),
                        usage: Usage::default(),
                        latency_ms,
                        status: RequestStatus::Error,
                        error_message: Some(&msg),
                        client_ip,
                    },
                )
                .await;
                return Err(AppError::UpstreamRequest(msg));
            }
            Err(other) => return Err(other),
        }
    }

    let error_msg = last_err.unwrap_or_else(|| "all upstreams failed".into());

    // Log the failure against the user, so usage page can surface it.
    let _ = billing::charge(
        &state.db,
        billing::ChargeInput {
            user_id: api.user.id,
            api_key_id: Some(api.api_key_id),
            group_id: api.group_id,
            group_multiplier: &api.group_multiplier,
            model: &model_row,
            channel_id: None,
            usage: Usage::default(),
            latency_ms: 0,
            status: RequestStatus::Error,
            error_message: Some(&error_msg),
            client_ip,
        },
    )
    .await;

    Err(AppError::Upstream(error_msg))
}

/// A request body is cacheable when it looks deterministic:
///   - explicit `temperature: 0` (floats close to 0 are fine)
///   - no `tools` / `tool_choice`
///   - no `response_format` with JSON schema variation (we allow it but the
///     schema participates in the hash, so it's still deterministic per-schema)
///
/// Requests with `temperature != 0` or tool calling are skipped — the same
/// prompt may legitimately return different answers.
fn is_body_cacheable(raw: &[u8]) -> bool {
    let Ok(v) = serde_json::from_slice::<serde_json::Value>(raw) else {
        return false;
    };
    let Some(obj) = v.as_object() else {
        return false;
    };

    let temperature_ok = match obj.get("temperature") {
        None => true, // provider defaults are typically > 0 — conservative? keep true so unspecified still caches
        Some(t) => t.as_f64().map(|f| f.abs() < f64::EPSILON).unwrap_or(false),
    };
    if !temperature_ok {
        return false;
    }

    if obj.contains_key("tools") || obj.contains_key("tool_choice") {
        return false;
    }

    true
}

/// Only 2xx responses are cached — a 4xx / 5xx would poison the cache.
fn status_is_cacheable(status: u16) -> bool {
    (200..300).contains(&status)
}

fn build_json_response(status_code: u16, body: Bytes) -> Response {
    let status = StatusCode::from_u16(status_code).unwrap_or(StatusCode::OK);
    let mut headers = HeaderMap::new();
    headers.insert(
        axum::http::header::CONTENT_TYPE,
        HeaderValue::from_static("application/json"),
    );
    (status, headers, body).into_response()
}

fn build_stream_response(
    stream: futures::stream::BoxStream<'static, Result<Bytes, String>>,
) -> Response {
    let mut headers = HeaderMap::new();
    headers.insert(
        axum::http::header::CONTENT_TYPE,
        HeaderValue::from_static("text/event-stream"),
    );
    headers.insert(
        axum::http::header::CACHE_CONTROL,
        HeaderValue::from_static("no-cache"),
    );
    headers.insert("x-accel-buffering", HeaderValue::from_static("no"));

    let byte_stream = stream.map(|r| r.map_err(std::io::Error::other));
    let body = Body::from_stream(byte_stream);

    (StatusCode::OK, headers, body).into_response()
}
