use axum::extract::{Path, State};
use axum::routing::{get, patch};
use axum::{Json, Router};
use bigdecimal::BigDecimal;
use serde::Deserialize;
use std::str::FromStr;

use crate::auth::AdminUser;
use crate::error::{AppError, AppResult};
use crate::models::Group;
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
) -> AppResult<Json<Vec<Group>>> {
    Ok(Json(repo::groups::list(&state.db).await?))
}

#[derive(Debug, Deserialize)]
struct CreateGroupRequest {
    name: String,
    label: String,
    multiplier: f64,
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
    Json(body): Json<CreateGroupRequest>,
) -> AppResult<Json<Group>> {
    validate_name(&body.name)?;
    if body.label.trim().is_empty() {
        return Err(AppError::BadRequest("label required".into()));
    }
    let multiplier = BigDecimal::from_str(&body.multiplier.to_string())
        .map_err(|_| AppError::BadRequest("invalid multiplier".into()))?;
    if multiplier < BigDecimal::from(0) {
        return Err(AppError::BadRequest("multiplier must be >= 0".into()));
    }

    let group = repo::groups::create(
        &state.db,
        repo::groups::NewGroup {
            name: &body.name,
            label: &body.label,
            multiplier,
            description: &body.description,
            enabled: body.enabled,
        },
    )
    .await?;
    Ok(Json(group))
}

#[derive(Debug, Deserialize)]
struct UpdateGroupRequest {
    label: Option<String>,
    multiplier: Option<f64>,
    description: Option<String>,
    enabled: Option<bool>,
}

async fn update(
    State(state): State<AppState>,
    _admin: AdminUser,
    Path(id): Path<i64>,
    Json(body): Json<UpdateGroupRequest>,
) -> AppResult<Json<Group>> {
    let multiplier = match body.multiplier {
        Some(v) => {
            let d = BigDecimal::from_str(&v.to_string())
                .map_err(|_| AppError::BadRequest("invalid multiplier".into()))?;
            if d < BigDecimal::from(0) {
                return Err(AppError::BadRequest("multiplier must be >= 0".into()));
            }
            Some(d)
        }
        None => None,
    };

    let group = repo::groups::update(
        &state.db,
        id,
        repo::groups::UpdateGroup {
            label: body.label.as_deref(),
            multiplier,
            description: body.description.as_deref(),
            enabled: body.enabled,
        },
    )
    .await?;
    Ok(Json(group))
}

async fn remove(
    State(state): State<AppState>,
    _admin: AdminUser,
    Path(id): Path<i64>,
) -> AppResult<Json<serde_json::Value>> {
    repo::groups::delete(&state.db, id).await?;
    Ok(Json(serde_json::json!({ "deleted": true })))
}

fn validate_name(name: &str) -> AppResult<()> {
    if name.is_empty() || name.len() > 64 {
        return Err(AppError::BadRequest("name length must be 1..=64".into()));
    }
    if !name
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err(AppError::BadRequest(
            "name must be alphanumeric, '-' or '_'".into(),
        ));
    }
    Ok(())
}
