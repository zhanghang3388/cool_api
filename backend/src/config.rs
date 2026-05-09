use figment::providers::{Env, Format, Toml};
use figment::Figment;
use serde::Deserialize;

#[derive(Debug, Deserialize, Clone)]
pub struct AppConfig {
    #[serde(default = "default_bind")]
    pub bind: String,

    pub database_url: String,
    pub redis_url: String,

    pub jwt_secret: String,

    /// 32-byte key (base64-encoded) used to encrypt channel api keys at rest
    pub encryption_key: String,

    #[serde(default = "default_token_ttl_hours")]
    pub jwt_ttl_hours: i64,
}

fn default_bind() -> String {
    "0.0.0.0:3000".to_string()
}

fn default_token_ttl_hours() -> i64 {
    24
}

impl AppConfig {
    pub fn load() -> anyhow::Result<Self> {
        let cfg: AppConfig = Figment::new()
            .merge(Toml::file("config.toml").nested())
            .merge(Env::raw())
            .extract()?;
        Ok(cfg)
    }
}
