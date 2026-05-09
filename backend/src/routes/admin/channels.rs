use axum::extract::{Path, State};
use axum::routing::{get, patch, post};
use axum::{Json, Router};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::auth::AdminUser;
use crate::crypto::mask_secret;
use crate::error::{AppError, AppResult};
use crate::models::{Channel, ChannelProvider, ChannelStatus};
use crate::repo;
use crate::upstream;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list).post(create))
        .route("/preview-models", post(preview_models))
        .route("/:id", patch(update).delete(remove))
        .route("/:id/test", post(test))
        .route("/:id/models", get(list_channel_models))
}

/// Outward-facing channel shape. Never exposes the encrypted or plaintext key.
#[derive(Debug, Serialize)]
struct ChannelDto {
    id: i64,
    name: String,
    provider: ChannelProvider,
    base_url: String,
    api_key_masked: String,
    priority: i32,
    weight: i32,
    enabled: bool,
    status: ChannelStatus,
    allowed_models: Vec<String>,
    allowed_group_ids: Vec<i64>,
    balance_cents: Option<i64>,
    last_test_at: Option<DateTime<Utc>>,
    last_error: Option<String>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

impl ChannelDto {
    fn from_row(state: &AppState, c: Channel) -> Self {
        let api_key_masked = state
            .cipher
            .decrypt(&c.api_key_encrypted)
            .map(|k| mask_secret(&k))
            .unwrap_or_else(|_| "****".to_string());
        Self {
            id: c.id,
            name: c.name,
            provider: c.provider,
            base_url: c.base_url,
            api_key_masked,
            priority: c.priority,
            weight: c.weight,
            enabled: c.enabled,
            status: c.status,
            allowed_models: c.allowed_models,
            allowed_group_ids: c.allowed_group_ids,
            balance_cents: c.balance_cents,
            last_test_at: c.last_test_at,
            last_error: c.last_error,
            created_at: c.created_at,
            updated_at: c.updated_at,
        }
    }
}

async fn list(
    State(state): State<AppState>,
    _admin: AdminUser,
) -> AppResult<Json<Vec<ChannelDto>>> {
    let rows = repo::channels::list(&state.db).await?;
    let dtos = rows
        .into_iter()
        .map(|c| ChannelDto::from_row(&state, c))
        .collect();
    Ok(Json(dtos))
}

#[derive(Debug, Deserialize)]
struct CreateChannelRequest {
    name: String,
    provider: ChannelProvider,
    base_url: String,
    api_key: String,
    #[serde(default)]
    priority: i32,
    #[serde(default = "default_weight")]
    weight: i32,
    #[serde(default = "default_true")]
    enabled: bool,
    #[serde(default)]
    allowed_models: Vec<String>,
    #[serde(default)]
    allowed_group_ids: Vec<i64>,
}

fn default_weight() -> i32 {
    1
}
fn default_true() -> bool {
    true
}

async fn create(
    State(state): State<AppState>,
    _admin: AdminUser,
    Json(body): Json<CreateChannelRequest>,
) -> AppResult<Json<ChannelDto>> {
    if body.name.trim().is_empty() {
        return Err(AppError::BadRequest("name required".into()));
    }
    if body.base_url.trim().is_empty() {
        return Err(AppError::BadRequest("base_url required".into()));
    }
    if body.api_key.trim().is_empty() {
        return Err(AppError::BadRequest("api_key required".into()));
    }
    if body.weight < 1 {
        return Err(AppError::BadRequest("weight must be >= 1".into()));
    }

    let encrypted = state.cipher.encrypt(&body.api_key)?;
    let ch = repo::channels::create(
        &state.db,
        repo::channels::NewChannel {
            name: &body.name,
            provider: body.provider,
            base_url: body.base_url.trim_end_matches('/'),
            api_key_encrypted: &encrypted,
            priority: body.priority,
            weight: body.weight,
            enabled: body.enabled,
            allowed_models: body.allowed_models,
            allowed_group_ids: body.allowed_group_ids,
        },
    )
    .await?;
    Ok(Json(ChannelDto::from_row(&state, ch)))
}

#[derive(Debug, Deserialize)]
struct UpdateChannelRequest {
    name: Option<String>,
    base_url: Option<String>,
    /// Provide a new plaintext key to rotate. Omit to keep the existing one.
    api_key: Option<String>,
    priority: Option<i32>,
    weight: Option<i32>,
    enabled: Option<bool>,
    allowed_models: Option<Vec<String>>,
    allowed_group_ids: Option<Vec<i64>>,
}

async fn update(
    State(state): State<AppState>,
    _admin: AdminUser,
    Path(id): Path<i64>,
    Json(body): Json<UpdateChannelRequest>,
) -> AppResult<Json<ChannelDto>> {
    if let Some(w) = body.weight {
        if w < 1 {
            return Err(AppError::BadRequest("weight must be >= 1".into()));
        }
    }
    let encrypted = match body.api_key {
        Some(ref k) if !k.trim().is_empty() => Some(state.cipher.encrypt(k)?),
        _ => None,
    };
    let base_url = body.base_url.as_deref().map(|u| u.trim_end_matches('/').to_string());

    let ch = repo::channels::update(
        &state.db,
        id,
        repo::channels::UpdateChannel {
            name: body.name.as_deref(),
            base_url: base_url.as_deref(),
            api_key_encrypted: encrypted.as_deref(),
            priority: body.priority,
            weight: body.weight,
            enabled: body.enabled,
            allowed_models: body.allowed_models,
            allowed_group_ids: body.allowed_group_ids,
        },
    )
    .await?;
    Ok(Json(ChannelDto::from_row(&state, ch)))
}

async fn remove(
    State(state): State<AppState>,
    _admin: AdminUser,
    Path(id): Path<i64>,
) -> AppResult<Json<serde_json::Value>> {
    repo::channels::delete(&state.db, id).await?;
    Ok(Json(serde_json::json!({ "deleted": true })))
}

#[derive(Debug, Serialize)]
struct TestResponse {
    ok: bool,
    latency_ms: i32,
    detail: String,
    status: ChannelStatus,
}

async fn test(
    State(state): State<AppState>,
    _admin: AdminUser,
    Path(id): Path<i64>,
) -> AppResult<Json<TestResponse>> {
    let ch = repo::channels::get(&state.db, id).await?;
    let api_key = state.cipher.decrypt(&ch.api_key_encrypted)?;

    let adapter = upstream::adapter_for(ch.provider);
    let probe_hint = ch.allowed_models.first().map(String::as_str);
    let report = adapter
        .test_connectivity(&state.http, &ch.base_url, &api_key, probe_hint)
        .await?;

    let status = if report.ok {
        ChannelStatus::Active
    } else {
        ChannelStatus::Error
    };
    let last_error = if report.ok { None } else { Some(report.detail.as_str()) };

    repo::channels::record_test_result(&state.db, id, status, last_error, Utc::now()).await?;

    Ok(Json(TestResponse {
        ok: report.ok,
        latency_ms: report.latency_ms,
        detail: report.detail,
        status,
    }))
}

// -------------------- model discovery --------------------

#[derive(Debug, Deserialize)]
struct PreviewModelsRequest {
    provider: ChannelProvider,
    base_url: String,
    api_key: String,
}

#[derive(Debug, Serialize)]
struct ModelsResponse {
    models: Vec<upstream::ModelEntry>,
}

/// Probe an upstream with ad-hoc credentials (used by "get models" in the
/// create-channel form before persisting anything).
async fn preview_models(
    State(state): State<AppState>,
    _admin: AdminUser,
    Json(body): Json<PreviewModelsRequest>,
) -> AppResult<Json<ModelsResponse>> {
    if body.base_url.trim().is_empty() {
        return Err(AppError::BadRequest("base_url required".into()));
    }
    if body.api_key.trim().is_empty() {
        return Err(AppError::BadRequest("api_key required".into()));
    }
    let adapter = upstream::adapter_for(body.provider);
    let models = adapter
        .list_models(&state.http, body.base_url.trim_end_matches('/'), &body.api_key)
        .await?;
    Ok(Json(ModelsResponse { models }))
}

/// List models for an already-persisted channel.
async fn list_channel_models(
    State(state): State<AppState>,
    _admin: AdminUser,
    Path(id): Path<i64>,
) -> AppResult<Json<ModelsResponse>> {
    let ch = repo::channels::get(&state.db, id).await?;
    let api_key = state.cipher.decrypt(&ch.api_key_encrypted)?;
    let adapter = upstream::adapter_for(ch.provider);
    let models = adapter.list_models(&state.http, &ch.base_url, &api_key).await?;
    Ok(Json(ModelsResponse { models }))
}
