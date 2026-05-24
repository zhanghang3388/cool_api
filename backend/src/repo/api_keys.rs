use chrono::{DateTime, Utc};
use rand::distributions::Alphanumeric;
use rand::Rng;
use sha2::{Digest, Sha256};
use sqlx::{PgPool, Postgres, Transaction};
use std::collections::HashMap;

use crate::error::{AppError, AppResult};
use crate::models::{ApiKey, ChannelProvider};

const COLUMNS: &str =
    "id, user_id, name, key_prefix, key_hash, key_plaintext, enabled, last_used_at, created_at";

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

/// Per-provider group binding for one or more api keys. `groups_for_keys`
/// returns a map keyed by api_key_id; callers walk it to enrich response DTOs.
pub async fn groups_for_keys(
    pool: &PgPool,
    key_ids: &[i64],
) -> AppResult<HashMap<i64, HashMap<ChannelProvider, i64>>> {
    if key_ids.is_empty() {
        return Ok(HashMap::new());
    }
    let rows: Vec<(i64, ChannelProvider, i64)> = sqlx::query_as(
        "SELECT api_key_id, provider, group_id FROM api_key_groups WHERE api_key_id = ANY($1)",
    )
    .bind(key_ids)
    .fetch_all(pool)
    .await?;
    let mut out: HashMap<i64, HashMap<ChannelProvider, i64>> = HashMap::new();
    for (kid, prov, gid) in rows {
        out.entry(kid).or_default().insert(prov, gid);
    }
    Ok(out)
}

pub async fn groups_for_key(
    pool: &PgPool,
    api_key_id: i64,
) -> AppResult<HashMap<ChannelProvider, i64>> {
    let rows: Vec<(ChannelProvider, i64)> = sqlx::query_as(
        "SELECT provider, group_id FROM api_key_groups WHERE api_key_id = $1",
    )
    .bind(api_key_id)
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().collect())
}

/// Find the group_id bound to (api_key, provider). Used by the forwarding
/// pipeline to resolve which pricing tier applies to the inbound request.
#[allow(dead_code)]
pub async fn group_for_key_provider(
    pool: &PgPool,
    api_key_id: i64,
    provider: ChannelProvider,
) -> AppResult<Option<i64>> {
    let row: Option<(i64,)> = sqlx::query_as(
        "SELECT group_id FROM api_key_groups WHERE api_key_id = $1 AND provider = $2",
    )
    .bind(api_key_id)
    .bind(provider)
    .fetch_optional(pool)
    .await?;
    Ok(row.map(|(g,)| g))
}

pub struct CreateApiKey<'a> {
    pub user_id: i64,
    pub name: &'a str,
    /// One group per provider — at least one entry required.
    pub groups: &'a [(ChannelProvider, i64)],
    pub generated: &'a GeneratedKey,
}

pub async fn create(pool: &PgPool, input: CreateApiKey<'_>) -> AppResult<ApiKey> {
    let mut tx: Transaction<'_, Postgres> = pool.begin().await?;
    let row = sqlx::query_as::<_, ApiKey>(&format!(
        "INSERT INTO api_keys (user_id, name, key_prefix, key_hash, key_plaintext, enabled)
         VALUES ($1, $2, $3, $4, $5, TRUE)
         RETURNING {COLUMNS}"
    ))
    .bind(input.user_id)
    .bind(input.name)
    .bind(&input.generated.prefix)
    .bind(&input.generated.hash_hex)
    .bind(&input.generated.plaintext)
    .fetch_one(&mut *tx)
    .await?;

    for (provider, group_id) in input.groups {
        sqlx::query(
            "INSERT INTO api_key_groups (api_key_id, provider, group_id) VALUES ($1, $2, $3)",
        )
        .bind(row.id)
        .bind(*provider)
        .bind(*group_id)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;
    Ok(row)
}

#[derive(Default)]
pub struct UpdateKey<'a> {
    pub name: Option<&'a str>,
    pub enabled: Option<bool>,
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
            enabled  = COALESCE($4, enabled)
         WHERE id = $1 AND user_id = $2
         RETURNING {COLUMNS}"
    ))
    .bind(id)
    .bind(user_id)
    .bind(patch.name)
    .bind(patch.enabled)
    .fetch_optional(pool)
    .await?
    .ok_or(AppError::NotFound)?;
    Ok(row)
}

/// Replace the per-provider group bindings for an api key. `bindings` is the
/// full new state — anything not listed is removed.
pub async fn replace_groups(
    pool: &PgPool,
    api_key_id: i64,
    bindings: &[(ChannelProvider, i64)],
) -> AppResult<()> {
    let mut tx: Transaction<'_, Postgres> = pool.begin().await?;
    sqlx::query("DELETE FROM api_key_groups WHERE api_key_id = $1")
        .bind(api_key_id)
        .execute(&mut *tx)
        .await?;
    for (provider, group_id) in bindings {
        sqlx::query(
            "INSERT INTO api_key_groups (api_key_id, provider, group_id) VALUES ($1, $2, $3)",
        )
        .bind(api_key_id)
        .bind(*provider)
        .bind(*group_id)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(())
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

pub async fn find_active_by_hash(pool: &PgPool, hash_hex: &str) -> AppResult<Option<ApiKey>> {
    let row = sqlx::query_as::<_, ApiKey>(&format!(
        "SELECT {COLUMNS} FROM api_keys WHERE key_hash = $1 AND enabled = TRUE"
    ))
    .bind(hash_hex)
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

pub async fn touch_last_used(pool: &PgPool, id: i64, when: DateTime<Utc>) -> AppResult<()> {
    sqlx::query("UPDATE api_keys SET last_used_at = $2 WHERE id = $1")
        .bind(id)
        .bind(when)
        .execute(pool)
        .await?;
    Ok(())
}
