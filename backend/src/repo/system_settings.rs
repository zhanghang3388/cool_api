//! KV-style singleton settings stored in `system_settings`.

use serde::{Deserialize, Serialize};
use sqlx::PgPool;

use crate::error::AppResult;

pub const CACHE_KEY: &str = "cache";
pub const SITE_KEY: &str = "site";
pub const PAYMENT_KEY: &str = "payment";
pub const EMAIL_KEY: &str = "email";
pub const LANDING_PRICING_GROUP_KEY: &str = "landing_pricing_group_id";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheConfig {
    pub enabled: bool,
    pub ttl_seconds: i64,
    pub recent_keys_limit: i64,
}

impl Default for CacheConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            ttl_seconds: 3600,
            recent_keys_limit: 200,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SiteConfig {
    pub site_name: String,
    pub announcement: String,
    #[serde(default)]
    pub logo_url: String,
}

impl Default for SiteConfig {
    fn default() -> Self {
        Self {
            site_name: "AetherGate".into(),
            announcement: String::new(),
            logo_url: String::new(),
        }
    }
}

/// Payment provider config. Merchant key is stored encrypted at rest using the
/// shared AES cipher; plaintext never crosses the DB boundary.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaymentConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_provider")]
    pub provider: String,
    #[serde(default)]
    pub pid: String,
    /// ciphertext from `crypto::Cipher::encrypt`. Empty means "unset".
    #[serde(default)]
    pub key_encrypted: String,
    #[serde(default)]
    pub api_url: String,
    #[serde(default = "default_payment_name")]
    pub name: String,
}

fn default_provider() -> String {
    "epay".into()
}
fn default_payment_name() -> String {
    "易支付".into()
}

impl Default for PaymentConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            provider: default_provider(),
            pid: String::new(),
            key_encrypted: String::new(),
            api_url: String::new(),
            name: default_payment_name(),
        }
    }
}

async fn get_typed<T: Default + for<'de> Deserialize<'de>>(
    pool: &PgPool,
    key: &str,
) -> AppResult<T> {
    let row: Option<(serde_json::Value,)> = sqlx::query_as(
        "SELECT value FROM system_settings WHERE key = $1",
    )
    .bind(key)
    .fetch_optional(pool)
    .await?;
    Ok(row
        .and_then(|(v,)| serde_json::from_value(v).ok())
        .unwrap_or_default())
}

async fn put_typed<T: Serialize>(pool: &PgPool, key: &str, value: &T) -> AppResult<()> {
    let v = serde_json::to_value(value).expect("serialize settings");
    sqlx::query(
        "INSERT INTO system_settings (key, value) VALUES ($1, $2) \
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()",
    )
    .bind(key)
    .bind(v)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_cache_config(pool: &PgPool) -> AppResult<CacheConfig> {
    get_typed(pool, CACHE_KEY).await
}

pub async fn update_cache_config(pool: &PgPool, cfg: &CacheConfig) -> AppResult<()> {
    put_typed(pool, CACHE_KEY, cfg).await
}

pub async fn get_site_config(pool: &PgPool) -> AppResult<SiteConfig> {
    get_typed(pool, SITE_KEY).await
}

pub async fn update_site_config(pool: &PgPool, cfg: &SiteConfig) -> AppResult<()> {
    put_typed(pool, SITE_KEY, cfg).await
}

pub async fn get_payment_config(pool: &PgPool) -> AppResult<PaymentConfig> {
    get_typed(pool, PAYMENT_KEY).await
}

pub async fn update_payment_config(pool: &PgPool, cfg: &PaymentConfig) -> AppResult<()> {
    put_typed(pool, PAYMENT_KEY, cfg).await
}

/// Resend (https://resend.com/) provider config. The API key is stored
/// encrypted at rest using the shared AES cipher, mirroring `PaymentConfig`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmailConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_email_provider")]
    pub provider: String,
    /// ciphertext from `crypto::Cipher::encrypt`. Empty means "unset".
    #[serde(default)]
    pub api_key_encrypted: String,
    /// Sender address shown to recipients. Must be from a Resend-verified
    /// domain or `onboarding@resend.dev` for testing.
    #[serde(default)]
    pub from_email: String,
    #[serde(default = "default_from_name")]
    pub from_name: String,
}

fn default_email_provider() -> String {
    "resend".into()
}
fn default_from_name() -> String {
    "AetherGate".into()
}

impl Default for EmailConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            provider: default_email_provider(),
            api_key_encrypted: String::new(),
            from_email: String::new(),
            from_name: default_from_name(),
        }
    }
}

pub async fn get_email_config(pool: &PgPool) -> AppResult<EmailConfig> {
    get_typed(pool, EMAIL_KEY).await
}

pub async fn update_email_config(pool: &PgPool, cfg: &EmailConfig) -> AppResult<()> {
    put_typed(pool, EMAIL_KEY, cfg).await
}

/// Group ID whose pricing is showcased on the public landing page. `None`
/// hides the showcase section.
pub async fn get_landing_pricing_group_id(pool: &PgPool) -> AppResult<Option<i64>> {
    let row: Option<(serde_json::Value,)> =
        sqlx::query_as("SELECT value FROM system_settings WHERE key = $1")
            .bind(LANDING_PRICING_GROUP_KEY)
            .fetch_optional(pool)
            .await?;
    Ok(row.and_then(|(v,)| v.as_i64()))
}

pub async fn set_landing_pricing_group_id(pool: &PgPool, id: Option<i64>) -> AppResult<()> {
    let value = match id {
        Some(n) => serde_json::Value::from(n),
        None => serde_json::Value::Null,
    };
    sqlx::query(
        "INSERT INTO system_settings (key, value) VALUES ($1, $2) \
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()",
    )
    .bind(LANDING_PRICING_GROUP_KEY)
    .bind(value)
    .execute(pool)
    .await?;
    Ok(())
}
