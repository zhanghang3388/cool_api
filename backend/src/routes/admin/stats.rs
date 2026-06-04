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
        .route("/daily-by-model", get(daily_by_model))
        .route("/provider-distribution", get(provider_distribution))
        .route("/recent-requests", get(recent_requests))
        .route("/active-users", get(active_users))
        .route("/top-users", get(top_users))
        .route("/recent-topups", get(recent_topups))
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

#[derive(Debug, Deserialize)]
struct DailyByModelQuery {
    days: Option<i32>,
    group_id: Option<i64>,
}

async fn daily_by_model(
    State(state): State<AppState>,
    _admin: AdminUser,
    Query(q): Query<DailyByModelQuery>,
) -> AppResult<Json<Vec<repo::request_logs::DailyModelPoint>>> {
    let days = q.days.unwrap_or(7).clamp(1, 30);
    Ok(Json(
        repo::request_logs::daily_by_model_global(&state.db, days, q.group_id).await?,
    ))
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

async fn active_users(
    State(state): State<AppState>,
    _admin: AdminUser,
    Query(q): Query<RecentQuery>,
) -> AppResult<Json<Vec<repo::request_logs::ActiveUser>>> {
    let limit = q.limit.unwrap_or(8).clamp(1, 50);
    Ok(Json(repo::request_logs::active_users(&state.db, limit).await?))
}

#[derive(Debug, Deserialize)]
struct TopUsersQuery {
    #[serde(default)]
    days: Option<i32>,
    #[serde(default)]
    limit: Option<i64>,
}

async fn top_users(
    State(state): State<AppState>,
    _admin: AdminUser,
    Query(q): Query<TopUsersQuery>,
) -> AppResult<Json<Vec<repo::request_logs::TopUser>>> {
    let days = q.days.unwrap_or(7).clamp(1, 90);
    let limit = q.limit.unwrap_or(8).clamp(1, 50);
    Ok(Json(
        repo::request_logs::top_users_by_cost(&state.db, days, limit).await?,
    ))
}

async fn recent_topups(
    State(state): State<AppState>,
    _admin: AdminUser,
    Query(q): Query<RecentQuery>,
) -> AppResult<Json<Vec<repo::top_up_records::RecentTopUp>>> {
    let limit = q.limit.unwrap_or(8).clamp(1, 50);
    Ok(Json(repo::top_up_records::recent_success(&state.db, limit).await?))
}
