use axum::{extract::State, routing::get, Json, Router};
use serde::Serialize;
use std::sync::Arc;

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

pub fn router(dispatcher: Arc<Dispatcher>) -> Router {
    Router::new()
        .route("/models", get(list_models))
        .with_state(dispatcher)
}

async fn list_models(
    State(dispatcher): State<Arc<Dispatcher>>,
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
