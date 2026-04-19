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

#[derive(Debug, Deserialize)]
pub struct DaysParams {
    #[serde(default = "default_days")]
    pub days: i64,
}

fn default_days() -> i64 {
    30
}

#[derive(Debug, Serialize)]
pub struct OverviewStats {
    pub total_requests: i64,
    pub total_tokens: i64,
    pub total_cost: i64,
    pub active_users: i64,
}

#[derive(Debug, Serialize)]
pub struct TodayStats {
    pub today_requests: i64,
    pub today_cost: i64,
    pub requests_change: f64,
    pub cost_change: f64,
    pub active_tokens: i64,
    pub online_users: i64,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct DailyStats {
    pub date: String,
    pub requests: i64,
    pub tokens: i64,
    pub cost: i64,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct ModelRanking {
    pub model: String,
    pub count: i64,
}

pub fn router(pool: PgPool) -> Router {
    Router::new()
        .route("/logs", get(list_logs))
        .route("/overview", get(overview))
        .route("/today", get(today_stats))
        .route("/daily", get(daily))
        .route("/model-ranking", get(model_ranking))
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

async fn today_stats(
    _admin: AdminUser,
    State(pool): State<PgPool>,
) -> Result<Json<TodayStats>, AppError> {
    // Today's requests and cost
    let today: (i64, Option<i64>) = sqlx::query_as(
        "SELECT COUNT(*), COALESCE(SUM(cost), 0) FROM request_logs WHERE created_at >= CURRENT_DATE"
    )
    .fetch_one(&pool)
    .await?;
    let today_requests = today.0;
    let today_cost = today.1.unwrap_or(0);

    // Yesterday's requests and cost
    let yesterday: (i64, Option<i64>) = sqlx::query_as(
        "SELECT COUNT(*), COALESCE(SUM(cost), 0) FROM request_logs WHERE created_at >= CURRENT_DATE - INTERVAL '1 day' AND created_at < CURRENT_DATE"
    )
    .fetch_one(&pool)
    .await?;
    let yesterday_requests = yesterday.0;
    let yesterday_cost = yesterday.1.unwrap_or(0);

    // Percentage change
    let requests_change = if yesterday_requests == 0 {
        if today_requests > 0 { 100.0 } else { 0.0 }
    } else {
        ((today_requests - yesterday_requests) as f64 / yesterday_requests as f64) * 100.0
    };
    let cost_change = if yesterday_cost == 0 {
        if today_cost > 0 { 100.0 } else { 0.0 }
    } else {
        ((today_cost - yesterday_cost) as f64 / yesterday_cost as f64) * 100.0
    };

    // Active tokens
    let (active_tokens,): (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM relay_keys WHERE is_active = true"
    )
    .fetch_one(&pool)
    .await?;

    // Online users (distinct user_id in last 5 minutes)
    let (online_users,): (i64,) = sqlx::query_as(
        "SELECT COUNT(DISTINCT user_id) FROM request_logs WHERE created_at >= NOW() - INTERVAL '5 minutes'"
    )
    .fetch_one(&pool)
    .await?;

    Ok(Json(TodayStats {
        today_requests,
        today_cost,
        requests_change,
        cost_change,
        active_tokens,
        online_users,
    }))
}

async fn daily(
    _admin: AdminUser,
    State(pool): State<PgPool>,
    Query(params): Query<DaysParams>,
) -> Result<Json<Vec<DailyStats>>, AppError> {
    let days = if params.days <= 7 { 7 } else { 30 };

    let rows: Vec<DailyStats> = if days == 7 {
        sqlx::query_as(
            "SELECT
                TO_CHAR(created_at::date, 'YYYY-MM-DD') as date,
                COUNT(*) as requests,
                COALESCE(SUM(total_tokens), 0) as tokens,
                COALESCE(SUM(cost), 0) as cost
             FROM request_logs
             WHERE created_at >= NOW() - INTERVAL '7 days'
             GROUP BY created_at::date
             ORDER BY created_at::date"
        )
        .fetch_all(&pool)
        .await?
    } else {
        sqlx::query_as(
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
        .await?
    };

    Ok(Json(rows))
}

async fn model_ranking(
    _admin: AdminUser,
    State(pool): State<PgPool>,
    Query(params): Query<DaysParams>,
) -> Result<Json<Vec<ModelRanking>>, AppError> {
    let days = if params.days <= 7 { 7 } else { 30 };

    let rows: Vec<ModelRanking> = if days == 7 {
        sqlx::query_as(
            "SELECT model, COUNT(*) as count
             FROM request_logs
             WHERE created_at >= NOW() - INTERVAL '7 days'
             GROUP BY model
             ORDER BY count DESC
             LIMIT 10"
        )
        .fetch_all(&pool)
        .await?
    } else {
        sqlx::query_as(
            "SELECT model, COUNT(*) as count
             FROM request_logs
             WHERE created_at >= NOW() - INTERVAL '30 days'
             GROUP BY model
             ORDER BY count DESC
             LIMIT 10"
        )
        .fetch_all(&pool)
        .await?
    };

    Ok(Json(rows))
}
