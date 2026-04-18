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
use crate::models::pricing_group::{CreatePricingGroup, PricingGroup, UpdatePricingGroup};

#[derive(Debug, Serialize)]
pub struct GroupWithChannels {
    #[serde(flatten)]
    pub group: PricingGroup,
    pub channel_ids: Vec<Uuid>,
}

pub fn router(pool: PgPool) -> Router {
    Router::new()
        .route("/", get(list_groups).post(create_group))
        .route("/{id}", get(get_group).patch(update_group).delete(delete_group))
        .with_state(pool)
}

async fn list_groups(
    _admin: AdminUser,
    State(pool): State<PgPool>,
) -> Result<Json<Vec<GroupWithChannels>>, AppError> {
    let groups = PricingGroup::list(&pool).await?;
    let mut result = Vec::with_capacity(groups.len());
    for g in groups {
        let channel_ids = PricingGroup::get_channel_ids(&pool, g.id).await?;
        result.push(GroupWithChannels { group: g, channel_ids });
    }
    Ok(Json(result))
}

async fn get_group(
    _admin: AdminUser,
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> Result<Json<GroupWithChannels>, AppError> {
    let group = PricingGroup::find_by_id(&pool, id)
        .await?
        .ok_or_else(|| AppError::NotFound("Group not found".into()))?;
    let channel_ids = PricingGroup::get_channel_ids(&pool, id).await?;
    Ok(Json(GroupWithChannels { group, channel_ids }))
}

async fn create_group(
    _admin: AdminUser,
    State(pool): State<PgPool>,
    Json(req): Json<CreatePricingGroup>,
) -> Result<Json<GroupWithChannels>, AppError> {
    let group = PricingGroup::create(&pool, &req).await?;
    let channel_ids = PricingGroup::get_channel_ids(&pool, group.id).await?;
    Ok(Json(GroupWithChannels { group, channel_ids }))
}

async fn update_group(
    _admin: AdminUser,
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdatePricingGroup>,
) -> Result<Json<GroupWithChannels>, AppError> {
    PricingGroup::find_by_id(&pool, id)
        .await?
        .ok_or_else(|| AppError::NotFound("Group not found".into()))?;
    let group = PricingGroup::update(&pool, id, &req).await?;
    let channel_ids = PricingGroup::get_channel_ids(&pool, group.id).await?;
    Ok(Json(GroupWithChannels { group, channel_ids }))
}

async fn delete_group(
    _admin: AdminUser,
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, AppError> {
    PricingGroup::find_by_id(&pool, id)
        .await?
        .ok_or_else(|| AppError::NotFound("Group not found".into()))?;
    PricingGroup::delete(&pool, id).await?;
    Ok(Json(serde_json::json!({"ok": true})))
}
