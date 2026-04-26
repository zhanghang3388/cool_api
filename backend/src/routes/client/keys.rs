use axum::{
    Json, Router,
    extract::{Path, State},
    routing::get,
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
    #[serde(default)]
    pub group_id: Option<Uuid>,
    #[serde(default)]
    pub remark: Option<String>,
}

async fn create_key(
    user: CurrentUser,
    State(pool): State<PgPool>,
    Json(req): Json<CreateKeyRequest>,
) -> Result<Json<CreateKeyResponse>, AppError> {
    validate_key_input(&req.name, req.remark.as_deref())?;
    let (key, full_key) = RelayKey::create(
        &pool,
        user.id,
        &req.name,
        req.group_id,
        req.remark.as_deref(),
    )
    .await?;
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

fn validate_key_input(name: &str, remark: Option<&str>) -> Result<(), AppError> {
    let name = name.trim();
    if name.is_empty() || name.len() > 128 {
        return Err(AppError::BadRequest(
            "Key name must be 1-128 characters".into(),
        ));
    }
    if remark.is_some_and(|value| value.len() > 512) {
        return Err(AppError::BadRequest(
            "Key remark must be 512 characters or fewer".into(),
        ));
    }
    Ok(())
}
