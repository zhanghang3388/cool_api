use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct PricingGroup {
    pub id: Uuid,
    pub name: String,
    pub multiplier: f64,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreatePricingGroup {
    pub name: String,
    pub multiplier: Option<f64>,
    pub channel_ids: Vec<Uuid>,
}

#[derive(Debug, Deserialize)]
pub struct UpdatePricingGroup {
    pub name: Option<String>,
    pub multiplier: Option<f64>,
    pub is_active: Option<bool>,
    pub channel_ids: Option<Vec<Uuid>>,
}

impl PricingGroup {
    pub async fn list(pool: &PgPool) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as("SELECT * FROM pricing_groups ORDER BY created_at")
            .fetch_all(pool)
            .await
    }

    pub async fn list_active(pool: &PgPool) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as("SELECT * FROM pricing_groups WHERE is_active = true ORDER BY name")
            .fetch_all(pool)
            .await
    }

    pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as("SELECT * FROM pricing_groups WHERE id = $1")
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    pub async fn create(pool: &PgPool, input: &CreatePricingGroup) -> Result<Self, sqlx::Error> {
        let multiplier = input.multiplier.unwrap_or(1.0);
        let group: Self = sqlx::query_as(
            "INSERT INTO pricing_groups (name, multiplier) VALUES ($1, $2) RETURNING *"
        )
        .bind(&input.name)
        .bind(multiplier)
        .fetch_one(pool)
        .await?;

        for channel_id in &input.channel_ids {
            sqlx::query("INSERT INTO pricing_group_channels (group_id, channel_id) VALUES ($1, $2)")
                .bind(group.id)
                .bind(channel_id)
                .execute(pool)
                .await?;
        }

        Ok(group)
    }

    pub async fn update(pool: &PgPool, id: Uuid, input: &UpdatePricingGroup) -> Result<Self, sqlx::Error> {
        let current = sqlx::query_as::<_, Self>("SELECT * FROM pricing_groups WHERE id = $1")
            .bind(id)
            .fetch_one(pool)
            .await?;

        let group: Self = sqlx::query_as(
            "UPDATE pricing_groups SET name = $1, multiplier = $2, is_active = $3, updated_at = now() WHERE id = $4 RETURNING *"
        )
        .bind(input.name.as_deref().unwrap_or(&current.name))
        .bind(input.multiplier.unwrap_or(current.multiplier))
        .bind(input.is_active.unwrap_or(current.is_active))
        .bind(id)
        .fetch_one(pool)
        .await?;

        if let Some(channel_ids) = &input.channel_ids {
            sqlx::query("DELETE FROM pricing_group_channels WHERE group_id = $1")
                .bind(id)
                .execute(pool)
                .await?;
            for channel_id in channel_ids {
                sqlx::query("INSERT INTO pricing_group_channels (group_id, channel_id) VALUES ($1, $2)")
                    .bind(id)
                    .bind(channel_id)
                    .execute(pool)
                    .await?;
            }
        }

        Ok(group)
    }

    pub async fn delete(pool: &PgPool, id: Uuid) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM pricing_groups WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }

    pub async fn get_channel_ids(pool: &PgPool, group_id: Uuid) -> Result<Vec<Uuid>, sqlx::Error> {
        let rows: Vec<(Uuid,)> = sqlx::query_as("SELECT channel_id FROM pricing_group_channels WHERE group_id = $1")
            .bind(group_id)
            .fetch_all(pool)
            .await?;
        Ok(rows.into_iter().map(|(id,)| id).collect())
    }
}
