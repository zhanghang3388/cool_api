use chrono::{DateTime, Utc};
use rand::distributions::Alphanumeric;
use rand::Rng;
use sha2::{Digest, Sha256};
use sqlx::PgPool;

use crate::error::{AppError, AppResult};
use crate::models::ApiKey;

const COLUMNS: &str =
    "id, user_id, group_id, name, key_prefix, key_hash, enabled, last_used_at, created_at";

/// Full plaintext key shown to the user exactly once. Format: `sk-ag-<32 chars>`.
pub struct GeneratedKey {
    pub plaintext: String,
    pub prefix: String,
    pub hash_hex: String,
}

pub fn generate_key() -> GeneratedKey {
    let random: String = rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(32)
        .map(char::from)
        .collect();
    let plaintext = format!("sk-ag-{random}");
    let prefix = plaintext.chars().take(10).collect::<String>();
    let hash_hex = hash_key(&plaintext);
    GeneratedKey {
        plaintext,
        prefix,
        hash_hex,
    }
}

pub fn hash_key(plaintext: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(plaintext.as_bytes());
    hex::encode(hasher.finalize())
}

pub async fn list_by_user(pool: &PgPool, user_id: i64) -> AppResult<Vec<ApiKey>> {
    let rows = sqlx::query_as::<_, ApiKey>(&format!(
        "SELECT {COLUMNS} FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC"
    ))
    .bind(user_id)
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn create(
    pool: &PgPool,
    user_id: i64,
    group_id: i64,
    name: &str,
    gen: &GeneratedKey,
) -> AppResult<ApiKey> {
    let row = sqlx::query_as::<_, ApiKey>(&format!(
        "INSERT INTO api_keys (user_id, group_id, name, key_prefix, key_hash, enabled)
         VALUES ($1, $2, $3, $4, $5, TRUE)
         RETURNING {COLUMNS}"
    ))
    .bind(user_id)
    .bind(group_id)
    .bind(name)
    .bind(&gen.prefix)
    .bind(&gen.hash_hex)
    .fetch_one(pool)
    .await?;
    Ok(row)
}

#[derive(Default)]
pub struct UpdateKey<'a> {
    pub name: Option<&'a str>,
    pub enabled: Option<bool>,
    pub group_id: Option<i64>,
}

pub async fn update(
    pool: &PgPool,
    user_id: i64,
    id: i64,
    patch: UpdateKey<'_>,
) -> AppResult<ApiKey> {
    let row = sqlx::query_as::<_, ApiKey>(&format!(
        "UPDATE api_keys SET
            name     = COALESCE($3, name),
            enabled  = COALESCE($4, enabled),
            group_id = COALESCE($5, group_id)
         WHERE id = $1 AND user_id = $2
         RETURNING {COLUMNS}"
    ))
    .bind(id)
    .bind(user_id)
    .bind(patch.name)
    .bind(patch.enabled)
    .bind(patch.group_id)
    .fetch_optional(pool)
    .await?
    .ok_or(AppError::NotFound)?;
    Ok(row)
}

pub async fn delete(pool: &PgPool, user_id: i64, id: i64) -> AppResult<()> {
    let result = sqlx::query("DELETE FROM api_keys WHERE id = $1 AND user_id = $2")
        .bind(id)
        .bind(user_id)
        .execute(pool)
        .await?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(())
}

#[allow(dead_code)]
pub async fn find_active_by_hash(pool: &PgPool, hash_hex: &str) -> AppResult<Option<ApiKey>> {
    let row = sqlx::query_as::<_, ApiKey>(&format!(
        "SELECT {COLUMNS} FROM api_keys WHERE key_hash = $1 AND enabled = TRUE"
    ))
    .bind(hash_hex)
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

#[allow(dead_code)]
pub async fn touch_last_used(pool: &PgPool, id: i64, when: DateTime<Utc>) -> AppResult<()> {
    sqlx::query("UPDATE api_keys SET last_used_at = $2 WHERE id = $1")
        .bind(id)
        .bind(when)
        .execute(pool)
        .await?;
    Ok(())
}
