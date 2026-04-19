use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct RequestLog {
    pub id: Uuid,
    pub user_id: Option<Uuid>,
    pub relay_key_id: Option<Uuid>,
    pub provider_key_id: Option<Uuid>,
    pub channel_id: Option<Uuid>,
    pub model: String,
    pub method: String,
    pub path: String,
    pub status_code: i32,
    pub prompt_tokens: i32,
    pub completion_tokens: i32,
    pub total_tokens: i32,
    pub cost: i64,
    pub latency_ms: i32,
    pub is_stream: bool,
    pub error_message: Option<String>,
    pub ip_address: Option<String>,
    pub cache_creation_tokens: i32,
    pub cache_read_tokens: i32,
    pub created_at: DateTime<Utc>,
}

pub struct CreateRequestLog {
    pub user_id: Option<Uuid>,
    pub relay_key_id: Option<Uuid>,
    pub provider_key_id: Option<Uuid>,
    pub channel_id: Option<Uuid>,
    pub model: String,
    pub method: String,
    pub path: String,
    pub status_code: i32,
    pub prompt_tokens: i32,
    pub completion_tokens: i32,
    pub total_tokens: i32,
    pub cost: i64,
    pub latency_ms: i32,
    pub is_stream: bool,
    pub error_message: Option<String>,
    pub ip_address: Option<String>,
    pub cache_creation_tokens: i32,
    pub cache_read_tokens: i32,
}

impl RequestLog {
    pub async fn create(pool: &PgPool, input: &CreateRequestLog) -> Result<Self, sqlx::Error> {
        sqlx::query_as(
            "INSERT INTO request_logs (user_id, relay_key_id, provider_key_id, channel_id, model, method, path, status_code, prompt_tokens, completion_tokens, total_tokens, cost, latency_ms, is_stream, error_message, ip_address, cache_creation_tokens, cache_read_tokens)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) RETURNING *"
        )
        .bind(input.user_id)
        .bind(input.relay_key_id)
        .bind(input.provider_key_id)
        .bind(input.channel_id)
        .bind(&input.model)
        .bind(&input.method)
        .bind(&input.path)
        .bind(input.status_code)
        .bind(input.prompt_tokens)
        .bind(input.completion_tokens)
        .bind(input.total_tokens)
        .bind(input.cost)
        .bind(input.latency_ms)
        .bind(input.is_stream)
        .bind(&input.error_message)
        .bind(&input.ip_address)
        .bind(input.cache_creation_tokens)
        .bind(input.cache_read_tokens)
        .fetch_one(pool)
        .await
    }

    pub async fn list_by_user(pool: &PgPool, user_id: Uuid, offset: i64, limit: i64) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as(
            "SELECT * FROM request_logs WHERE user_id = $1 ORDER BY created_at DESC OFFSET $2 LIMIT $3"
        )
        .bind(user_id)
        .bind(offset)
        .bind(limit)
        .fetch_all(pool)
        .await
    }

    pub async fn list_all(pool: &PgPool, offset: i64, limit: i64) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as(
            "SELECT * FROM request_logs ORDER BY created_at DESC OFFSET $1 LIMIT $2"
        )
        .bind(offset)
        .bind(limit)
        .fetch_all(pool)
        .await
    }
}
