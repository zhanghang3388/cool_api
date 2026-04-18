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
use crate::models::channel::Channel;
use crate::models::pricing::{official_pricing, CreatePricing, ModelPricing, UpdatePricing};

/// Default remote pricing data URL (raw GitHub)
const PRICING_JSON_URL: &str = "https://raw.githubusercontent.com/zhanghang3388/cool_api/main/pricing.json";

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

#[derive(Debug, Deserialize)]
struct RemotePricingItem {
    model: String,
    provider: String,
    input_price: f64,
    output_price: f64,
}

/// Fetch pricing data from remote URL, fallback to built-in
async fn fetch_pricing_data() -> Vec<CreatePricing> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build();

    if let Ok(client) = client {
        if let Ok(resp) = client.get(PRICING_JSON_URL).send().await {
            if resp.status().is_success() {
                if let Ok(items) = resp.json::<Vec<RemotePricingItem>>().await {
                    return items.into_iter().map(|i| CreatePricing {
                        model: i.model,
                        provider: i.provider,
                        input_price: i.input_price,
                        output_price: i.output_price,
                        multiplier: None,
                    }).collect();
                }
            }
        }
    }

    // Fallback to built-in
    official_pricing()
}

async fn sync_pricing(
    _admin: AdminUser,
    State(pool): State<PgPool>,
) -> Result<Json<SyncResult>, AppError> {
    // Fetch pricing from remote (or fallback to built-in)
    let all_pricing = fetch_pricing_data().await;

    // Get all models from active channels
    let channels = Channel::list(&pool).await?;
    let mut channel_models: Vec<String> = Vec::new();
    for ch in &channels {
        if !ch.is_active { continue; }
        for m in ch.model_pattern.split(',') {
            let m = m.trim().to_string();
            if !m.is_empty() && !channel_models.contains(&m) {
                channel_models.push(m);
            }
        }
    }

    let mut added = 0u32;
    let mut updated = 0u32;
    let mut matched = 0u32;

    for model_name in &channel_models {
        // Exact match first, then longest prefix match
        let exact = all_pricing.iter().find(|p| &p.model == model_name);
        let best_match = if exact.is_some() {
            exact
        } else {
            let mut best: Option<&CreatePricing> = None;
            let mut best_len = 0;
            for p in &all_pricing {
                if model_name.starts_with(&p.model) && p.model.len() > best_len {
                    best_len = p.model.len();
                    best = Some(p);
                }
            }
            best
        };

        if let Some(item) = best_match {
            let existing = ModelPricing::find_by_model(&pool, model_name).await?;
            if existing.is_some() {
                sqlx::query(
                    "UPDATE model_pricing SET provider = $1, input_price = $2, output_price = $3, updated_at = now() WHERE model = $4"
                )
                .bind(&item.provider)
                .bind(item.input_price)
                .bind(item.output_price)
                .bind(model_name)
                .execute(&pool)
                .await?;
                updated += 1;
            } else {
                let create = CreatePricing {
                    model: model_name.clone(),
                    provider: item.provider.clone(),
                    input_price: item.input_price,
                    output_price: item.output_price,
                    multiplier: None,
                };
                ModelPricing::create(&pool, &create).await?;
                added += 1;
            }
            matched += 1;
        }
    }

    Ok(Json(SyncResult { added, updated, total: matched }))
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
