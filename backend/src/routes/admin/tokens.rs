use axum::{
    extract::{Path, State},
    routing::get,
    Json, Router,
};
use sqlx::PgPool;
use uuid::Uuid;

use crate::auth::middleware::AdminUser;
use crate::error::AppError;
use crate::models::relay_key::RelayKey;

pub fn router(pool: PgPool) -> Router {
    Router::new()
        .route("/", get(list_tokens))
        .route("/{id}", axum::routing::patch(toggle_token).delete(delete_token))
        .with_state(pool)
}

async fn list_tokens(
    _admin: AdminUser,
    State(pool): State<PgPool>,
) -> Result<Json<Vec<RelayKey>>, AppError> {
    let keys = RelayKey::list_all(&pool).await?;
    Ok(Json(keys))
}

async fn toggle_token(
    _admin: AdminUser,
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> Result<Json<RelayKey>, AppError> {
    let key = RelayKey::admin_toggle_active(&pool, id).await?;
    Ok(Json(key))
}

async fn delete_token(
    _admin: AdminUser,
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, AppError> {
    RelayKey::admin_delete(&pool, id).await?;
    Ok(Json(serde_json::json!({"ok": true})))
}
