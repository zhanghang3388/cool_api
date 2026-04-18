use axum::{
    extract::{Path, State},
    routing::{get, patch, post},
    Json, Router,
};
use serde::Deserialize;
use sqlx::PgPool;
use uuid::Uuid;

use crate::auth::middleware::AdminUser;
use crate::error::AppError;
use crate::models::pricing::{official_pricing, CreatePricing, ModelPricing, UpdatePricing};

pub fn router(pool: PgPool) -> Router {
    Router::new()
        .route("/", get(list_pricing).post(create_pricing))
        .route("/sync", post(sync_pricing))
        .route("/batch-multiplier", patch(batch_multiplier))
        .route("/{id}", patch(update_pricing).delete(delete_pricing))
        .with_state(pool)
}

async fn list_pricing(
    _admin: AdminUser,
    State(pool): State<PgPool>,
) -> Result<Json<Vec<ModelPricing>>, AppError> {
    let list = ModelPricing::list(&pool).await?;
    Ok(Json(list))
}

async fn create_pricing(
    _admin: AdminUser,
    State(pool): State<PgPool>,
    Json(req): Json<CreatePricing>,
) -> Result<Json<ModelPricing>, AppError> {
    let p = ModelPricing::create(&pool, &req).await?;
    Ok(Json(p))
}

async fn update_pricing(
    _admin: AdminUser,
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdatePricing>,
) -> Result<Json<ModelPricing>, AppError> {
    let p = ModelPricing::update(&pool, id, &req).await?;
    Ok(Json(p))
}

async fn delete_pricing(
    _admin: AdminUser,
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, AppError> {
    ModelPricing::delete(&pool, id).await?;
    Ok(Json(serde_json::json!({"ok": true})))
}

async fn sync_pricing(
    _admin: AdminUser,
    State(pool): State<PgPool>,
) -> Result<Json<SyncResult>, AppError> {
    let official = official_pricing();
    let mut added = 0u32;
    let mut updated = 0u32;

    for item in &official {
        let existing = ModelPricing::find_by_model(&pool, &item.model).await?;
        if existing.is_some() {
            // Update provider and official prices, keep multiplier
            sqlx::query(
                "UPDATE model_pricing SET provider = $1, input_price = $2, output_price = $3, updated_at = now() WHERE model = $4"
            )
            .bind(&item.provider)
            .bind(item.input_price)
            .bind(item.output_price)
            .bind(&item.model)
            .execute(&pool)
            .await?;
            updated += 1;
        } else {
            ModelPricing::create(&pool, item).await?;
            added += 1;
        }
    }

    Ok(Json(SyncResult { added, updated, total: official.len() as u32 }))
}

#[derive(serde::Serialize)]
struct SyncResult {
    added: u32,
    updated: u32,
    total: u32,
}

#[derive(Deserialize)]
struct BatchMultiplierRequest {
    ids: Vec<Uuid>,
    multiplier: f64,
}

async fn batch_multiplier(
    _admin: AdminUser,
    State(pool): State<PgPool>,
    Json(req): Json<BatchMultiplierRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    if req.multiplier <= 0.0 {
        return Err(AppError::BadRequest("Multiplier must be positive".into()));
    }
    let affected = ModelPricing::batch_update_multiplier(&pool, &req.ids, req.multiplier).await?;
    Ok(Json(serde_json::json!({"ok": true, "affected": affected})))
}
