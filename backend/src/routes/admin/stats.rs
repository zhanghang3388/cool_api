use axum::extract::{Query, State};
use axum::routing::get;
use axum::{Json, Router};
use serde::Deserialize;

use crate::auth::AdminUser;
use crate::error::AppResult;
use crate::repo;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/overview", get(overview))
        .route("/requests-trend", get(requests_trend))
        .route("/provider-distribution", get(provider_distribution))
        .route("/recent-requests", get(recent_requests))
}

async fn overview(
    State(state): State<AppState>,
    _admin: AdminUser,
) -> AppResult<Json<repo::request_logs::AdminOverview>> {
    Ok(Json(repo::request_logs::admin_overview(&state.db).await?))
}

#[derive(Debug, Deserialize)]
struct TrendQuery {
    #[serde(default)]
    days: Option<i32>,
}

async fn requests_trend(
    State(state): State<AppState>,
    _admin: AdminUser,
    Query(q): Query<TrendQuery>,
) -> AppResult<Json<Vec<repo::request_logs::TrendPoint>>> {
    let days = q.days.unwrap_or(7).clamp(1, 90);
    Ok(Json(repo::request_logs::requests_trend(&state.db, days).await?))
}

async fn provider_distribution(
    State(state): State<AppState>,
    _admin: AdminUser,
) -> AppResult<Json<Vec<repo::request_logs::ProviderSlice>>> {
    Ok(Json(
        repo::request_logs::provider_distribution_today(&state.db).await?,
    ))
}

#[derive(Debug, Deserialize)]
struct RecentQuery {
    #[serde(default)]
    limit: Option<i64>,
}

async fn recent_requests(
    State(state): State<AppState>,
    _admin: AdminUser,
    Query(q): Query<RecentQuery>,
) -> AppResult<Json<Vec<repo::request_logs::RecentRequest>>> {
    let limit = q.limit.unwrap_or(10).clamp(1, 100);
    Ok(Json(repo::request_logs::recent_requests(&state.db, limit).await?))
}
