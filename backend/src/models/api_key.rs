use chrono::{DateTime, Utc};
use sqlx::FromRow;

#[derive(Debug, Clone, FromRow)]
pub struct ApiKey {
    pub id: i64,
    pub user_id: i64,
    pub name: String,
    pub key_prefix: String,
    pub key_hash: String,
    /// Full plaintext token. Stored so the user can re-copy it from the
    /// list later — opt-in trade-off, see migration 0011.
    pub key_plaintext: Option<String>,
    pub enabled: bool,
    pub last_used_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}
