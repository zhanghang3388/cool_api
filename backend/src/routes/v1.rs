use axum::extract::State;
use axum::http::HeaderMap;
use axum::response::Response;
use axum::routing::{get, post};
use axum::{Json, Router};
use bigdecimal::ToPrimitive;
use bytes::Bytes;
use serde::Serialize;

use crate::auth::ApiUser;
use crate::error::{AppError, AppResult};
use crate::models::ChannelProvider;
use crate::services::forwarding::{forward, ForwardInput};
use crate::upstream::Endpoint;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/chat/completions", post(chat_completions))
        .route("/responses", post(responses))
        .route("/usage", get(usage))
}

async fn chat_completions(
    State(state): State<AppState>,
    api: ApiUser,
    headers: HeaderMap,
    body_bytes: Bytes,
) -> AppResult<Response> {
    let parsed: IncomingRequest = serde_json::from_slice(&body_bytes)
        .map_err(|e| AppError::BadRequest(format!("invalid JSON body: {e}")))?;

    forward(
        state,
        api,
        ForwardInput {
            provider: ChannelProvider::Openai,
            endpoint: Endpoint::ChatCompletions,
            model_name: parsed.model,
            stream: parsed.stream,
            body: body_bytes,
            headers,
        },
    )
    .await
}

/// Codex CLI / Agents SDK / newer official OpenAI clients hit this endpoint
/// instead of `/chat/completions`. Same routing/billing, different upstream
/// URL and different SSE shape — handled inside the OpenAI adapter.
async fn responses(
    State(state): State<AppState>,
    api: ApiUser,
    headers: HeaderMap,
    body_bytes: Bytes,
) -> AppResult<Response> {
    let parsed: IncomingRequest = serde_json::from_slice(&body_bytes)
        .map_err(|e| AppError::BadRequest(format!("invalid JSON body: {e}")))?;

    forward(
        state,
        api,
        ForwardInput {
            provider: ChannelProvider::Openai,
            endpoint: Endpoint::Responses,
            model_name: parsed.model,
            stream: parsed.stream,
            body: body_bytes,
            headers,
        },
    )
    .await
}

#[derive(serde::Deserialize)]
struct IncomingRequest {
    model: String,
    #[serde(default)]
    stream: bool,
}

/// Account-balance endpoint polled by CC Switch (every ~30s by default).
/// Authenticated by the user's api key. Returns the owning user's remaining
/// balance in CNY (the unit used everywhere else in the project).
#[derive(Debug, Serialize)]
struct UsageResponse {
    /// CC Switch reads any of `remaining` / `quota.remaining` / `balance` —
    /// we surface all three so the script template doesn't need tweaking.
    remaining: f64,
    balance: f64,
    unit: &'static str,
    /// Whether the key itself is currently usable. Disabled keys would
    /// already 401 on the auth path, so by the time we get here it's TRUE.
    is_active: bool,
    is_valid: bool,
}

async fn usage(api: ApiUser) -> AppResult<Json<UsageResponse>> {
    // balance_cents is in 1/10000 CNY (see migration 0008). Convert to CNY
    // floats since CC Switch wants a number, not a fraction.
    let cents = api.user.balance_cents.max(0);
    let yuan = (cents as f64) / 10_000.0;
    // round to 4 decimal places so we don't print noise
    let yuan_rounded =
        (bigdecimal::BigDecimal::try_from(yuan).unwrap_or_default())
            .with_scale(4)
            .to_f64()
            .unwrap_or(yuan);
    Ok(Json(UsageResponse {
        remaining: yuan_rounded,
        balance: yuan_rounded,
        unit: "CNY",
        is_active: true,
        is_valid: true,
    }))
}
