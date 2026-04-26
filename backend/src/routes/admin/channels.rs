use axum::{
    Json, Router,
    extract::{Path, State},
    routing::get,
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
        .route(
            "/{id}",
            get(get_channel)
                .patch(update_channel)
                .delete(delete_channel),
        )
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
        result.push(ChannelWithKeys {
            channel: ch,
            key_ids,
        });
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
    validate_channel_create(&req)?;
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
    validate_channel_update(&req)?;
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

fn validate_channel_create(req: &CreateChannel) -> Result<(), AppError> {
    validate_channel_name(&req.name)?;
    validate_model_pattern(&req.model_pattern)?;
    if let Some(strategy) = &req.strategy {
        validate_strategy(strategy)?;
    }
    Ok(())
}

fn validate_channel_update(req: &UpdateChannel) -> Result<(), AppError> {
    if let Some(name) = &req.name {
        validate_channel_name(name)?;
    }
    if let Some(model_pattern) = &req.model_pattern {
        validate_model_pattern(model_pattern)?;
    }
    if let Some(strategy) = &req.strategy {
        validate_strategy(strategy)?;
    }
    Ok(())
}

fn validate_channel_name(name: &str) -> Result<(), AppError> {
    if name.trim().is_empty() || name.len() > 128 {
        return Err(AppError::BadRequest(
            "Channel name must be 1-128 characters".into(),
        ));
    }
    Ok(())
}

fn validate_model_pattern(pattern: &str) -> Result<(), AppError> {
    if pattern.trim().is_empty() || pattern.len() > 2048 {
        return Err(AppError::BadRequest(
            "Model pattern must be 1-2048 characters".into(),
        ));
    }
    Ok(())
}

fn validate_strategy(strategy: &str) -> Result<(), AppError> {
    if !matches!(strategy, "round_robin" | "priority" | "weighted") {
        return Err(AppError::BadRequest(
            "Strategy must be one of: round_robin, priority, weighted".into(),
        ));
    }
    Ok(())
}
