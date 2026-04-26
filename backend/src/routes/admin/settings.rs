use axum::{
    extract::State,
    routing::get,
    Json, Router,
};
use serde::Serialize;
use sqlx::PgPool;

use crate::auth::middleware::AdminUser;
use crate::error::AppError;

#[derive(Serialize)]
struct RateLimitConfig {
    default_user_rpm_limit: u32,
    global_rpm_limit: Option<u32>,
}

pub fn router(pool: PgPool) -> Router {
    Router::new()
        .route("/", get(get_settings).patch(update_settings))
        .route("/models", get(get_models))
        .route("/rate-limits", get(get_rate_limits))
        .with_state(pool)
}

async fn get_settings(
    _admin: AdminUser,
    State(pool): State<PgPool>,
) -> Result<Json<Vec<(String, serde_json::Value)>>, AppError> {
    let rows: Vec<(String, serde_json::Value)> =
        sqlx::query_as("SELECT key, value FROM system_settings ORDER BY key")
            .fetch_all(&pool)
            .await?;
    Ok(Json(rows))
}

async fn update_settings(
    _admin: AdminUser,
    State(pool): State<PgPool>,
    Json(settings): Json<serde_json::Map<String, serde_json::Value>>,
) -> Result<Json<serde_json::Value>, AppError> {
    for (key, value) in settings {
        sqlx::query(
            "INSERT INTO system_settings (key, value, updated_at) VALUES ($1, $2, now())
             ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()"
        )
        .bind(&key)
        .bind(&value)
        .execute(&pool)
        .await?;
    }
    Ok(Json(serde_json::json!({"ok": true})))
}

async fn get_models(
    _admin: AdminUser,
    State(pool): State<PgPool>,
) -> Result<Json<serde_json::Value>, AppError> {
    let row: Option<(serde_json::Value,)> =
        sqlx::query_as("SELECT value FROM system_settings WHERE key = 'models'")
            .fetch_optional(&pool)
            .await?;
    let models = row.map(|(v,)| v).unwrap_or(serde_json::json!([]));
    Ok(Json(models))
}

async fn get_rate_limits(
    _admin: AdminUser,
    State(pool): State<PgPool>,
) -> Result<Json<RateLimitConfig>, AppError> {
    // Get from database or use defaults from env
    let default_user_rpm: Option<(serde_json::Value,)> =
        sqlx::query_as("SELECT value FROM system_settings WHERE key = 'default_user_rpm_limit'")
            .fetch_optional(&pool)
            .await?;

    let global_rpm: Option<(serde_json::Value,)> =
        sqlx::query_as("SELECT value FROM system_settings WHERE key = 'global_rpm_limit'")
            .fetch_optional(&pool)
            .await?;

    let default_user_rpm_limit = default_user_rpm
        .and_then(|(v,)| v.as_u64().map(|n| n as u32))
        .unwrap_or_else(|| {
            std::env::var("DEFAULT_USER_RPM_LIMIT")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(60)
        });

    let global_rpm_limit = global_rpm
        .and_then(|(v,)| v.as_u64().map(|n| n as u32))
        .or_else(|| {
            std::env::var("GLOBAL_RPM_LIMIT")
                .ok()
                .and_then(|v| v.parse().ok())
        });

    Ok(Json(RateLimitConfig {
        default_user_rpm_limit,
        global_rpm_limit,
    }))
}
