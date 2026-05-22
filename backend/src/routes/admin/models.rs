use axum::extract::{Path, State};
use axum::routing::{get, patch, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};

use crate::auth::AdminUser;
use crate::error::{AppError, AppResult};
use crate::models::{ChannelProvider, Model};
use crate::repo;
use crate::services::pricing_oracle;
use crate::upstream;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list).post(create))
        .route("/:id", patch(update).delete(remove))
        .route("/sync/preview", post(sync_preview))
        .route("/sync/apply", post(sync_apply))
}

async fn list(
    State(state): State<AppState>,
    _admin: AdminUser,
) -> AppResult<Json<Vec<Model>>> {
    Ok(Json(repo::models::list(&state.db).await?))
}

#[derive(Debug, Deserialize)]
struct CreateModelRequest {
    name: String,
    provider: String,
    input_price_cents: i64,
    output_price_cents: i64,
    cache_read_price_cents: Option<i64>,
    cache_write_price_cents: Option<i64>,
    #[serde(default)]
    description: String,
    #[serde(default = "default_true")]
    enabled: bool,
}

fn default_true() -> bool {
    true
}

async fn create(
    State(state): State<AppState>,
    _admin: AdminUser,
    Json(body): Json<CreateModelRequest>,
) -> AppResult<Json<Model>> {
    if body.name.trim().is_empty() {
        return Err(AppError::BadRequest("name required".into()));
    }
    if body.provider.trim().is_empty() {
        return Err(AppError::BadRequest("provider required".into()));
    }
    if body.input_price_cents < 0 || body.output_price_cents < 0 {
        return Err(AppError::BadRequest("prices must be >= 0".into()));
    }
    if let Some(c) = body.cache_read_price_cents {
        if c < 0 {
            return Err(AppError::BadRequest(
                "cache_read_price_cents must be >= 0".into(),
            ));
        }
    }
    if let Some(c) = body.cache_write_price_cents {
        if c < 0 {
            return Err(AppError::BadRequest(
                "cache_write_price_cents must be >= 0".into(),
            ));
        }
    }

    let m = repo::models::create(
        &state.db,
        repo::models::NewModel {
            name: &body.name,
            provider: &body.provider,
            input_price_cents: body.input_price_cents,
            output_price_cents: body.output_price_cents,
            cache_read_price_cents: body.cache_read_price_cents,
            cache_write_price_cents: body.cache_write_price_cents,
            enabled: body.enabled,
            description: &body.description,
        },
    )
    .await?;
    Ok(Json(m))
}

#[derive(Debug, Deserialize)]
struct UpdateModelRequest {
    provider: Option<String>,
    input_price_cents: Option<i64>,
    output_price_cents: Option<i64>,
    /// Use `Some(None)` to clear, `Some(Some(v))` to set, omit field to keep.
    #[serde(default, deserialize_with = "deserialize_optional_field")]
    cache_read_price_cents: Option<Option<i64>>,
    #[serde(default, deserialize_with = "deserialize_optional_field")]
    cache_write_price_cents: Option<Option<i64>>,
    enabled: Option<bool>,
    description: Option<String>,
}

fn deserialize_optional_field<'de, D, T>(de: D) -> Result<Option<Option<T>>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: serde::Deserialize<'de>,
{
    Ok(Some(Option::deserialize(de)?))
}

async fn update(
    State(state): State<AppState>,
    _admin: AdminUser,
    Path(id): Path<i64>,
    Json(body): Json<UpdateModelRequest>,
) -> AppResult<Json<Model>> {
    if let Some(v) = body.input_price_cents {
        if v < 0 {
            return Err(AppError::BadRequest("input_price_cents must be >= 0".into()));
        }
    }
    if let Some(v) = body.output_price_cents {
        if v < 0 {
            return Err(AppError::BadRequest("output_price_cents must be >= 0".into()));
        }
    }
    if let Some(Some(v)) = body.cache_read_price_cents {
        if v < 0 {
            return Err(AppError::BadRequest(
                "cache_read_price_cents must be >= 0".into(),
            ));
        }
    }
    if let Some(Some(v)) = body.cache_write_price_cents {
        if v < 0 {
            return Err(AppError::BadRequest(
                "cache_write_price_cents must be >= 0".into(),
            ));
        }
    }

    let m = repo::models::update(
        &state.db,
        id,
        repo::models::UpdateModel {
            provider: body.provider.as_deref(),
            input_price_cents: body.input_price_cents,
            output_price_cents: body.output_price_cents,
            cache_read_price_cents: body.cache_read_price_cents,
            cache_write_price_cents: body.cache_write_price_cents,
            enabled: body.enabled,
            description: body.description.as_deref(),
        },
    )
    .await?;
    Ok(Json(m))
}

async fn remove(
    State(state): State<AppState>,
    _admin: AdminUser,
    Path(id): Path<i64>,
) -> AppResult<Json<serde_json::Value>> {
    repo::models::delete(&state.db, id).await?;
    Ok(Json(serde_json::json!({ "deleted": true })))
}

// -------------------- sync from channel --------------------

#[derive(Debug, Deserialize)]
struct SyncPreviewRequest {
    channel_id: i64,
}

#[derive(Debug, Serialize)]
struct OfficialPrice {
    input_price_cents: i64,
    output_price_cents: i64,
    cache_read_price_cents: Option<i64>,
    cache_write_price_cents: Option<i64>,
}

