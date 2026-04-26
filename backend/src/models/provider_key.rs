use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ProviderKey {
    pub id: Uuid,
    pub provider: String,
    pub name: String,
    pub api_key: String,
    pub base_url: Option<String>,
    pub is_active: bool,
    pub weight: i32,
    pub priority: i32,
    pub rpm_limit: Option<i32>,
    pub tpm_limit: Option<i32>,
    pub models: Option<serde_json::Value>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateProviderKey {
    pub provider: String,
    pub name: String,
    pub api_key: String,
    pub base_url: Option<String>,
    pub weight: Option<i32>,
    pub priority: Option<i32>,
    pub rpm_limit: Option<i32>,
    pub tpm_limit: Option<i32>,
    pub models: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateProviderKey {
    pub name: Option<String>,
    pub api_key: Option<String>,
    pub base_url: Option<Option<String>>,
    pub is_active: Option<bool>,
    pub weight: Option<i32>,
    pub priority: Option<i32>,
    pub rpm_limit: Option<Option<i32>>,
    pub tpm_limit: Option<Option<i32>>,
    pub models: Option<Option<serde_json::Value>>,
}

impl ProviderKey {
    pub async fn create(pool: &PgPool, input: &CreateProviderKey) -> Result<Self, sqlx::Error> {
        sqlx::query_as(
            "INSERT INTO provider_keys (provider, name, api_key, base_url, weight, priority, rpm_limit, tpm_limit, models)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *"
        )
        .bind(&input.provider)
        .bind(&input.name)
        .bind(&input.api_key)
        .bind(&input.base_url)
        .bind(input.weight.unwrap_or(1))
        .bind(input.priority.unwrap_or(0))
        .bind(input.rpm_limit)
        .bind(input.tpm_limit)
        .bind(&input.models)
        .fetch_one(pool)
        .await
    }

    pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as("SELECT * FROM provider_keys WHERE id = $1")
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    pub async fn list(pool: &PgPool) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as("SELECT * FROM provider_keys ORDER BY provider, priority, created_at")
            .fetch_all(pool)
            .await
    }

    pub async fn update(
        pool: &PgPool,
        id: Uuid,
        input: &UpdateProviderKey,
    ) -> Result<Self, sqlx::Error> {
        let current = sqlx::query_as::<_, Self>("SELECT * FROM provider_keys WHERE id = $1")
            .bind(id)
            .fetch_one(pool)
            .await?;

        sqlx::query_as(
            "UPDATE provider_keys SET
                name = $1, api_key = $2, base_url = $3, is_active = $4,
                weight = $5, priority = $6, rpm_limit = $7, tpm_limit = $8,
                models = $9, updated_at = now()
             WHERE id = $10 RETURNING *",
        )
        .bind(input.name.as_deref().unwrap_or(&current.name))
        .bind(input.api_key.as_deref().unwrap_or(&current.api_key))
        .bind(
            input
                .base_url
                .as_ref()
                .map(|v| v.as_deref())
                .unwrap_or(current.base_url.as_deref()),
        )
        .bind(input.is_active.unwrap_or(current.is_active))
        .bind(input.weight.unwrap_or(current.weight))
        .bind(input.priority.unwrap_or(current.priority))
        .bind(input.rpm_limit.unwrap_or(current.rpm_limit))
        .bind(input.tpm_limit.unwrap_or(current.tpm_limit))
        .bind(
            input
                .models
                .as_ref()
                .map(|v| v.as_ref())
                .unwrap_or(current.models.as_ref()),
        )
        .bind(id)
        .fetch_one(pool)
        .await
    }

    pub async fn delete(pool: &PgPool, id: Uuid) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM provider_keys WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }
}
