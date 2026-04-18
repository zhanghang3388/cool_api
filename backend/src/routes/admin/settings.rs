use axum::{
    extract::State,
    routing::get,
    Json, Router,
};
use sqlx::PgPool;

use crate::auth::middleware::AdminUser;
use crate::error::AppError;

pub fn router(pool: PgPool) -> Router {
    Router::new()
        .route("/", get(get_settings).patch(update_settings))
        .route("/models", get(get_models))
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
