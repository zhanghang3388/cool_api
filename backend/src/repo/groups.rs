use bigdecimal::BigDecimal;
use sqlx::PgPool;

use crate::error::{AppError, AppResult};
use crate::models::Group;

const COLUMNS: &str =
    "id, name, label, multiplier, description, enabled, created_at, updated_at";

pub async fn list(pool: &PgPool) -> AppResult<Vec<Group>> {
    let rows = sqlx::query_as::<_, Group>(&format!(
        "SELECT {COLUMNS} FROM groups ORDER BY id ASC"
    ))
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

pub async fn get_by_name(pool: &PgPool, name: &str) -> AppResult<Option<Group>> {
    let row = sqlx::query_as::<_, Group>(&format!(
        "SELECT {COLUMNS} FROM groups WHERE name = $1"
    ))
    .bind(name)
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

pub struct NewGroup<'a> {
    pub name: &'a str,
    pub label: &'a str,
    pub multiplier: BigDecimal,
    pub description: &'a str,
    pub enabled: bool,
}

pub async fn create(pool: &PgPool, new: NewGroup<'_>) -> AppResult<Group> {
    if get_by_name(pool, new.name).await?.is_some() {
        return Err(AppError::Conflict(format!("group '{}' already exists", new.name)));
    }
    let row = sqlx::query_as::<_, Group>(&format!(
        "INSERT INTO groups (name, label, multiplier, description, enabled)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING {COLUMNS}"
    ))
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
    let group = get(pool, id).await?;
    if group.name == "default" {
        return Err(AppError::Conflict("cannot delete default group".into()));
    }
    let in_use: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users WHERE group_id = $1")
        .bind(id)
        .fetch_one(pool)
        .await?;
    if in_use > 0 {
        return Err(AppError::Conflict(format!(
            "group is in use by {in_use} user(s)"
        )));
    }
    sqlx::query("DELETE FROM groups WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}
