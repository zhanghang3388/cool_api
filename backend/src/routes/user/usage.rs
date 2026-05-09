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
struct LogRow {
    id: i64,
    model_name: String,
    prompt_tokens: i32,
    completion_tokens: i32,
    cached_tokens: i32,
    total_cost_cents: i64,
    latency_ms: i32,
    status: RequestStatus,
    error_message: Option<String>,
    created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
struct LogsResponse {
    items: Vec<LogRow>,
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
        items: page_data
            .items
            .into_iter()
            .map(|r| LogRow {
                id: r.id,
                model_name: r.model_name,
                prompt_tokens: r.prompt_tokens,
                completion_tokens: r.completion_tokens,
                cached_tokens: r.cached_tokens,
                total_cost_cents: r.total_cost_cents,
                latency_ms: r.latency_ms,
                status: r.status,
                error_message: r.error_message,
                created_at: r.created_at,
            })
            .collect(),
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
