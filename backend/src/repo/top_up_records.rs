use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::{PgPool, Postgres, Transaction};

use crate::error::{AppError, AppResult};
use crate::models::{TopUpRecord, TopUpStatus};

const COLUMNS: &str = "id, user_id, amount_cents, bonus_cents, method, status, \
    external_txn_id, out_trade_no, note, created_at, updated_at";

pub struct NewPending<'a> {
    pub user_id: i64,
    pub amount_cents: i64,
    pub method: &'a str,
    pub out_trade_no: &'a str,
}

pub async fn create_pending(pool: &PgPool, new: NewPending<'_>) -> AppResult<TopUpRecord> {
    let row = sqlx::query_as::<_, TopUpRecord>(&format!(
        "INSERT INTO top_up_records (user_id, amount_cents, bonus_cents, method, status, out_trade_no, note) \
         VALUES ($1, $2, 0, $3, 'pending', $4, '') \
         RETURNING {COLUMNS}"
    ))
    .bind(new.user_id)
    .bind(new.amount_cents)
    .bind(new.method)
    .bind(new.out_trade_no)
    .fetch_one(pool)
    .await?;
    Ok(row)
}

pub async fn get_by_out_trade_no(pool: &PgPool, out_trade_no: &str) -> AppResult<TopUpRecord> {
    sqlx::query_as::<_, TopUpRecord>(&format!(
        "SELECT {COLUMNS} FROM top_up_records WHERE out_trade_no = $1"
    ))
    .bind(out_trade_no)
    .fetch_optional(pool)
    .await?
    .ok_or(AppError::NotFound)
}

pub async fn list_by_user(
    pool: &PgPool,
    user_id: i64,
    limit: i64,
) -> AppResult<Vec<TopUpRecord>> {
    let rows = sqlx::query_as::<_, TopUpRecord>(&format!(
        "SELECT {COLUMNS} FROM top_up_records \
         WHERE user_id = $1 \
         ORDER BY created_at DESC, id DESC \
         LIMIT $2"
    ))
    .bind(user_id)
    .bind(limit)
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

/// Most recent successful top-ups across all users, for the admin dashboard
/// "recent top-ups" panel. Only `success` records are returned — pending/failed
/// orders never moved real money. Joins `users` for the display name.
#[derive(Debug, Serialize)]
pub struct RecentTopUp {
    pub id: i64,
    pub user_id: i64,
    pub username: String,
    pub amount_cents: i64,
    pub bonus_cents: i64,
    pub method: String,
    pub created_at: DateTime<Utc>,
}

pub async fn recent_success(pool: &PgPool, limit: i64) -> AppResult<Vec<RecentTopUp>> {
    let rows: Vec<(i64, i64, String, i64, i64, String, DateTime<Utc>)> = sqlx::query_as(
        "SELECT t.id, t.user_id, u.username, t.amount_cents, t.bonus_cents, \
                t.method, t.created_at \
         FROM top_up_records t \
         JOIN users u ON u.id = t.user_id \
         WHERE t.status = 'success' \
         ORDER BY t.created_at DESC, t.id DESC \
         LIMIT $1",
    )
    .bind(limit)
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(
            |(id, user_id, username, amount_cents, bonus_cents, method, created_at)| RecentTopUp {
                id,
                user_id,
                username,
                amount_cents,
                bonus_cents,
                method,
                created_at,
            },
        )
        .collect())
}

/// Idempotently mark a pending record as success, credit the user's balance
/// and stamp the external transaction id. If the record is already `success`,
/// this is a no-op (returns `Ok(false)`). Returns `Ok(true)` when it actually
/// flipped the state.
pub async fn mark_success_idempotent(
    pool: &PgPool,
    out_trade_no: &str,
    external_txn_id: &str,
) -> AppResult<bool> {
    let mut tx: Transaction<'_, Postgres> = pool.begin().await?;

    // Lock the row so two concurrent callbacks don't both credit the user.
    let row: Option<(i64, i64, TopUpStatus)> = sqlx::query_as(
        "SELECT id, amount_cents, status FROM top_up_records \
         WHERE out_trade_no = $1 FOR UPDATE",
    )
    .bind(out_trade_no)
    .fetch_optional(&mut *tx)
    .await?;
    let Some((id, amount_cents, status)) = row else {
        tx.rollback().await.ok();
        return Err(AppError::NotFound);
    };

    if matches!(status, TopUpStatus::Success) {
        tx.commit().await?;
        return Ok(false);
    }
    if !matches!(status, TopUpStatus::Pending) {
        tx.rollback().await.ok();
        return Err(AppError::Conflict(format!(
            "top_up_record in terminal state '{}'; cannot mark success",
            status_label(status)
        )));
    }

    sqlx::query(
        "UPDATE top_up_records \
         SET status = 'success', external_txn_id = $2, updated_at = NOW() \
         WHERE id = $1",
    )
    .bind(id)
    .bind(external_txn_id)
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        "UPDATE users SET balance_cents = balance_cents + $2 WHERE id = \
         (SELECT user_id FROM top_up_records WHERE id = $1)",
    )
    .bind(id)
    .bind(amount_cents)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(true)
}

fn status_label(s: TopUpStatus) -> &'static str {
    match s {
        TopUpStatus::Pending => "pending",
        TopUpStatus::Success => "success",
        TopUpStatus::Failed => "failed",
        TopUpStatus::Refunded => "refunded",
    }
}
