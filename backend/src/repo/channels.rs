use chrono::{DateTime, Utc};
use sqlx::PgPool;

use crate::error::{AppError, AppResult};
use crate::models::{Channel, ChannelProvider, ChannelStatus};

const COLUMNS: &str = "id, name, provider, base_url, api_key_encrypted, priority, weight, \
    enabled, status, allowed_models, allowed_group_ids, balance_cents, \
    last_test_at, last_error, created_at, updated_at";

pub async fn list(pool: &PgPool) -> AppResult<Vec<Channel>> {
    let rows = sqlx::query_as::<_, Channel>(&format!(
        "SELECT {COLUMNS} FROM channels ORDER BY priority ASC, id ASC"
    ))
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn get(pool: &PgPool, id: i64) -> AppResult<Channel> {
    sqlx::query_as::<_, Channel>(&format!(
        "SELECT {COLUMNS} FROM channels WHERE id = $1"
    ))
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or(AppError::NotFound)
}

pub struct NewChannel<'a> {
    pub name: &'a str,
    pub provider: ChannelProvider,
    pub base_url: &'a str,
    pub api_key_encrypted: &'a str,
    pub priority: i32,
    pub weight: i32,
    pub enabled: bool,
    pub allowed_models: Vec<String>,
    pub allowed_group_ids: Vec<i64>,
}

pub async fn create(pool: &PgPool, new: NewChannel<'_>) -> AppResult<Channel> {
    let row = sqlx::query_as::<_, Channel>(&format!(
        "INSERT INTO channels (name, provider, base_url, api_key_encrypted, priority, weight,
                               enabled, allowed_models, allowed_group_ids)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING {COLUMNS}"
    ))
    .bind(new.name)
    .bind(new.provider)
    .bind(new.base_url)
    .bind(new.api_key_encrypted)
    .bind(new.priority)
    .bind(new.weight)
    .bind(new.enabled)
    .bind(&new.allowed_models)
    .bind(&new.allowed_group_ids)
    .fetch_one(pool)
    .await?;
    Ok(row)
}

#[derive(Default)]
pub struct UpdateChannel<'a> {
    pub name: Option<&'a str>,
    pub base_url: Option<&'a str>,
    /// `Some(ciphertext)` rotates the key; `None` keeps it.
    pub api_key_encrypted: Option<&'a str>,
    pub priority: Option<i32>,
    pub weight: Option<i32>,
    pub enabled: Option<bool>,
    pub allowed_models: Option<Vec<String>>,
    pub allowed_group_ids: Option<Vec<i64>>,
}

pub async fn update(pool: &PgPool, id: i64, patch: UpdateChannel<'_>) -> AppResult<Channel> {
    let row = sqlx::query_as::<_, Channel>(&format!(
        "UPDATE channels SET
            name               = COALESCE($2, name),
            base_url           = COALESCE($3, base_url),
            api_key_encrypted  = COALESCE($4, api_key_encrypted),
            priority           = COALESCE($5, priority),
            weight             = COALESCE($6, weight),
            enabled            = COALESCE($7, enabled),
            allowed_models     = COALESCE($8, allowed_models),
            allowed_group_ids  = COALESCE($9, allowed_group_ids),
            updated_at         = NOW()
         WHERE id = $1
         RETURNING {COLUMNS}"
    ))
    .bind(id)
    .bind(patch.name)
    .bind(patch.base_url)
    .bind(patch.api_key_encrypted)
    .bind(patch.priority)
    .bind(patch.weight)
    .bind(patch.enabled)
    .bind(patch.allowed_models)
    .bind(patch.allowed_group_ids)
    .fetch_optional(pool)
    .await?
    .ok_or(AppError::NotFound)?;
    Ok(row)
}

pub async fn delete(pool: &PgPool, id: i64) -> AppResult<()> {
    let result = sqlx::query("DELETE FROM channels WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(())
}

pub async fn record_test_result(
    pool: &PgPool,
    id: i64,
    status: ChannelStatus,
    last_error: Option<&str>,
    tested_at: DateTime<Utc>,
) -> AppResult<()> {
    sqlx::query(
        "UPDATE channels SET status = $2, last_error = $3, last_test_at = $4, updated_at = NOW()
         WHERE id = $1",
    )
    .bind(id)
    .bind(status)
    .bind(last_error)
    .bind(tested_at)
    .execute(pool)
    .await?;
    Ok(())
}
