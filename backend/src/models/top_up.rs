use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Clone, Copy, PartialEq, Eq, sqlx::Type, Serialize, Deserialize)]
#[sqlx(type_name = "topup_status", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum TopUpStatus {
    Pending,
    Success,
    Failed,
    Refunded,
}

#[derive(Debug, Clone, FromRow)]
pub struct TopUpRecord {
    pub id: i64,
    pub user_id: i64,
    pub amount_cents: i64,
    pub bonus_cents: i64,
    pub method: String,
    pub status: TopUpStatus,
    pub external_txn_id: Option<String>,
    pub out_trade_no: Option<String>,
    pub note: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
