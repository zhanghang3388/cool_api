use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct User {
    pub id: Uuid,
    pub username: String,
    pub email: String,
    pub display_name: Option<String>,
    #[serde(skip_serializing)]
    pub password_hash: String,
    pub role: String,
    pub is_active: bool,
    pub balance: i64,
    pub quota_limit: Option<i64>,
    pub rpm_limit: Option<i32>,
    pub referred_by: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateUser {
    pub username: String,
    pub email: String,
    pub password_hash: String,
    pub role: Option<String>,
    pub referred_by: Option<Uuid>,
}

impl User {
    pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as("SELECT * FROM users WHERE id = $1")
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    pub async fn find_by_username(
        pool: &PgPool,
        username: &str,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as("SELECT * FROM users WHERE username = $1")
            .bind(username)
            .fetch_optional(pool)
            .await
    }

    pub async fn find_by_email(pool: &PgPool, email: &str) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as("SELECT * FROM users WHERE email = $1")
            .bind(email)
            .fetch_optional(pool)
            .await
    }

    pub async fn create(pool: &PgPool, input: &CreateUser) -> Result<Self, sqlx::Error> {
        let role = input.role.as_deref().unwrap_or("client");
        sqlx::query_as(
            "INSERT INTO users (username, email, password_hash, role, referred_by) VALUES ($1, $2, $3, $4, $5) RETURNING *"
        )
        .bind(&input.username)
        .bind(&input.email)
        .bind(&input.password_hash)
        .bind(role)
        .bind(input.referred_by)
        .fetch_one(pool)
        .await
    }

    pub async fn list(pool: &PgPool, offset: i64, limit: i64) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as("SELECT * FROM users ORDER BY created_at DESC OFFSET $1 LIMIT $2")
            .bind(offset)
            .bind(limit)
            .fetch_all(pool)
            .await
    }

    pub async fn count(pool: &PgPool) -> Result<i64, sqlx::Error> {
        let (count,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM users")
            .fetch_one(pool)
            .await?;
        Ok(count)
    }

    pub async fn count_referrals(pool: &PgPool, id: Uuid) -> Result<i64, sqlx::Error> {
        let (count,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM users WHERE referred_by = $1")
            .bind(id)
            .fetch_one(pool)
            .await?;
        Ok(count)
    }

    pub async fn update_active(
        pool: &PgPool,
        id: Uuid,
        is_active: bool,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query_as(
            "UPDATE users SET is_active = $1, updated_at = now() WHERE id = $2 RETURNING *",
        )
        .bind(is_active)
        .bind(id)
        .fetch_one(pool)
        .await
    }

    pub async fn update_balance(pool: &PgPool, id: Uuid, delta: i64) -> Result<Self, sqlx::Error> {
        sqlx::query_as(
            "UPDATE users
             SET balance = balance + $1, updated_at = now()
             WHERE id = $2 AND ($1 >= 0 OR balance + $1 >= 0)
             RETURNING *",
        )
        .bind(delta)
        .bind(id)
        .fetch_one(pool)
        .await
    }

    pub async fn update_rpm_limit(
        pool: &PgPool,
        id: Uuid,
        rpm_limit: Option<i32>,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query_as(
            "UPDATE users SET rpm_limit = $1, updated_at = now() WHERE id = $2 RETURNING *",
        )
        .bind(rpm_limit)
        .bind(id)
        .fetch_one(pool)
        .await
    }

    pub async fn update_profile(
        pool: &PgPool,
        id: Uuid,
        display_name: Option<&str>,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query_as(
            "UPDATE users SET display_name = $1, updated_at = now() WHERE id = $2 RETURNING *",
        )
        .bind(display_name)
        .bind(id)
        .fetch_one(pool)
        .await
    }

    pub async fn update_password_hash(
        pool: &PgPool,
        id: Uuid,
        password_hash: &str,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query_as(
            "UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2 RETURNING *",
        )
        .bind(password_hash)
        .bind(id)
        .fetch_one(pool)
        .await
    }
}
