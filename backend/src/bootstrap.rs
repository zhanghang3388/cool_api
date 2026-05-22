//! First-run bootstrap: ensures a default admin user exists.
//!
//! Reads `ADMIN_INITIAL_USERNAME` / `ADMIN_INITIAL_PASSWORD` from env.
//! Defaults to `admin` / `admin123` (a warning is logged so operators replace it).

use std::env;

use crate::auth::password;
use crate::models::UserRole;

const DEFAULT_USERNAME: &str = "admin";
const DEFAULT_PASSWORD: &str = "admin123";

pub async fn ensure_admin_user(pool: &sqlx::PgPool) -> anyhow::Result<()> {
    let admin_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users WHERE role = 'admin'")
        .fetch_one(pool)
        .await?;

    if admin_count > 0 {
        tracing::debug!("admin user already exists, skipping bootstrap");
        return Ok(());
    }

    let username = env::var("ADMIN_INITIAL_USERNAME").unwrap_or_else(|_| DEFAULT_USERNAME.into());
    let password_plain =
        env::var("ADMIN_INITIAL_PASSWORD").unwrap_or_else(|_| DEFAULT_PASSWORD.into());

    if password_plain == DEFAULT_PASSWORD {
        tracing::warn!(
            "seeding admin user with DEFAULT password '{DEFAULT_PASSWORD}'. Change it on first login."
        );
    }

    let hash = password::hash_password(&password_plain)
        .map_err(|e| anyhow::anyhow!("hash admin password: {e}"))?;

    sqlx::query(
        r#"
        INSERT INTO users (username, password_hash, role, status, balance_cents)
        VALUES ($1, $2, $3, 'active', 0)
        "#,
    )
    .bind(&username)
    .bind(&hash)
    .bind(UserRole::Admin)
    .execute(pool)
    .await?;

    tracing::info!(username = %username, "bootstrapped admin user");
    Ok(())
}
