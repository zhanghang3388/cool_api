use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Channel {
    pub id: Uuid,
    pub name: String,
    pub model_pattern: String,
    pub strategy: String,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateChannel {
    pub name: String,
    pub model_pattern: String,
    pub strategy: Option<String>,
    pub key_ids: Vec<Uuid>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateChannel {
    pub name: Option<String>,
    pub model_pattern: Option<String>,
    pub strategy: Option<String>,
    pub is_active: Option<bool>,
    pub key_ids: Option<Vec<Uuid>>,
}

impl Channel {
    pub async fn create(pool: &PgPool, input: &CreateChannel) -> Result<Self, sqlx::Error> {
        let strategy = input.strategy.as_deref().unwrap_or("round_robin");
        let channel: Self = sqlx::query_as(
            "INSERT INTO channels (name, model_pattern, strategy) VALUES ($1, $2, $3) RETURNING *"
        )
        .bind(&input.name)
        .bind(&input.model_pattern)
        .bind(strategy)
        .fetch_one(pool)
        .await?;

        for key_id in &input.key_ids {
            sqlx::query("INSERT INTO channel_keys (channel_id, key_id) VALUES ($1, $2)")
                .bind(channel.id)
                .bind(key_id)
                .execute(pool)
                .await?;
        }

        Ok(channel)
    }

    pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as("SELECT * FROM channels WHERE id = $1")
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    pub async fn list(pool: &PgPool) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as("SELECT * FROM channels ORDER BY created_at")
            .fetch_all(pool)
            .await
    }

    pub async fn update(pool: &PgPool, id: Uuid, input: &UpdateChannel) -> Result<Self, sqlx::Error> {
        let current = sqlx::query_as::<_, Self>("SELECT * FROM channels WHERE id = $1")
            .bind(id)
            .fetch_one(pool)
            .await?;

        let channel: Self = sqlx::query_as(
            "UPDATE channels SET name = $1, model_pattern = $2, strategy = $3, is_active = $4 WHERE id = $5 RETURNING *"
        )
        .bind(input.name.as_deref().unwrap_or(&current.name))
        .bind(input.model_pattern.as_deref().unwrap_or(&current.model_pattern))
        .bind(input.strategy.as_deref().unwrap_or(&current.strategy))
        .bind(input.is_active.unwrap_or(current.is_active))
        .bind(id)
        .fetch_one(pool)
        .await?;

        if let Some(key_ids) = &input.key_ids {
            sqlx::query("DELETE FROM channel_keys WHERE channel_id = $1")
                .bind(id)
                .execute(pool)
                .await?;
            for key_id in key_ids {
                sqlx::query("INSERT INTO channel_keys (channel_id, key_id) VALUES ($1, $2)")
                    .bind(id)
                    .bind(key_id)
                    .execute(pool)
                    .await?;
            }
        }

        Ok(channel)
    }

    pub async fn delete(pool: &PgPool, id: Uuid) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM channels WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }

    pub async fn get_key_ids(pool: &PgPool, channel_id: Uuid) -> Result<Vec<Uuid>, sqlx::Error> {
        let rows: Vec<(Uuid,)> = sqlx::query_as("SELECT key_id FROM channel_keys WHERE channel_id = $1")
            .bind(channel_id)
            .fetch_all(pool)
            .await?;
        Ok(rows.into_iter().map(|(id,)| id).collect())
    }
}
