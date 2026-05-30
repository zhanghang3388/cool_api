use axum::extract::{Query, State};
use axum::routing::get;
use axum::{Json, Router};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::auth::AuthUser;
use crate::error::AppResult;
use crate::models::RequestStatus;
use crate::repo;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/logs", get(logs))
        .route("/summary", get(summary))
        .route("/daily-by-group", get(daily_by_group))
        .route("/daily-by-model", get(daily_by_model))
        .route("/group-health", get(group_health))
        .route("/group-liveness", get(group_liveness))
}

#[derive(Debug, Deserialize)]
struct LogsQuery {
    #[serde(default)]
    page: Option<i64>,
    #[serde(default)]
    page_size: Option<i64>,
    model: Option<String>,
    group_id: Option<i64>,
    status: Option<RequestStatus>,
    from: Option<DateTime<Utc>>,
    to: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize)]
struct LogsResponse {
    items: Vec<repo::request_logs::UserLogRow>,
    total: i64,
    page: i64,
    page_size: i64,
}

async fn logs(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(q): Query<LogsQuery>,
) -> AppResult<Json<LogsResponse>> {
    let page = q.page.unwrap_or(1).max(1);
    let page_size = q.page_size.unwrap_or(20).clamp(1, 100);
    let offset = (page - 1) * page_size;

    let filter = repo::request_logs::LogFilter {
        user_id: Some(auth.user_id),
        model: q.model.as_deref(),
        group_id: q.group_id,
        status: q.status,
        from: q.from,
        to: q.to,
    };
    let page_data = repo::request_logs::list(&state.db, filter, page_size, offset).await?;
    Ok(Json(LogsResponse {
        items: page_data.items,
        total: page_data.total,
        page,
        page_size,
    }))
}

async fn summary(
    State(state): State<AppState>,
    auth: AuthUser,
) -> AppResult<Json<repo::request_logs::UserUsageSummary>> {
    let s = repo::request_logs::summarize_by_user(&state.db, auth.user_id).await?;
    Ok(Json(s))
}

#[derive(Debug, Deserialize)]
struct DailyByGroupQuery {
    /// How many trailing days to include (clamped 1..=30). Defaults to 7.
    days: Option<i32>,
}

async fn daily_by_group(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(q): Query<DailyByGroupQuery>,
) -> AppResult<Json<Vec<repo::request_logs::DailyGroupPoint>>> {
    let days = q.days.unwrap_or(7).clamp(1, 30);
    let rows = repo::request_logs::daily_by_group_for_user(&state.db, auth.user_id, days).await?;
    Ok(Json(rows))
}

#[derive(Debug, Deserialize)]
struct DailyByModelQuery {
    /// How many trailing days to include (clamped 1..=30). Defaults to 7.
    days: Option<i32>,
    /// Optional: restrict to one group. Omitting it (or sending `all`)
    /// merges identical model names across all the user's groups.
    group_id: Option<i64>,
}

async fn daily_by_model(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(q): Query<DailyByModelQuery>,
) -> AppResult<Json<Vec<repo::request_logs::DailyModelPoint>>> {
    let days = q.days.unwrap_or(7).clamp(1, 30);
    let rows = repo::request_logs::daily_by_model_for_user(
        &state.db,
        auth.user_id,
        days,
        q.group_id,
    )
    .await?;
    Ok(Json(rows))
}

#[derive(Debug, Deserialize)]
struct GroupHealthQuery {
    /// Look-back window in minutes (clamped 5..=1440). Defaults to 60.
    minutes: Option<i32>,
}

async fn group_health(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(q): Query<GroupHealthQuery>,
) -> AppResult<Json<Vec<repo::request_logs::GroupHealth>>> {
    let minutes = q.minutes.unwrap_or(60).clamp(5, 1440);
    let group_ids =
        repo::user_groups::effective_group_ids(&state.db, auth.user_id, auth.role).await?;
    let rows =
        repo::request_logs::group_health_for_user(&state.db, auth.user_id, &group_ids, minutes)
            .await?;
    Ok(Json(rows))
}

async fn group_liveness(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(q): Query<GroupHealthQuery>,
) -> AppResult<Json<Vec<repo::channel_probes::GroupLiveness>>> {
    let minutes = q.minutes.unwrap_or(60).clamp(5, 1440);
    let group_ids =
        repo::user_groups::effective_group_ids(&state.db, auth.user_id, auth.role).await?;
    let rows = repo::channel_probes::group_liveness_for_user(&state.db, &group_ids, minutes).await?;
    Ok(Json(rows))
}
