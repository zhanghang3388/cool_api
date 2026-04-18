use axum::{
    extract::{Path, State},
    routing::get,
    Json, Router,
};
use serde::Serialize;
use sqlx::PgPool;
use uuid::Uuid;

use crate::auth::middleware::CurrentUser;
use crate::error::AppError;
use crate::models::relay_key::RelayKey;

#[derive(Serialize)]
pub struct CreateKeyResponse {
    pub key: RelayKey,
    pub full_key: String,
}

pub fn router(pool: PgPool) -> Router {
    Router::new()
        .route("/", get(list_keys).post(create_key))
        .route("/{id}", axum::routing::delete(delete_key).patch(toggle_key))
        .with_state(pool)
}

async fn list_keys(
    user: CurrentUser,
    State(pool): State<PgPool>,
) -> Result<Json<Vec<RelayKey>>, AppError> {
    let keys = RelayKey::list_by_user(&pool, user.id).await?;
    Ok(Json(keys))
}

#[derive(serde::Deserialize)]
pub struct CreateKeyRequest {
    pub name: String,
    pub group_id: Option<Uuid>,
}

async fn create_key(
    user: CurrentUser,
    State(pool): State<PgPool>,
    Json(req): Json<CreateKeyRequest>,
) -> Result<Json<CreateKeyResponse>, AppError> {
    let (key, full_key) = RelayKey::create(&pool, user.id, &req.name, req.group_id).await?;
    Ok(Json(CreateKeyResponse { key, full_key }))
}

async fn delete_key(
    user: CurrentUser,
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, AppError> {
    RelayKey::delete(&pool, id, user.id).await?;
    Ok(Json(serde_json::json!({"ok": true})))
}

async fn toggle_key(
    user: CurrentUser,
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> Result<Json<RelayKey>, AppError> {
    let key = RelayKey::toggle_active(&pool, id, user.id).await?;
    Ok(Json(key))
}
