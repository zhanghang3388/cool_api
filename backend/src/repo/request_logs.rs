use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::PgPool;

use crate::error::AppResult;
use crate::models::{RequestLog, RequestStatus};

const COLUMNS: &str = "id, user_id, channel_id, group_id, model_name, \
    prompt_tokens, completion_tokens, cached_tokens, \
    input_cost_cents, output_cost_cents, total_cost_cents, \
    multiplier_applied, latency_ms, status, error_message, created_at";

#[derive(Default)]
pub struct LogFilter<'a> {
    pub user_id: Option<i64>,
    pub model: Option<&'a str>,
    pub status: Option<RequestStatus>,
    pub from: Option<DateTime<Utc>>,
    pub to: Option<DateTime<Utc>>,
}

pub struct Page<T> {
    pub items: Vec<T>,
    pub total: i64,
}

pub async fn list(
    pool: &PgPool,
    filter: LogFilter<'_>,
    limit: i64,
    offset: i64,
) -> AppResult<Page<RequestLog>> {
    // Build dynamic WHERE. sqlx supports named-positional binding via query builder;
    // here the filter set is small so we inline the pattern.
    let mut clauses: Vec<String> = Vec::new();
    let mut idx = 1;
    if filter.user_id.is_some() {
        clauses.push(format!("user_id = ${idx}"));
        idx += 1;
    }
    if filter.model.is_some() {
        clauses.push(format!("model_name = ${idx}"));
        idx += 1;
    }
    if filter.status.is_some() {
        clauses.push(format!("status = ${idx}"));
        idx += 1;
    }
    if filter.from.is_some() {
        clauses.push(format!("created_at >= ${idx}"));
        idx += 1;
    }
    if filter.to.is_some() {
        clauses.push(format!("created_at < ${idx}"));
        idx += 1;
    }
    let where_sql = if clauses.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", clauses.join(" AND "))
    };

    let list_sql = format!(
        "SELECT {COLUMNS} FROM request_logs {where_sql} \
         ORDER BY created_at DESC, id DESC LIMIT ${limit_idx} OFFSET ${offset_idx}",
        limit_idx = idx,
        offset_idx = idx + 1,
    );
    let count_sql = format!("SELECT COUNT(*) FROM request_logs {where_sql}");

    let mut list_q = sqlx::query_as::<_, RequestLog>(&list_sql);
    let mut count_q = sqlx::query_scalar::<_, i64>(&count_sql);
    if let Some(v) = filter.user_id {
        list_q = list_q.bind(v);
        count_q = count_q.bind(v);
    }
    if let Some(v) = filter.model {
        list_q = list_q.bind(v);
        count_q = count_q.bind(v);
    }
    if let Some(v) = filter.status {
        list_q = list_q.bind(v);
        count_q = count_q.bind(v);
    }
    if let Some(v) = filter.from {
        list_q = list_q.bind(v);
        count_q = count_q.bind(v);
    }
    if let Some(v) = filter.to {
        list_q = list_q.bind(v);
        count_q = count_q.bind(v);
    }
    list_q = list_q.bind(limit).bind(offset);

    let items = list_q.fetch_all(pool).await?;
    let total = count_q.fetch_one(pool).await?;
    Ok(Page { items, total })
}

/// Per-user running totals used by the user console.
#[derive(Debug, Serialize)]
pub struct UserUsageSummary {
    pub today_requests: i64,
    pub today_tokens: i64,
    pub today_cost_cents: i64,
    pub total_requests: i64,
    pub total_tokens: i64,
    pub total_cost_cents: i64,
}

pub async fn summarize_by_user(pool: &PgPool, user_id: i64) -> AppResult<UserUsageSummary> {
    let row: (i64, i64, i64, i64, i64, i64) = sqlx::query_as(
        "SELECT \
            COALESCE(SUM(CASE WHEN created_at >= date_trunc('day', NOW()) THEN 1 ELSE 0 END), 0)::BIGINT, \
            COALESCE(SUM(CASE WHEN created_at >= date_trunc('day', NOW()) \
                              THEN prompt_tokens + completion_tokens ELSE 0 END), 0)::BIGINT, \
            COALESCE(SUM(CASE WHEN created_at >= date_trunc('day', NOW()) \
                              THEN total_cost_cents ELSE 0 END), 0)::BIGINT, \
            COUNT(*)::BIGINT, \
            COALESCE(SUM(prompt_tokens + completion_tokens), 0)::BIGINT, \
            COALESCE(SUM(total_cost_cents), 0)::BIGINT \
         FROM request_logs WHERE user_id = $1",
    )
    .bind(user_id)
    .fetch_one(pool)
    .await?;
    Ok(UserUsageSummary {
        today_requests: row.0,
        today_tokens: row.1,
        today_cost_cents: row.2,
        total_requests: row.3,
        total_tokens: row.4,
        total_cost_cents: row.5,
    })
}

