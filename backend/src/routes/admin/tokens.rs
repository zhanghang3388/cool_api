use axum::{
    Json, Router,
    extract::{Path, State},
    routing::get,
};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

use crate::auth::middleware::AdminUser;
use crate::error::AppError;
use crate::models::relay_key::RelayKey;

#[derive(Debug, Deserialize)]
pub struct AdminCreateTokenRequest {
    pub name: String,
    #[serde(default)]
    pub group_id: Option<Uuid>,
    #[serde(default)]
    pub remark: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct AdminCreateTokenResponse {
    pub key: RelayKey,
    pub full_key: String,
}

pub fn router(pool: PgPool) -> Router {
    Router::new()
        .route("/", get(list_tokens).post(create_token))
        .route(
            "/{id}",
            axum::routing::patch(toggle_token).delete(delete_token),
        )
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
    admin: AdminUser,
    State(pool): State<PgPool>,
    Json(req): Json<AdminCreateTokenRequest>,
) -> Result<Json<AdminCreateTokenResponse>, AppError> {
    validate_token_input(&req.name, req.remark.as_deref())?;
    let (key, full_key) = RelayKey::create(
        &pool,
        admin.0.id,
        &req.name,
        req.group_id,
        req.remark.as_deref(),
    )
    .await?;
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

fn validate_token_input(name: &str, remark: Option<&str>) -> Result<(), AppError> {
    let name = name.trim();
    if name.is_empty() || name.len() > 128 {
        return Err(AppError::BadRequest(
            "Token name must be 1-128 characters".into(),
        ));
    }
    if remark.is_some_and(|value| value.len() > 512) {
        return Err(AppError::BadRequest(
            "Token remark must be 512 characters or fewer".into(),
        ));
    }
    Ok(())
}
