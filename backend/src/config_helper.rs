use sqlx::PgPool;

/// Get rate limit configuration from database with fallback to config defaults
pub async fn get_rate_limit_config(pool: &PgPool, default_user_rpm: u32, default_global_rpm: Option<u32>) -> (u32, Option<u32>) {
    // Try to get from database
    let default_user_limit = get_setting_u32(pool, "default_user_rpm_limit").await
        .unwrap_or(default_user_rpm);

    let global_limit = get_setting_u32(pool, "global_rpm_limit").await
        .or(default_global_rpm);

    (default_user_limit, global_limit)
}

async fn get_setting_u32(pool: &PgPool, key: &str) -> Option<u32> {
    let row: Option<(serde_json::Value,)> = sqlx::query_as(
        "SELECT value FROM system_settings WHERE key = $1"
    )
    .bind(key)
    .fetch_optional(pool)
    .await
    .ok()?;

    row.and_then(|(v,)| v.as_u64().map(|n| n as u32))
}
