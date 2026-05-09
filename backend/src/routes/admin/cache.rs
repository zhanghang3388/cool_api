use axum::extract::{Query, State};
use axum::routing::{delete, get, patch};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};

use crate::auth::AdminUser;
use crate::error::{AppError, AppResult};
use crate::repo;
use crate::services::cache;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/stats", get(stats))
        .route("/settings", get(get_settings).patch(patch_settings))
        .route("/entries", get(list_entries))
        .route("/all", delete(clear_all))
}

async fn stats(
    State(state): State<AppState>,
    _admin: AdminUser,
) -> AppResult<Json<cache::CacheStats>> {
    match state.redis.clone() {
        Some(mut redis) => cache::stats(&mut redis)
            .await
            .map(Json)
            .map_err(|e| AppError::Internal(format!("redis: {e}"))),
        None => Ok(Json(cache::CacheStats {
            total_entries: 0,
            total_hits: 0,
            total_stores: 0,
            saved_tokens: 0,
            saved_cents: 0,
            hit_rate: 0.0,
        })),
    }
}

async fn get_settings(
    State(state): State<AppState>,
    _admin: AdminUser,
) -> AppResult<Json<repo::system_settings::CacheConfig>> {
    Ok(Json(
        repo::system_settings::get_cache_config(&state.db).await?,
    ))
}

#[derive(Debug, Deserialize)]
struct PatchSettings {
    enabled: Option<bool>,
    ttl_seconds: Option<i64>,
    recent_keys_limit: Option<i64>,
}

async fn patch_settings(
    State(state): State<AppState>,
    _admin: AdminUser,
    Json(body): Json<PatchSettings>,
) -> AppResult<Json<repo::system_settings::CacheConfig>> {
    let mut cfg = repo::system_settings::get_cache_config(&state.db).await?;
    if let Some(v) = body.enabled {
        cfg.enabled = v;
    }
    if let Some(v) = body.ttl_seconds {
        if v < 1 {
            return Err(AppError::BadRequest("ttl_seconds must be >= 1".into()));
        }
        cfg.ttl_seconds = v;
    }
    if let Some(v) = body.recent_keys_limit {
        if v < 0 || v > 5000 {
            return Err(AppError::BadRequest(
                "recent_keys_limit must be between 0 and 5000".into(),
            ));
        }
        cfg.recent_keys_limit = v;
    }
    repo::system_settings::update_cache_config(&state.db, &cfg).await?;
    Ok(Json(cfg))
}

#[derive(Debug, Deserialize)]
struct EntriesQuery {
    limit: Option<i64>,
}

async fn list_entries(
    State(state): State<AppState>,
    _admin: AdminUser,
    Query(q): Query<EntriesQuery>,
) -> AppResult<Json<Vec<cache::CacheEntrySummary>>> {
    let limit = q.limit.unwrap_or(50).clamp(1, 500);
    match state.redis.clone() {
        Some(mut redis) => cache::list_recent(&mut redis, limit)
            .await
            .map(Json)
            .map_err(|e| AppError::Internal(format!("redis: {e}"))),
        None => Ok(Json(vec![])),
    }
}

#[derive(Debug, Serialize)]
struct ClearResponse {
    deleted: i64,
}

async fn clear_all(
    State(state): State<AppState>,
    _admin: AdminUser,
) -> AppResult<Json<ClearResponse>> {
    match state.redis.clone() {
        Some(mut redis) => {
            let deleted = cache::clear_all(&mut redis)
                .await
                .map_err(|e| AppError::Internal(format!("redis: {e}")))?;
            Ok(Json(ClearResponse { deleted }))
        }
        None => Ok(Json(ClearResponse { deleted: 0 })),
    }
}
