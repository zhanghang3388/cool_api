use redis::aio::ConnectionManager;

/// Try to connect to Redis. Returns `Ok(None)` if the connection fails —
/// callers treat this as "Redis unavailable" rather than a hard startup error.
/// Phases that require Redis (caching, rate-limiting) will re-check at call time.
pub async fn init(redis_url: &str) -> anyhow::Result<Option<ConnectionManager>> {
    match redis::Client::open(redis_url) {
        Ok(client) => match ConnectionManager::new(client).await {
            Ok(manager) => Ok(Some(manager)),
            Err(e) => {
                tracing::warn!(error = %e, "redis unavailable, continuing without cache/rate-limit");
                Ok(None)
            }
        },
        Err(e) => {
            tracing::warn!(error = %e, "invalid REDIS_URL, continuing without cache/rate-limit");
            Ok(None)
        }
    }
}
