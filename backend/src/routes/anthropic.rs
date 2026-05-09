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
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route("/v1/messages", post(messages))
}

async fn messages(
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
            provider: ChannelProvider::Anthropic,
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
