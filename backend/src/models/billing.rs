use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

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

    pub async fn list_by_user(pool: &PgPool, user_id: Uuid, offset: i64, limit: i64) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as(
            "SELECT * FROM billing_transactions WHERE user_id = $1 ORDER BY created_at DESC OFFSET $2 LIMIT $3"
        )
        .bind(user_id)
        .bind(offset)
        .bind(limit)
        .fetch_all(pool)
        .await
    }

    pub async fn list_all(pool: &PgPool, offset: i64, limit: i64) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as(
            "SELECT * FROM billing_transactions ORDER BY created_at DESC OFFSET $1 LIMIT $2"
        )
        .bind(offset)
        .bind(limit)
        .fetch_all(pool)
        .await
    }
}
