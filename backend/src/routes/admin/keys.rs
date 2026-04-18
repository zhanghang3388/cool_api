use axum::{
    extract::{Path, State},
    routing::get,
    Json, Router,
};
use serde::Deserialize;
use sqlx::PgPool;
use uuid::Uuid;

use crate::auth::middleware::AdminUser;
use crate::error::AppError;
use crate::models::provider_key::{CreateProviderKey, ProviderKey, UpdateProviderKey};

pub fn router(pool: PgPool) -> Router {
    Router::new()
        .route("/", get(list_keys).post(create_key))
        .route("/{id}", get(get_key).patch(update_key).delete(delete_key))
        .with_state(pool)
}

async fn list_keys(
    _admin: AdminUser,
    State(pool): State<PgPool>,
) -> Result<Json<Vec<ProviderKey>>, AppError> {
    let keys = ProviderKey::list(&pool).await?;
    Ok(Json(keys))
}

async fn get_key(
    _admin: AdminUser,
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> Result<Json<ProviderKey>, AppError> {
    let key = ProviderKey::find_by_id(&pool, id)
        .await?
        .ok_or_else(|| AppError::NotFound("Provider key not found".into()))?;
    Ok(Json(key))
}

async fn create_key(
    _admin: AdminUser,
    State(pool): State<PgPool>,
    Json(req): Json<CreateProviderKey>,
) -> Result<Json<ProviderKey>, AppError> {
    let valid_providers = ["openai", "claude", "gemini"];
    if !valid_providers.contains(&req.provider.as_str()) {
        return Err(AppError::BadRequest(format!(
            "Provider must be one of: {}",
            valid_providers.join(", ")
        )));
    }
    let key = ProviderKey::create(&pool, &req).await?;
    Ok(Json(key))
}

async fn update_key(
    _admin: AdminUser,
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateProviderKey>,
) -> Result<Json<ProviderKey>, AppError> {
    ProviderKey::find_by_id(&pool, id)
        .await?
        .ok_or_else(|| AppError::NotFound("Provider key not found".into()))?;
    let key = ProviderKey::update(&pool, id, &req).await?;
    Ok(Json(key))
}

async fn delete_key(
    _admin: AdminUser,
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, AppError> {
    ProviderKey::find_by_id(&pool, id)
        .await?
        .ok_or_else(|| AppError::NotFound("Provider key not found".into()))?;
    ProviderKey::delete(&pool, id).await?;
    Ok(Json(serde_json::json!({"ok": true})))
}