// -------------------- admin stats --------------------

#[derive(Debug, Serialize)]
pub struct AdminOverview {
    pub today_requests: i64,
    pub today_tokens: i64,
    pub today_revenue_cents: i64,
    pub active_users_today: i64,
}

pub async fn admin_overview(pool: &PgPool) -> AppResult<AdminOverview> {
    let row: (i64, i64, i64, i64) = sqlx::query_as(
        "SELECT \
            COALESCE(COUNT(*), 0)::BIGINT, \
            COALESCE(SUM(prompt_tokens + completion_tokens), 0)::BIGINT, \
            COALESCE(SUM(total_cost_cents), 0)::BIGINT, \
            COALESCE(COUNT(DISTINCT user_id), 0)::BIGINT \
         FROM request_logs WHERE created_at >= date_trunc('day', NOW())",
    )
    .fetch_one(pool)
    .await?;
    Ok(AdminOverview {
        today_requests: row.0,
        today_tokens: row.1,
        today_revenue_cents: row.2,
        active_users_today: row.3,
    })
}

#[derive(Debug, Serialize)]
pub struct TrendPoint {
    pub day: DateTime<Utc>,
    pub requests: i64,
    pub tokens: i64,
    pub cost_cents: i64,
}

pub async fn requests_trend(pool: &PgPool, days: i32) -> AppResult<Vec<TrendPoint>> {
    // Generate a row per day for the last `days` days, left-join aggregates so
    // empty days still appear as zeros.
    let rows: Vec<(DateTime<Utc>, i64, i64, i64)> = sqlx::query_as(
        "WITH series AS (\
            SELECT generate_series(\
                date_trunc('day', NOW()) - (($1::INT - 1) * INTERVAL '1 day'), \
                date_trunc('day', NOW()), \
                INTERVAL '1 day'\
            )::TIMESTAMPTZ AS day\
         )\
         SELECT \
            series.day, \
            COALESCE(COUNT(r.id), 0)::BIGINT, \
            COALESCE(SUM(r.prompt_tokens + r.completion_tokens), 0)::BIGINT, \
            COALESCE(SUM(r.total_cost_cents), 0)::BIGINT \
         FROM series \
         LEFT JOIN request_logs r \
                ON r.created_at >= series.day \
               AND r.created_at < series.day + INTERVAL '1 day' \
         GROUP BY series.day \
         ORDER BY series.day ASC",
    )
    .bind(days)
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|(day, requests, tokens, cost_cents)| TrendPoint {
            day,
            requests,
            tokens,
            cost_cents,
        })
        .collect())
}

#[derive(Debug, Serialize)]
pub struct ProviderSlice {
    pub provider: String,
    pub requests: i64,
}

pub async fn provider_distribution_today(pool: &PgPool) -> AppResult<Vec<ProviderSlice>> {
    let rows: Vec<(Option<String>, i64)> = sqlx::query_as(
        "SELECT c.provider::TEXT, COUNT(*)::BIGINT \
         FROM request_logs r \
         LEFT JOIN channels c ON c.id = r.channel_id \
         WHERE r.created_at >= date_trunc('day', NOW()) \
         GROUP BY c.provider \
         ORDER BY 2 DESC",
    )
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|(p, n)| ProviderSlice {
            provider: p.unwrap_or_else(|| "unknown".into()),
            requests: n,
        })
        .collect())
}

#[derive(Debug, Serialize)]
pub struct RecentRequest {
    pub id: i64,
    pub user_id: i64,
    pub username: String,
    pub model_name: String,
    pub tokens: i64,
    pub total_cost_cents: i64,
    pub status: RequestStatus,
    pub created_at: DateTime<Utc>,
}

pub async fn recent_requests(pool: &PgPool, limit: i64) -> AppResult<Vec<RecentRequest>> {
    let rows: Vec<(i64, i64, String, String, i64, i64, RequestStatus, DateTime<Utc>)> = sqlx::query_as(
        "SELECT r.id, r.user_id, u.username, r.model_name, \
                (r.prompt_tokens + r.completion_tokens)::BIGINT, \
                r.total_cost_cents, r.status, r.created_at \
         FROM request_logs r \
         JOIN users u ON u.id = r.user_id \
         ORDER BY r.created_at DESC, r.id DESC \
         LIMIT $1",
    )
    .bind(limit)
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|r| RecentRequest {
            id: r.0,
            user_id: r.1,
            username: r.2,
            model_name: r.3,
            tokens: r.4,
            total_cost_cents: r.5,
            status: r.6,
            created_at: r.7,
        })
        .collect())
}
