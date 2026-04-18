use axum::{
    extract::{Path, State},
    routing::get,
    Json, Router,
};
use serde::Serialize;
use sqlx::PgPool;
use uuid::Uuid;

use crate::auth::middleware::AdminUser;
use crate::error::AppError;
use crate::models::channel::{Channel, CreateChannel, UpdateChannel};

#[derive(Debug, Serialize)]
pub struct ChannelWithKeys {
    #[serde(flatten)]
    pub channel: Channel,
    pub key_ids: Vec<Uuid>,
}

pub fn router(pool: PgPool) -> Router {
    Router::new()
        .route("/", get(list_channels).post(create_channel))
        .route("/{id}", get(get_channel).patch(update_channel).delete(delete_channel))
        .with_state(pool)
}

async fn list_channels(
    _admin: AdminUser,
    State(pool): State<PgPool>,
) -> Result<Json<Vec<ChannelWithKeys>>, AppError> {
    let channels = Channel::list(&pool).await?;
    let mut result = Vec::with_capacity(channels.len());
    for ch in channels {
        let key_ids = Channel::get_key_ids(&pool, ch.id).await?;
        result.push(ChannelWithKeys { channel: ch, key_ids });
    }
    Ok(Json(result))
}

async fn get_channel(
    _admin: AdminUser,
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> Result<Json<ChannelWithKeys>, AppError> {
    let channel = Channel::find_by_id(&pool, id)
        .await?
        .ok_or_else(|| AppError::NotFound("Channel not found".into()))?;
    let key_ids = Channel::get_key_ids(&pool, id).await?;
    Ok(Json(ChannelWithKeys { channel, key_ids }))
}

async fn create_channel(
    _admin: AdminUser,
    State(pool): State<PgPool>,
    Json(req): Json<CreateChannel>,
) -> Result<Json<ChannelWithKeys>, AppError> {
    let channel = Channel::create(&pool, &req).await?;
    let key_ids = Channel::get_key_ids(&pool, channel.id).await?;
    Ok(Json(ChannelWithKeys { channel, key_ids }))
}

async fn update_channel(
    _admin: AdminUser,
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateChannel>,
) -> Result<Json<ChannelWithKeys>, AppError> {
    Channel::find_by_id(&pool, id)
        .await?
        .ok_or_else(|| AppError::NotFound("Channel not found".into()))?;
    let channel = Channel::update(&pool, id, &req).await?;
    let key_ids = Channel::get_key_ids(&pool, channel.id).await?;
    Ok(Json(ChannelWithKeys { channel, key_ids }))
}

async fn delete_channel(
    _admin: AdminUser,
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, AppError> {
    Channel::find_by_id(&pool, id)
        .await?
        .ok_or_else(|| AppError::NotFound("Channel not found".into()))?;
    Channel::delete(&pool, id).await?;
    Ok(Json(serde_json::json!({"ok": true})))
}
