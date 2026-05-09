use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Clone, Copy, PartialEq, Eq, sqlx::Type, Serialize, Deserialize)]
#[sqlx(type_name = "channel_provider", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum ChannelProvider {
    Openai,
    Anthropic,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, sqlx::Type, Serialize, Deserialize)]
#[sqlx(type_name = "channel_status", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum ChannelStatus {
    Active,
    Warning,
    Error,
    Disabled,
}

#[derive(Debug, Clone, FromRow)]
pub struct Channel {
    pub id: i64,
    pub name: String,
    pub provider: ChannelProvider,
    pub base_url: String,
    pub api_key_encrypted: String,
    pub priority: i32,
    pub weight: i32,
    pub enabled: bool,
    pub status: ChannelStatus,
    pub allowed_models: Vec<String>,
    pub allowed_group_ids: Vec<i64>,
    pub balance_cents: Option<i64>,
    pub last_test_at: Option<DateTime<Utc>>,
    pub last_error: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
