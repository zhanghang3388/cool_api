use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("unauthorized")]
    Unauthorized,

    #[error("forbidden")]
    Forbidden,

    #[error("not found")]
    NotFound,

    #[error("bad request: {0}")]
    BadRequest(String),

    #[error("conflict: {0}")]
    Conflict(String),

    #[error("insufficient balance")]
    InsufficientBalance,

    #[error("no available channel for model {0}")]
    NoAvailableChannel(String),

    #[error("upstream error: {0}")]
    Upstream(String),

    /// Upstream rejected the request because of the request itself (4xx other
    /// than auth / rate-limit). Surfaced to the caller as 400 — the channel is
    /// fine, the request body is the problem, so the router must not failover
    /// or mark the channel unhealthy.
    #[error("upstream rejected request: {0}")]
    UpstreamRequest(String),

    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("redis error: {0}")]
    Redis(#[from] redis::RedisError),

    #[error("http client error: {0}")]
    Http(#[from] reqwest::Error),

    #[error("internal error: {0}")]
    Internal(String),
}

impl AppError {
    fn status(&self) -> StatusCode {
        match self {
            Self::Unauthorized => StatusCode::UNAUTHORIZED,
            Self::Forbidden => StatusCode::FORBIDDEN,
            Self::NotFound => StatusCode::NOT_FOUND,
            Self::BadRequest(_) => StatusCode::BAD_REQUEST,
            Self::Conflict(_) => StatusCode::CONFLICT,
            Self::InsufficientBalance => StatusCode::PAYMENT_REQUIRED,
            Self::NoAvailableChannel(_) => StatusCode::SERVICE_UNAVAILABLE,
            Self::Upstream(_) => StatusCode::BAD_GATEWAY,
            Self::UpstreamRequest(_) => StatusCode::BAD_REQUEST,
            Self::Database(_) | Self::Redis(_) | Self::Http(_) | Self::Internal(_) => {
                StatusCode::INTERNAL_SERVER_ERROR
            }
        }
    }

    fn error_code(&self) -> &'static str {
        match self {
            Self::Unauthorized => "unauthorized",
            Self::Forbidden => "forbidden",
            Self::NotFound => "not_found",
            Self::BadRequest(_) => "bad_request",
            Self::Conflict(_) => "conflict",
            Self::InsufficientBalance => "insufficient_balance",
            Self::NoAvailableChannel(_) => "no_available_channel",
            Self::Upstream(_) => "upstream_error",
            Self::UpstreamRequest(_) => "upstream_request_rejected",
            _ => "internal_error",
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let status = self.status();
        let code = self.error_code();
        let message = self.to_string();

        if status.is_server_error() {
            tracing::error!(error = ?self, "request failed");
        } else {
            tracing::warn!(error = %message, code, "request rejected");
        }

        let body = Json(json!({
            "error": { "code": code, "message": message }
        }));
        (status, body).into_response()
    }
}

pub type AppResult<T> = Result<T, AppError>;
