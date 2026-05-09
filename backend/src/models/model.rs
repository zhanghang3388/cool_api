use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct Model {
    pub id: i64,
    pub name: String,
    pub provider: String,
    pub input_price_cents: i64,
    pub output_price_cents: i64,
    pub cache_read_price_cents: Option<i64>,
    /// Surcharge for writing a prompt-cache entry. Anthropic charges ~1.25×
    /// input; OpenAI currently doesn't bill creation separately (NULL). When
    /// NULL we fall back to `input_price_cents` so writes stay billable but
    /// at the base rate.
    pub cache_write_price_cents: Option<i64>,
    pub enabled: bool,
    pub description: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
