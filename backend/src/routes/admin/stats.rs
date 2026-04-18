use axum::{
    extract::{Query, State},
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;

use crate::auth::middleware::AdminUser;
use crate::error::AppError;
use crate::models::request_log::RequestLog;

#[derive(Debug, Deserialize)]
pub struct ListParams {
    pub page: Option<i64>,
    pub per_page: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct OverviewStats {
    pub total_requests: i64,
    pub total_tokens: i64,
    pub total_cost: i64,
    pub active_users: i64,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct DailyStats {
    pub date: String,
    pub requests: i64,
    pub tokens: i64,
    pub cost: i64,
}

pub fn router(pool: PgPool) -> Router {
    Router::new()
        .route("/logs", get(list_logs))
        .route("/overview", get(overview))
        .route("/daily", get(daily))
        .with_state(pool)
}

async fn list_logs(
    _admin: AdminUser,
    State(pool): State<PgPool>,
    Query(params): Query<ListParams>,
) -> Result<Json<Vec<RequestLog>>, AppError> {
    let page = params.page.unwrap_or(1).max(1);
    let per_page = params.per_page.unwrap_or(50).clamp(1, 200);
    let offset = (page - 1) * per_page;
    let logs = RequestLog::list_all(&pool, offset, per_page).await?;
    Ok(Json(logs))
}

async fn overview(
    _admin: AdminUser,
    State(pool): State<PgPool>,
) -> Result<Json<OverviewStats>, AppError> {
    let (total_requests,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM request_logs")
        .fetch_one(&pool)
        .await?;

    let row: (Option<i64>, Option<i64>) = sqlx::query_as(
        "SELECT COALESCE(SUM(total_tokens), 0), COALESCE(SUM(cost), 0) FROM request_logs"
    )
    .fetch_one(&pool)
    .await?;

    let (active_users,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM users WHERE is_active = true")
        .fetch_one(&pool)
        .await?;

    Ok(Json(OverviewStats {
        total_requests,
        total_tokens: row.0.unwrap_or(0),
        total_cost: row.1.unwrap_or(0),
        active_users,
    }))
}

async fn daily(
    _admin: AdminUser,
    State(pool): State<PgPool>,
) -> Result<Json<Vec<DailyStats>>, AppError> {
    let rows: Vec<DailyStats> = sqlx::query_as(
        "SELECT
            TO_CHAR(created_at::date, 'YYYY-MM-DD') as date,
            COUNT(*) as requests,
            COALESCE(SUM(total_tokens), 0) as tokens,
            COALESCE(SUM(cost), 0) as cost
         FROM request_logs
         WHERE created_at >= NOW() - INTERVAL '30 days'
         GROUP BY created_at::date
         ORDER BY created_at::date"
    )
    .fetch_all(&pool)
    .await?;

    Ok(Json(rows))
}
