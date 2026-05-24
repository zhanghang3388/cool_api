use axum::extract::{Path, State};
use axum::routing::{get, patch};
use axum::{Json, Router};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::auth::AuthUser;
use crate::error::{AppError, AppResult};
use crate::models::{ApiKey, ChannelProvider, Group};
use crate::repo;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list).post(create))
        .route("/:id", patch(update).delete(remove))
}

/// Per-provider group binding shown to the UI.
#[derive(Debug, Serialize)]
struct GroupBindingDto {
    provider: ChannelProvider,
    group_id: i64,
    group_name: String,
    group_label: String,
}

/// Safe response shape — never exposes the full plaintext key except on creation.
#[derive(Debug, Serialize)]
struct KeyDto {
    id: i64,
    name: String,
    prefix: String,
    enabled: bool,
    /// One entry per provider this key is bound to. Empty = no bindings (the
    /// key cannot route any traffic until at least one binding exists).
    groups: Vec<GroupBindingDto>,
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
    let key_ids: Vec<i64> = rows.iter().map(|k| k.id).collect();
    let bindings = repo::api_keys::groups_for_keys(&state.db, &key_ids).await?;
    Ok(Json(
        rows.into_iter()
            .map(|k| to_dto(k, &groups, &bindings))
            .collect(),
    ))
}

#[derive(Debug, Deserialize)]
struct CreateKeyRequest {
    #[serde(default)]
    name: String,
    /// Map of provider → group id. At least one entry required.
    groups: HashMap<ChannelProvider, i64>,
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
    if body.groups.is_empty() {
        return Err(AppError::BadRequest(
            "at least one provider group binding required".into(),
        ));
    }

    let mut bindings: Vec<(ChannelProvider, i64)> = Vec::with_capacity(body.groups.len());
    for (provider, group_id) in &body.groups {
        let group = resolve_group(&state, &auth, *group_id, *provider).await?;
        bindings.push((*provider, group.id));
    }

    let gen = repo::api_keys::generate_key();
    let plaintext = gen.plaintext.clone();
    let saved = repo::api_keys::create(
        &state.db,
        repo::api_keys::CreateApiKey {
            user_id: auth.user_id,
            name,
            groups: &bindings,
            generated: &gen,
        },
    )
    .await?;

    let groups = repo::groups::list(&state.db).await?;
    let mut all_bindings: HashMap<i64, HashMap<ChannelProvider, i64>> = HashMap::new();
    let mut for_this: HashMap<ChannelProvider, i64> = HashMap::new();
    for (p, g) in &bindings {
        for_this.insert(*p, *g);
    }
    all_bindings.insert(saved.id, for_this);
    let dto = to_dto(saved, &groups, &all_bindings);
    Ok(Json(CreatedKeyDto { key: dto, plaintext }))
}

#[derive(Debug, Deserialize)]
struct UpdateKeyRequest {
    name: Option<String>,
    enabled: Option<bool>,
    /// When provided, fully replaces the per-provider bindings for the key.
    /// Empty map clears all bindings (the key becomes unusable until rebound).
    groups: Option<HashMap<ChannelProvider, i64>>,
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

    if let Some(ref g) = body.groups {
        let mut bindings: Vec<(ChannelProvider, i64)> = Vec::with_capacity(g.len());
        for (provider, group_id) in g {
            let group = resolve_group(&state, &auth, *group_id, *provider).await?;
            bindings.push((*provider, group.id));
        }
        repo::api_keys::replace_groups(&state.db, id, &bindings).await?;
    }

    let saved = repo::api_keys::update(
        &state.db,
        auth.user_id,
        id,
        repo::api_keys::UpdateKey {
            name: body.name.as_deref(),
            enabled: body.enabled,
        },
    )
    .await?;

    let groups = repo::groups::list(&state.db).await?;
    let bindings = repo::api_keys::groups_for_keys(&state.db, &[saved.id]).await?;
    Ok(Json(to_dto(saved, &groups, &bindings)))
}

async fn remove(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<i64>,
) -> AppResult<Json<serde_json::Value>> {
    repo::api_keys::delete(&state.db, auth.user_id, id).await?;
    Ok(Json(serde_json::json!({ "deleted": true })))
}

async fn resolve_group(
    state: &AppState,
    auth: &AuthUser,
    id: i64,
    provider: ChannelProvider,
) -> AppResult<Group> {
    let group = repo::groups::get(&state.db, id)
        .await
        .map_err(|e| match e {
            AppError::NotFound => AppError::BadRequest("group not found".into()),
            other => other,
        })?;
    if group.provider != provider {
        return Err(AppError::BadRequest(format!(
            "group '{}' does not belong to provider {:?}",
            group.name, provider
        )));
    }
    if !group.enabled {
        return Err(AppError::BadRequest(format!(
            "group '{}' is disabled",
            group.name
        )));
    }
    let effective =
        repo::user_groups::effective_group_ids(&state.db, auth.user_id, auth.role).await?;
    if !effective.contains(&group.id) {
        return Err(AppError::Forbidden);
    }
    Ok(group)
}

fn to_dto(
    k: ApiKey,
    groups: &[Group],
    bindings: &HashMap<i64, HashMap<ChannelProvider, i64>>,
) -> KeyDto {
    let key_bindings = bindings.get(&k.id).cloned().unwrap_or_default();
    let mut group_dtos: Vec<GroupBindingDto> = key_bindings
        .into_iter()
        .map(|(provider, gid)| {
            let (group_name, group_label) = groups
                .iter()
                .find(|g| g.id == gid)
                .map(|g| (g.name.clone(), g.label.clone()))
                .unwrap_or_default();
            GroupBindingDto {
                provider,
                group_id: gid,
                group_name,
                group_label,
            }
        })
        .collect();
    // Stable order for the UI: anthropic before openai.
    group_dtos.sort_by_key(|g| match g.provider {
        ChannelProvider::Anthropic => 0,
        ChannelProvider::Openai => 1,
    });
    KeyDto {
        id: k.id,
        name: k.name,
        prefix: k.key_prefix,
        enabled: k.enabled,
        groups: group_dtos,
        last_used_at: k.last_used_at,
        created_at: k.created_at,
    }
}
