use axum::extract::{Path, State};
use axum::routing::{get, patch};
use axum::{Json, Router};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::auth::AuthUser;
use crate::error::{AppError, AppResult};
use crate::models::ApiKey;
use crate::repo;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list).post(create))
        .route("/:id", patch(update).delete(remove))
}

/// Safe response shape — never exposes the full plaintext key except on creation.
#[derive(Debug, Serialize)]
struct KeyDto {
    id: i64,
    name: String,
    prefix: String,
    enabled: bool,
    group_id: i64,
    group_name: String,
    group_label: String,
    last_used_at: Option<DateTime<Utc>>,
    created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
struct CreatedKeyDto {
    #[serde(flatten)]
    key: KeyDto,
    /// Plaintext key — only returned once, when the key is created.
    plaintext: String,
}

async fn list(
    State(state): State<AppState>,
    auth: AuthUser,
) -> AppResult<Json<Vec<KeyDto>>> {
    let rows = repo::api_keys::list_by_user(&state.db, auth.user_id).await?;
    let groups = repo::groups::list(&state.db).await?;
    Ok(Json(
        rows.into_iter()
            .map(|k| to_dto(k, &groups))
            .collect(),
    ))
}

#[derive(Debug, Deserialize)]
struct CreateKeyRequest {
    #[serde(default)]
    name: String,
    group_id: i64,
}

async fn create(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<CreateKeyRequest>,
) -> AppResult<Json<CreatedKeyDto>> {
    let name = body.name.trim();
    if name.len() > 64 {
        return Err(AppError::BadRequest("name too long (max 64)".into()));
    }
    let group = resolve_group(&state, body.group_id).await?;

    let gen = repo::api_keys::generate_key();
    let plaintext = gen.plaintext.clone();
    let saved = repo::api_keys::create(&state.db, auth.user_id, group.id, name, &gen).await?;
    let dto = KeyDto {
        id: saved.id,
        name: saved.name,
        prefix: saved.key_prefix,
        enabled: saved.enabled,
        group_id: group.id,
        group_name: group.name,
        group_label: group.label,
        last_used_at: saved.last_used_at,
        created_at: saved.created_at,
    };
    Ok(Json(CreatedKeyDto { key: dto, plaintext }))
}

#[derive(Debug, Deserialize)]
struct UpdateKeyRequest {
    name: Option<String>,
    enabled: Option<bool>,
    group_id: Option<i64>,
}

async fn update(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<i64>,
    Json(body): Json<UpdateKeyRequest>,
) -> AppResult<Json<KeyDto>> {
    if let Some(n) = body.name.as_deref() {
        if n.len() > 64 {
            return Err(AppError::BadRequest("name too long (max 64)".into()));
        }
    }
    if let Some(gid) = body.group_id {
        resolve_group(&state, gid).await?;
    }
    let saved = repo::api_keys::update(
        &state.db,
        auth.user_id,
        id,
        repo::api_keys::UpdateKey {
            name: body.name.as_deref(),
            enabled: body.enabled,
            group_id: body.group_id,
        },
    )
    .await?;
    let groups = repo::groups::list(&state.db).await?;
    Ok(Json(to_dto(saved, &groups)))
}

async fn remove(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<i64>,
) -> AppResult<Json<serde_json::Value>> {
    repo::api_keys::delete(&state.db, auth.user_id, id).await?;
    Ok(Json(serde_json::json!({ "deleted": true })))
}

async fn resolve_group(state: &AppState, id: i64) -> AppResult<crate::models::Group> {
    let group = repo::groups::get(&state.db, id)
        .await
        .map_err(|e| match e {
            AppError::NotFound => AppError::BadRequest("group not found".into()),
            other => other,
        })?;
    if !group.enabled {
        return Err(AppError::BadRequest(format!(
            "group '{}' is disabled",
            group.name
        )));
    }
    Ok(group)
}

fn to_dto(k: ApiKey, groups: &[crate::models::Group]) -> KeyDto {
    let (group_name, group_label) = groups
        .iter()
        .find(|g| g.id == k.group_id)
        .map(|g| (g.name.clone(), g.label.clone()))
        .unwrap_or_else(|| (String::new(), String::new()));
    KeyDto {
        id: k.id,
        name: k.name,
        prefix: k.key_prefix,
        enabled: k.enabled,
        group_id: k.group_id,
        group_name,
        group_label,
        last_used_at: k.last_used_at,
        created_at: k.created_at,
    }
}
