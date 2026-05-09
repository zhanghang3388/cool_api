use bigdecimal::BigDecimal;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Clone, Copy, PartialEq, Eq, sqlx::Type, Serialize, Deserialize)]
#[sqlx(type_name = "request_status", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum RequestStatus {
    Success,
    Error,
    Cached,
}

#[derive(Debug, Clone, FromRow)]
pub struct RequestLog {
    pub id: i64,
    pub user_id: i64,
    pub channel_id: Option<i64>,
    pub group_id: i64,
    pub model_name: String,
    pub prompt_tokens: i32,
    pub completion_tokens: i32,
    pub cached_tokens: i32,
    pub input_cost_cents: i64,
    pub output_cost_cents: i64,
    pub total_cost_cents: i64,
    pub multiplier_applied: BigDecimal,
    pub latency_ms: i32,
    pub status: RequestStatus,
    pub error_message: Option<String>,
    pub created_at: DateTime<Utc>,
}
