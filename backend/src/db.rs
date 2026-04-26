use sqlx::PgPool;
use sqlx::postgres::PgPoolOptions;
use std::time::Duration;

pub async fn init_pool(database_url: &str) -> PgPool {
    PgPoolOptions::new()
        .max_connections(env_u32("DB_MAX_CONNECTIONS", 20))
        .min_connections(env_u32("DB_MIN_CONNECTIONS", 1))
        .acquire_timeout(Duration::from_secs(env_u64("DB_ACQUIRE_TIMEOUT_SECS", 10)))
        .idle_timeout(Duration::from_secs(env_u64("DB_IDLE_TIMEOUT_SECS", 600)))
        .max_lifetime(Duration::from_secs(env_u64("DB_MAX_LIFETIME_SECS", 1800)))
        .connect(database_url)
        .await
        .expect("Failed to connect to database")
}

fn env_u32(name: &str, default: u32) -> u32 {
    std::env::var(name)
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(default)
}

fn env_u64(name: &str, default: u64) -> u64 {
    std::env::var(name)
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(default)
}
