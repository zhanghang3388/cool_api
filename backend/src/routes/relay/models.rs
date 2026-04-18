use axum::{extract::State, routing::get, Json, Router};
use serde::Serialize;
use sqlx::PgPool;
use std::sync::Arc;

use crate::models::channel::Channel;
use crate::models::pricing::ModelPricing;
use crate::relay::dispatcher::Dispatcher;

#[derive(Serialize)]
struct ModelsResponse {
    object: &'static str,
    data: Vec<ModelEntry>,
}

#[derive(Serialize)]
struct ModelEntry {
    id: String,
    object: &'static str,
    owned_by: &'static str,
}

#[derive(Serialize)]
struct PublicChannel {
    name: String,
    model_pattern: String,
    strategy: String,
    provider: String,
}

pub fn router(dispatcher: Arc<Dispatcher>, pool: PgPool) -> Router {
    Router::new()
        .route("/models", get(list_models))
        .route("/channels/public", get(list_public_channels))
        .route("/pricing", get(list_public_pricing))
        .with_state((dispatcher, pool))
}

async fn list_models(
    State((dispatcher, _)): State<(Arc<Dispatcher>, PgPool)>,
) -> Json<ModelsResponse> {
    let model_patterns = dispatcher.list_models().await.unwrap_or_default();

    let data = model_patterns
        .into_iter()
        .map(|id| ModelEntry {
            id,
            object: "model",
            owned_by: "cool-api",
        })
        .collect();

    Json(ModelsResponse {
        object: "list",
        data,
    })
}

async fn list_public_channels(
    State((_, pool)): State<(Arc<Dispatcher>, PgPool)>,
) -> Json<Vec<PublicChannel>> {
    let channels = Channel::list(&pool).await.unwrap_or_default();
    let mut result = Vec::new();

    for ch in channels {
        if !ch.is_active {
            continue;
        }
        let key_ids = Channel::get_key_ids(&pool, ch.id).await.unwrap_or_default();
        // Determine provider from the first key
        let provider = if let Some(kid) = key_ids.first() {
            crate::models::provider_key::ProviderKey::find_by_id(&pool, *kid)
                .await
                .ok()
                .flatten()
                .map(|k| k.provider)
                .unwrap_or_else(|| "unknown".into())
        } else {
            "unknown".into()
        };

        result.push(PublicChannel {
            name: ch.name,
            model_pattern: ch.model_pattern,
            strategy: ch.strategy,
            provider,
        });
    }

    Json(result)
}

#[derive(Serialize)]
struct PublicPricing {
    model: String,
    provider: String,
    input_price: f64,
    output_price: f64,
}

async fn list_public_pricing(
    State((_, pool)): State<(Arc<Dispatcher>, PgPool)>,
) -> Json<Vec<PublicPricing>> {
    let list = ModelPricing::list_active(&pool).await.unwrap_or_default();
    let result: Vec<PublicPricing> = list
        .into_iter()
        .map(|p| {
            let input_price = p.effective_input_price();
            let output_price = p.effective_output_price();
            PublicPricing {
                model: p.model,
                provider: p.provider,
                input_price,
                output_price,
            }
        })
        .collect();
    Json(result)
}
