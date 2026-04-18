use axum::{
    extract::{Path, State},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

use crate::auth::middleware::AdminUser;
use crate::error::AppError;
use crate::models::provider_key::{CreateProviderKey, ProviderKey, UpdateProviderKey};

pub fn router(pool: PgPool) -> Router {
    Router::new()
        .route("/", get(list_keys).post(create_key))
        .route("/fetch-models", post(fetch_models))
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

#[derive(Debug, Deserialize)]
struct FetchModelsRequest {
    provider: String,
    api_key: String,
    base_url: Option<String>,
}

#[derive(Debug, Serialize)]
struct FetchModelsResponse {
    models: Vec<ModelInfo>,
}

#[derive(Debug, Serialize)]
struct ModelInfo {
    id: String,
}

async fn fetch_models(
    _admin: AdminUser,
    State(_pool): State<PgPool>,
    Json(req): Json<FetchModelsRequest>,
) -> Result<Json<FetchModelsResponse>, AppError> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| AppError::Internal(format!("HTTP client error: {e}")))?;

    let models = match req.provider.as_str() {
        "openai" => {
            let base = req.base_url.as_deref().unwrap_or("https://api.openai.com/v1");
            let base = base.trim_end_matches('/');
            let url = format!("{base}/models");
            let resp = client.get(&url)
                .header("Authorization", format!("Bearer {}", req.api_key))
                .send().await
                .map_err(|e| AppError::BadRequest(format!("Failed to connect: {e}")))?;
            if !resp.status().is_success() {
                let status = resp.status();
                let body = resp.text().await.unwrap_or_default();
                return Err(AppError::BadRequest(format!("OpenAI API error {status}: {body}")));
            }
            let json: serde_json::Value = resp.json().await
                .map_err(|e| AppError::BadRequest(format!("Invalid response: {e}")))?;
            json["data"].as_array()
                .unwrap_or(&vec![])
                .iter()
                .filter_map(|m| m["id"].as_str().map(|s| s.to_string()))
                .collect::<Vec<_>>()
        }
        "claude" => {
            let base = req.base_url.as_deref().unwrap_or("https://api.anthropic.com");
            let base = base.trim_end_matches('/');
            let url = format!("{base}/v1/models");
            let resp = client.get(&url)
                .header("x-api-key", &req.api_key)
                .header("anthropic-version", "2023-06-01")
                .send().await
                .map_err(|e| AppError::BadRequest(format!("Failed to connect: {e}")))?;
            if !resp.status().is_success() {
                let status = resp.status();
                let body = resp.text().await.unwrap_or_default();
                return Err(AppError::BadRequest(format!("Claude API error {status}: {body}")));
            }
            let json: serde_json::Value = resp.json().await
                .map_err(|e| AppError::BadRequest(format!("Invalid response: {e}")))?;
            json["data"].as_array()
                .unwrap_or(&vec![])
                .iter()
                .filter_map(|m| m["id"].as_str().map(|s| s.to_string()))
                .collect::<Vec<_>>()
        }
        "gemini" => {
            let base = req.base_url.as_deref().unwrap_or("https://generativelanguage.googleapis.com/v1beta");
            let base = base.trim_end_matches('/');
            let url = format!("{base}/models?key={}", req.api_key);
            let resp = client.get(&url)
                .send().await
                .map_err(|e| AppError::BadRequest(format!("Failed to connect: {e}")))?;
            if !resp.status().is_success() {
                let status = resp.status();
                let body = resp.text().await.unwrap_or_default();
                return Err(AppError::BadRequest(format!("Gemini API error {status}: {body}")));
            }
            let json: serde_json::Value = resp.json().await
                .map_err(|e| AppError::BadRequest(format!("Invalid response: {e}")))?;
            json["models"].as_array()
                .unwrap_or(&vec![])
                .iter()
                .filter_map(|m| {
                    m["name"].as_str().map(|s| s.strip_prefix("models/").unwrap_or(s).to_string())
                })
                .collect::<Vec<_>>()
        }
        _ => return Err(AppError::BadRequest("Provider must be one of: openai, claude, gemini".into())),
    };

    let mut models: Vec<ModelInfo> = models.into_iter().map(|id| ModelInfo { id }).collect();
    models.sort_by(|a, b| a.id.cmp(&b.id));

    Ok(Json(FetchModelsResponse { models }))
}
