use axum::extract::State;
use axum::http::HeaderMap;
use axum::response::Response;
use axum::routing::post;
use axum::Router;
use bytes::Bytes;

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
