use sqlx::PgPool;

use crate::error::{AppError, AppResult};
use crate::models::Model;

const COLUMNS: &str = "id, name, provider, input_price_cents, output_price_cents, \
    cache_read_price_cents, cache_write_price_cents, enabled, description, \
    created_at, updated_at";

pub async fn list(pool: &PgPool) -> AppResult<Vec<Model>> {
    let rows = sqlx::query_as::<_, Model>(&format!(
        "SELECT {COLUMNS} FROM models ORDER BY provider, name"
    ))
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn get(pool: &PgPool, id: i64) -> AppResult<Model> {
    sqlx::query_as::<_, Model>(&format!(
        "SELECT {COLUMNS} FROM models WHERE id = $1"
    ))
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or(AppError::NotFound)
}

pub async fn get_by_name(pool: &PgPool, name: &str) -> AppResult<Option<Model>> {
    let row = sqlx::query_as::<_, Model>(&format!(
        "SELECT {COLUMNS} FROM models WHERE name = $1"
    ))
    .bind(name)
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

pub struct NewModel<'a> {
    pub name: &'a str,
    pub provider: &'a str,
    pub input_price_cents: i64,
    pub output_price_cents: i64,
    pub cache_read_price_cents: Option<i64>,
    pub cache_write_price_cents: Option<i64>,
    pub enabled: bool,
    pub description: &'a str,
}

pub async fn create(pool: &PgPool, new: NewModel<'_>) -> AppResult<Model> {
    if get_by_name(pool, new.name).await?.is_some() {
        return Err(AppError::Conflict(format!("model '{}' already exists", new.name)));
    }
    let row = sqlx::query_as::<_, Model>(&format!(
        "INSERT INTO models (name, provider, input_price_cents, output_price_cents,
                             cache_read_price_cents, cache_write_price_cents,
                             enabled, description)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING {COLUMNS}"
    ))
    .bind(new.name)
    .bind(new.provider)
    .bind(new.input_price_cents)
    .bind(new.output_price_cents)
    .bind(new.cache_read_price_cents)
    .bind(new.cache_write_price_cents)
    .bind(new.enabled)
    .bind(new.description)
    .fetch_one(pool)
    .await?;
    Ok(row)
}

#[derive(Default)]
pub struct UpdateModel<'a> {
    pub provider: Option<&'a str>,
    pub input_price_cents: Option<i64>,
    pub output_price_cents: Option<i64>,
    pub cache_read_price_cents: Option<Option<i64>>,
    pub cache_write_price_cents: Option<Option<i64>>,
    pub enabled: Option<bool>,
    pub description: Option<&'a str>,
}

pub async fn update(pool: &PgPool, id: i64, patch: UpdateModel<'_>) -> AppResult<Model> {
    let (cache_read_set, cache_read_val) = match patch.cache_read_price_cents {
        Some(v) => (true, v),
        None => (false, None),
    };
    let (cache_write_set, cache_write_val) = match patch.cache_write_price_cents {
        Some(v) => (true, v),
        None => (false, None),
    };

    let row = sqlx::query_as::<_, Model>(&format!(
        "UPDATE models SET
            provider                 = COALESCE($2, provider),
            input_price_cents        = COALESCE($3, input_price_cents),
            output_price_cents       = COALESCE($4, output_price_cents),
            cache_read_price_cents   = CASE WHEN $5 THEN $6 ELSE cache_read_price_cents END,
            cache_write_price_cents  = CASE WHEN $7 THEN $8 ELSE cache_write_price_cents END,
            enabled                  = COALESCE($9, enabled),
            description              = COALESCE($10, description),
            updated_at               = NOW()
         WHERE id = $1
         RETURNING {COLUMNS}"
    ))
    .bind(id)
    .bind(patch.provider)
    .bind(patch.input_price_cents)
    .bind(patch.output_price_cents)
    .bind(cache_read_set)
    .bind(cache_read_val)
    .bind(cache_write_set)
    .bind(cache_write_val)
    .bind(patch.enabled)
    .bind(patch.description)
    .fetch_optional(pool)
    .await?
    .ok_or(AppError::NotFound)?;
    Ok(row)
}

pub async fn delete(pool: &PgPool, id: i64) -> AppResult<()> {
    let result = sqlx::query("DELETE FROM models WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(())
}
