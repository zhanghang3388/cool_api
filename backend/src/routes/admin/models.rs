use axum::extract::{Path, State};
use axum::routing::{get, patch};
use axum::{Json, Router};
use serde::Deserialize;

use crate::auth::AdminUser;
use crate::error::{AppError, AppResult};
use crate::models::Model;
use crate::repo;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list).post(create))
        .route("/:id", patch(update).delete(remove))
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

    let m = repo::models::create(
        &state.db,
        repo::models::NewModel {
            name: &body.name,
            provider: &body.provider,
            input_price_cents: body.input_price_cents,
            output_price_cents: body.output_price_cents,
            cache_read_price_cents: body.cache_read_price_cents,
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

    let m = repo::models::update(
        &state.db,
        id,
        repo::models::UpdateModel {
            provider: body.provider.as_deref(),
            input_price_cents: body.input_price_cents,
            output_price_cents: body.output_price_cents,
            cache_read_price_cents: body.cache_read_price_cents,
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
