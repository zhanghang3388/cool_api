use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct RelayKey {
    pub id: Uuid,
    pub user_id: Uuid,
    pub name: String,
    #[serde(skip_serializing)]
    pub key_hash: String,
    pub key_prefix: String,
    pub is_active: bool,
    pub rpm_limit: Option<i32>,
    pub allowed_models: Option<serde_json::Value>,
    pub expires_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub group_id: Option<Uuid>,
    pub remark: Option<String>,
}

impl RelayKey {
    pub fn hash_key(key: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(key.as_bytes());
        hex::encode(hasher.finalize())
    }

    pub fn generate_key() -> (String, String, String) {
        let raw = Uuid::new_v4().to_string().replace('-', "");
        let full_key = format!("sk-cool-{raw}");
        let prefix = format!("sk-cool-{}...", &raw[..4]);
        let hash = Self::hash_key(&full_key);
        (full_key, prefix, hash)
    }

    pub async fn create(pool: &PgPool, user_id: Uuid, name: &str, group_id: Option<Uuid>, remark: Option<&str>) -> Result<(Self, String), sqlx::Error> {
        let (full_key, prefix, hash) = Self::generate_key();
        let key: Self = sqlx::query_as(
            "INSERT INTO relay_keys (user_id, name, key_hash, key_prefix, group_id, remark) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *"
        )
        .bind(user_id)
        .bind(name)
        .bind(&hash)
        .bind(&prefix)
        .bind(group_id)
        .bind(remark.unwrap_or(""))
        .fetch_one(pool)
        .await?;
        Ok((key, full_key))
    }

    pub async fn find_by_key(pool: &PgPool, raw_key: &str) -> Result<Option<Self>, sqlx::Error> {
        let hash = Self::hash_key(raw_key);
        sqlx::query_as("SELECT * FROM relay_keys WHERE key_hash = $1 AND is_active = true")
            .bind(&hash)
            .fetch_optional(pool)
            .await
    }

    pub async fn list_by_user(pool: &PgPool, user_id: Uuid) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as("SELECT * FROM relay_keys WHERE user_id = $1 ORDER BY created_at DESC")
            .bind(user_id)
            .fetch_all(pool)
            .await
    }

    pub async fn list_all(pool: &PgPool) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as("SELECT * FROM relay_keys ORDER BY created_at DESC")
            .fetch_all(pool)
            .await
    }

    pub async fn delete(pool: &PgPool, id: Uuid, user_id: Uuid) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM relay_keys WHERE id = $1 AND user_id = $2")
            .bind(id)
            .bind(user_id)
            .execute(pool)
            .await?;
        Ok(())
    }

    pub async fn admin_delete(pool: &PgPool, id: Uuid) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM relay_keys WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }

    pub async fn admin_toggle_active(pool: &PgPool, id: Uuid) -> Result<Self, sqlx::Error> {
        sqlx::query_as("UPDATE relay_keys SET is_active = NOT is_active WHERE id = $1 RETURNING *")
            .bind(id)
            .fetch_one(pool)
            .await
    }

    pub async fn toggle_active(pool: &PgPool, id: Uuid, user_id: Uuid) -> Result<Self, sqlx::Error> {
        sqlx::query_as(
            "UPDATE relay_keys SET is_active = NOT is_active WHERE id = $1 AND user_id = $2 RETURNING *"
        )
        .bind(id)
        .bind(user_id)
        .fetch_one(pool)
        .await
    }
}
