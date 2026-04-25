use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

use crate::models::request_log::{CreateRequestLog, RequestLog};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct BillingTransaction {
    pub id: Uuid,
    pub user_id: Uuid,
    #[sqlx(rename = "type")]
    #[serde(rename = "type")]
    pub tx_type: String,
    pub amount: i64,
    pub balance_after: i64,
    pub description: Option<String>,
    pub request_log_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
}

impl BillingTransaction {
    pub async fn record_usage(
        pool: &PgPool,
        user_id: Uuid,
        input: &CreateRequestLog,
        description: Option<&str>,
    ) -> Result<Option<RequestLog>, sqlx::Error> {
        let cost = input.cost.max(0);
        let mut tx = pool.begin().await?;

        let balance_after = if cost > 0 {
            let updated: Option<(i64,)> = sqlx::query_as(
                "UPDATE users
                 SET balance = balance - $1, updated_at = now()
                 WHERE id = $2 AND balance >= $1
                 RETURNING balance",
            )
            .bind(cost)
            .bind(user_id)
            .fetch_optional(&mut *tx)
            .await?;

            let Some((balance,)) = updated else {
                tx.rollback().await?;
                return Ok(None);
            };
            Some(balance)
        } else {
            None
        };

        let log: RequestLog = sqlx::query_as(
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
        .bind(cost)
        .bind(input.latency_ms)
        .bind(input.is_stream)
        .bind(&input.error_message)
        .bind(&input.ip_address)
        .bind(input.cache_creation_tokens)
        .bind(input.cache_read_tokens)
        .fetch_one(&mut *tx)
        .await?;

        if let Some(balance_after) = balance_after {
            sqlx::query_as::<_, BillingTransaction>(
                "INSERT INTO billing_transactions (user_id, type, amount, balance_after, description, request_log_id)
                 VALUES ($1, $2, $3, $4, $5, $6) RETURNING *"
            )
            .bind(user_id)
            .bind("usage")
            .bind(-cost)
            .bind(balance_after)
            .bind(description)
            .bind(log.id)
            .fetch_one(&mut *tx)
            .await?;
        }

        tx.commit().await?;
        Ok(Some(log))
    }

    pub async fn create(
        pool: &PgPool,
        user_id: Uuid,
        tx_type: &str,
        amount: i64,
        balance_after: i64,
        description: Option<&str>,
        request_log_id: Option<Uuid>,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query_as(
            "INSERT INTO billing_transactions (user_id, type, amount, balance_after, description, request_log_id)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *"
        )
        .bind(user_id)
        .bind(tx_type)
        .bind(amount)
        .bind(balance_after)
        .bind(description)
        .bind(request_log_id)
        .fetch_one(pool)
        .await
    }

    pub async fn list_by_user(
        pool: &PgPool,
        user_id: Uuid,
        offset: i64,
        limit: i64,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as(
            "SELECT * FROM billing_transactions WHERE user_id = $1 ORDER BY created_at DESC OFFSET $2 LIMIT $3"
        )
        .bind(user_id)
        .bind(offset)
        .bind(limit)
        .fetch_all(pool)
        .await
    }

    pub async fn list_all(
        pool: &PgPool,
        offset: i64,
        limit: i64,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as(
            "SELECT * FROM billing_transactions ORDER BY created_at DESC OFFSET $1 LIMIT $2",
        )
        .bind(offset)
        .bind(limit)
        .fetch_all(pool)
        .await
    }
}
