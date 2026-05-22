use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::{PgPool, Postgres, Transaction};

use crate::error::{AppError, AppResult};
use crate::models::{User, UserRole, UserStatus};

pub const COLUMNS: &str = "id, username, email, password_hash, role, status, \
    balance_cents, total_used_cents, created_at, last_login_at";

#[derive(Default)]
pub struct UserFilter<'a> {
    pub search: Option<&'a str>,
    pub status: Option<UserStatus>,
}

pub struct Page<T> {
    pub items: Vec<T>,
    pub total: i64,
}

/// Lightweight row shape for the admin user list. Effective groups are
/// computed by `repo::user_groups::effective_group_ids` per row at the
/// route layer, not joined here.
#[derive(Debug, Serialize)]
pub struct AdminUserRow {
    pub id: i64,
    pub username: String,
    pub email: Option<String>,
    pub role: UserRole,
    pub status: UserStatus,
    pub balance_cents: i64,
    pub total_used_cents: i64,
    pub created_at: DateTime<Utc>,
    pub last_login_at: Option<DateTime<Utc>>,
}

pub async fn list(
    pool: &PgPool,
    filter: UserFilter<'_>,
    limit: i64,
    offset: i64,
) -> AppResult<Page<AdminUserRow>> {
    let mut clauses: Vec<String> = Vec::new();
    let mut idx = 1;
    let search_pat = filter
        .search
        .map(|s| format!("%{}%", s.trim().to_lowercase()));
    if search_pat.is_some() {
        clauses.push(format!(
            "(LOWER(u.username) LIKE ${idx} OR LOWER(COALESCE(u.email, '')) LIKE ${idx})"
        ));
        idx += 1;
    }
    if filter.status.is_some() {
        clauses.push(format!("u.status = ${idx}"));
        idx += 1;
    }
    let where_sql = if clauses.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", clauses.join(" AND "))
    };

    let list_sql = format!(
        "SELECT u.id, u.username, u.email, u.role, u.status, \
                u.balance_cents, u.total_used_cents, \
                u.created_at, u.last_login_at \
         FROM users u \
         {where_sql} \
         ORDER BY u.id DESC LIMIT ${limit_idx} OFFSET ${offset_idx}",
        limit_idx = idx,
        offset_idx = idx + 1,
    );
    let count_sql = format!("SELECT COUNT(*) FROM users u {where_sql}");

    type Row = (
        i64,
        String,
        Option<String>,
        UserRole,
        UserStatus,
        i64,
        i64,
        DateTime<Utc>,
        Option<DateTime<Utc>>,
    );

    let mut list_q = sqlx::query_as::<_, Row>(&list_sql);
    let mut count_q = sqlx::query_scalar::<_, i64>(&count_sql);
    if let Some(ref v) = search_pat {
        list_q = list_q.bind(v);
        count_q = count_q.bind(v);
    }
    if let Some(v) = filter.status {
        list_q = list_q.bind(v);
        count_q = count_q.bind(v);
    }
    list_q = list_q.bind(limit).bind(offset);

    let rows = list_q.fetch_all(pool).await?;
    let total = count_q.fetch_one(pool).await?;

    let items = rows
        .into_iter()
        .map(|r| AdminUserRow {
            id: r.0,
            username: r.1,
            email: r.2,
            role: r.3,
            status: r.4,
            balance_cents: r.5,
            total_used_cents: r.6,
            created_at: r.7,
            last_login_at: r.8,
        })
        .collect();
    Ok(Page { items, total })
}

pub async fn get(pool: &PgPool, id: i64) -> AppResult<User> {
    sqlx::query_as::<_, User>(&format!(
        "SELECT {COLUMNS} FROM users WHERE id = $1"
    ))
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or(AppError::NotFound)
}

#[derive(Default)]
pub struct UpdateUser {
    pub status: Option<UserStatus>,
}

pub async fn update(pool: &PgPool, id: i64, patch: UpdateUser) -> AppResult<User> {
    sqlx::query_as::<_, User>(&format!(
        "UPDATE users SET \
            status = COALESCE($2, status) \
         WHERE id = $1 \
         RETURNING {COLUMNS}"
    ))
    .bind(id)
    .bind(patch.status)
    .fetch_optional(pool)
    .await?
    .ok_or(AppError::NotFound)
}

/// Credit `amount_cents + bonus_cents` to the user and insert a topup record.
/// Returns the updated user row.
pub async fn topup(
    pool: &PgPool,
    user_id: i64,
    amount_cents: i64,
    bonus_cents: i64,
    note: &str,
) -> AppResult<User> {
    if amount_cents <= 0 {
        return Err(AppError::BadRequest("amount must be > 0".into()));
    }
    if bonus_cents < 0 {
        return Err(AppError::BadRequest("bonus must be >= 0".into()));
    }
    // Sanity cap to keep a bad admin click from creating a balance that
    // overflows `bigint` or wedges the audit story. 1 billion cents = ¥10M
    // per single topup is far above any legitimate manual credit.
    const MAX_PER_TOPUP_CENTS: i64 = 100_000_000_000;
    if amount_cents > MAX_PER_TOPUP_CENTS || bonus_cents > MAX_PER_TOPUP_CENTS {
        return Err(AppError::BadRequest(format!(
            "amount and bonus must each be <= {MAX_PER_TOPUP_CENTS} cents"
        )));
    }
    // Defense-in-depth against the addition itself overflowing i64 if the
    // caps above ever change.
    let credit = amount_cents
        .checked_add(bonus_cents)
        .ok_or_else(|| AppError::BadRequest("amount + bonus overflows".into()))?;

    let mut tx: Transaction<'_, Postgres> = pool.begin().await?;

    let user: Option<User> = sqlx::query_as::<_, User>(&format!(
        "UPDATE users SET balance_cents = balance_cents + $2 \
         WHERE id = $1 RETURNING {COLUMNS}"
    ))
    .bind(user_id)
    .bind(credit)
    .fetch_optional(&mut *tx)
    .await?;
    let user = user.ok_or(AppError::NotFound)?;

    sqlx::query(
        "INSERT INTO top_up_records (user_id, amount_cents, bonus_cents, method, status, note) \
         VALUES ($1, $2, $3, 'manual', 'success', $4)",
    )
    .bind(user_id)
    .bind(amount_cents)
    .bind(bonus_cents)
    .bind(note)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(user)
}
