use axum::{
    extract::{Path, State},
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

use crate::auth::middleware::AdminUser;
use crate::error::AppError;
use crate::models::relay_key::RelayKey;

#[derive(Debug, Deserialize)]
pub struct AdminCreateTokenRequest {
    pub user_id: Uuid,
    pub name: String,
    pub group_id: Option<Uuid>,
}

#[derive(Debug, Serialize)]
pub struct AdminCreateTokenResponse {
    pub key: RelayKey,
    pub full_key: String,
}

pub fn router(pool: PgPool) -> Router {
    Router::new()
        .route("/", get(list_tokens).post(create_token))
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

async fn create_token(
    _admin: AdminUser,
    State(pool): State<PgPool>,
    Json(req): Json<AdminCreateTokenRequest>,
) -> Result<Json<AdminCreateTokenResponse>, AppError> {
    let (key, full_key) = RelayKey::create(&pool, req.user_id, &req.name, req.group_id).await?;
    Ok(Json(AdminCreateTokenResponse { key, full_key }))
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
