use bigdecimal::BigDecimal;
use sqlx::PgPool;

use crate::error::{AppError, AppResult};
use crate::models::{ChannelProvider, Group};

const COLUMNS: &str =
    "id, provider, name, label, multiplier, description, enabled, created_at, updated_at";

pub async fn list(pool: &PgPool) -> AppResult<Vec<Group>> {
    let rows = sqlx::query_as::<_, Group>(&format!(
        "SELECT {COLUMNS} FROM groups ORDER BY provider ASC, id ASC"
    ))
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn list_by_provider(
    pool: &PgPool,
    provider: ChannelProvider,
) -> AppResult<Vec<Group>> {
    let rows = sqlx::query_as::<_, Group>(&format!(
        "SELECT {COLUMNS} FROM groups WHERE provider = $1 ORDER BY id ASC"
    ))
    .bind(provider)
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn get(pool: &PgPool, id: i64) -> AppResult<Group> {
    sqlx::query_as::<_, Group>(&format!(
        "SELECT {COLUMNS} FROM groups WHERE id = $1"
    ))
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or(AppError::NotFound)
}

pub async fn get_by_provider_name(
    pool: &PgPool,
    provider: ChannelProvider,
    name: &str,
) -> AppResult<Option<Group>> {
    let row = sqlx::query_as::<_, Group>(&format!(
        "SELECT {COLUMNS} FROM groups WHERE provider = $1 AND name = $2"
    ))
    .bind(provider)
    .bind(name)
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

pub struct NewGroup<'a> {
    pub provider: ChannelProvider,
    pub name: &'a str,
    pub label: &'a str,
    pub multiplier: BigDecimal,
    pub description: &'a str,
    pub enabled: bool,
}

pub async fn create(pool: &PgPool, new: NewGroup<'_>) -> AppResult<Group> {
    if get_by_provider_name(pool, new.provider, new.name).await?.is_some() {
        return Err(AppError::Conflict(format!(
            "group '{}' already exists for this provider",
            new.name
        )));
    }
    let row = sqlx::query_as::<_, Group>(&format!(
        "INSERT INTO groups (provider, name, label, multiplier, description, enabled)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING {COLUMNS}"
    ))
    .bind(new.provider)
    .bind(new.name)
    .bind(new.label)
    .bind(&new.multiplier)
    .bind(new.description)
    .bind(new.enabled)
    .fetch_one(pool)
    .await?;
    Ok(row)
}

#[derive(Default)]
pub struct UpdateGroup<'a> {
    pub label: Option<&'a str>,
    pub multiplier: Option<BigDecimal>,
    pub description: Option<&'a str>,
    pub enabled: Option<bool>,
}

pub async fn update(pool: &PgPool, id: i64, patch: UpdateGroup<'_>) -> AppResult<Group> {
    let row = sqlx::query_as::<_, Group>(&format!(
        "UPDATE groups SET
            label       = COALESCE($2, label),
            multiplier  = COALESCE($3, multiplier),
            description = COALESCE($4, description),
            enabled     = COALESCE($5, enabled),
            updated_at  = NOW()
         WHERE id = $1
         RETURNING {COLUMNS}"
    ))
    .bind(id)
    .bind(patch.label)
    .bind(patch.multiplier)
    .bind(patch.description)
    .bind(patch.enabled)
    .fetch_optional(pool)
    .await?
    .ok_or(AppError::NotFound)?;
    Ok(row)
}

pub async fn delete(pool: &PgPool, id: i64) -> AppResult<()> {
    get(pool, id).await?;
    // Reject if any token currently routes through this group via the
    // per-provider mapping table.
    let token_uses: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM api_key_groups WHERE group_id = $1")
            .bind(id)
            .fetch_one(pool)
            .await?;
    if token_uses > 0 {
        return Err(AppError::Conflict(format!(
            "group is in use by {token_uses} api key binding(s)"
        )));
    }
    let override_uses = crate::repo::user_groups::count_overrides_for_group(pool, id).await?;
    if override_uses > 0 {
        return Err(AppError::Conflict(format!(
            "group is referenced by {override_uses} per-user override(s); clear them first"
        )));
    }
    let defaults = crate::repo::user_groups::get_default_user_group_ids(pool).await?;
    if defaults.contains(&id) {
        return Err(AppError::Conflict(
            "group is in the system-wide default user groups; remove it from settings first"
                .into(),
        ));
    }
    sqlx::query("DELETE FROM groups WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}