/// One row in the sync preview. Models without an official price entry on
/// models.dev are filtered out before this list is built — admin asked for
/// "skip" semantics, so we don't even surface them in the UI.
#[derive(Debug, Serialize)]
struct SyncPreviewItem {
    model_name: String,
    /// True when this model already exists in the local catalog.
    exists: bool,
    official: OfficialPrice,
}

#[derive(Debug, Serialize)]
struct SyncPreviewResponse {
    channel_id: i64,
    channel_name: String,
    channel_provider: ChannelProvider,
    /// Total model names returned by the upstream `/v1/models`.
    upstream_total: usize,
    /// Number filtered out for lacking a models.dev entry.
    no_pricing: usize,
    /// Sorted by model name. Already-existing rows still appear so admin
    /// can see what would be skipped; they're not selectable.
    items: Vec<SyncPreviewItem>,
}

async fn sync_preview(
    State(state): State<AppState>,
    _admin: AdminUser,
    Json(body): Json<SyncPreviewRequest>,
) -> AppResult<Json<SyncPreviewResponse>> {
    let channel = repo::channels::get(&state.db, body.channel_id).await?;
    let api_key = state.cipher.decrypt(&channel.api_key_encrypted)?;
    let adapter = upstream::adapter_for(channel.provider);
    let upstream_models = adapter
        .list_models(&state.http, &channel.base_url, &api_key)
        .await?;
    let upstream_total = upstream_models.len();

    let table = pricing_oracle::get_pricing_table(&state.http).await?;
    // Use the channel's own provider as the canonical price source. We
    // explicitly do NOT fall back to other providers: a reseller's
    // discount price isn't an "official" price.
    let canonical_key = canonical_provider_key(channel.provider);
    let canonical = table.get(canonical_key);

    // Pre-load all existing model names once so we don't N+1 the DB.
    let existing: std::collections::HashSet<String> = repo::models::list(&state.db)
        .await?
        .into_iter()
        .map(|m| m.name)
        .collect();

    let mut items: Vec<SyncPreviewItem> = Vec::new();
    let mut no_pricing = 0usize;
    let mut seen = std::collections::HashSet::<String>::new();
    for entry in upstream_models {
        let name = entry.id;
        if !seen.insert(name.clone()) {
            continue; // upstream listed the same id twice — ignore the dup
        }
        let Some(price) = canonical.and_then(|m| m.get(&name)) else {
            no_pricing += 1;
            continue;
        };
        items.push(SyncPreviewItem {
            exists: existing.contains(&name),
            official: OfficialPrice {
                input_price_cents: price.input_cents,
                output_price_cents: price.output_cents,
                cache_read_price_cents: price.cache_read_cents,
                cache_write_price_cents: price.cache_write_cents,
            },
            model_name: name,
        });
    }
    items.sort_by(|a, b| a.model_name.cmp(&b.model_name));

    Ok(Json(SyncPreviewResponse {
        channel_id: channel.id,
        channel_name: channel.name,
        channel_provider: channel.provider,
        upstream_total,
        no_pricing,
        items,
    }))
}

#[derive(Debug, Deserialize)]
struct SyncApplyRequest {
    channel_id: i64,
    /// Subset of the preview's `items` that admin wants to import.
    model_names: Vec<String>,
}

#[derive(Debug, Serialize)]
struct SyncApplyResponse {
    /// Names that were inserted as new rows.
    added: Vec<String>,
    /// Names that already existed (skipped, never overwritten).
    skipped_existing: Vec<String>,
    /// Names without a models.dev entry (or that vanished from cache).
    skipped_no_price: Vec<String>,
}

async fn sync_apply(
    State(state): State<AppState>,
    _admin: AdminUser,
    Json(body): Json<SyncApplyRequest>,
) -> AppResult<Json<SyncApplyResponse>> {
    let channel = repo::channels::get(&state.db, body.channel_id).await?;
    let table = pricing_oracle::get_pricing_table(&state.http).await?;
    let canonical_key = canonical_provider_key(channel.provider);
    let canonical = table.get(canonical_key);
    let provider_label = match channel.provider {
        ChannelProvider::Openai => "OpenAI",
        ChannelProvider::Anthropic => "Anthropic",
    };

    let mut added = Vec::new();
    let mut skipped_existing = Vec::new();
    let mut skipped_no_price = Vec::new();

    for name in body.model_names {
        let trimmed = name.trim();
        if trimmed.is_empty() {
            continue;
        }
        // Existing rows are never overwritten — admin's explicit policy.
        if repo::models::get_by_name(&state.db, trimmed).await?.is_some() {
            skipped_existing.push(trimmed.to_string());
            continue;
        }
        let Some(price) = canonical.and_then(|m| m.get(trimmed)) else {
            skipped_no_price.push(trimmed.to_string());
            continue;
        };
        repo::models::create(
            &state.db,
            repo::models::NewModel {
                name: trimmed,
                provider: provider_label,
                input_price_cents: price.input_cents,
                output_price_cents: price.output_cents,
                cache_read_price_cents: price.cache_read_cents,
                cache_write_price_cents: price.cache_write_cents,
                enabled: true,
                description: "",
            },
        )
        .await?;
        added.push(trimmed.to_string());
    }

    Ok(Json(SyncApplyResponse {
        added,
        skipped_existing,
        skipped_no_price,
    }))
}

/// Map our channel provider enum to the matching top-level key used by
/// models.dev. New variants must be added here too.
fn canonical_provider_key(provider: ChannelProvider) -> &'static str {
    match provider {
        ChannelProvider::Openai => "openai",
        ChannelProvider::Anthropic => "anthropic",
    }
}
