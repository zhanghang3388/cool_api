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
}

#[derive(Debug, Deserialize)]
struct LogsQuery {
    #[serde(default)]
    page: Option<i64>,
    #[serde(default)]
    page_size: Option<i64>,
    model: Option<String>,
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
