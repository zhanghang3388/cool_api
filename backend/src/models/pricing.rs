use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ModelPricing {
    pub id: Uuid,
    pub model: String,
    pub provider: String,
    pub input_price: f64,
    pub output_price: f64,
    pub multiplier: f64,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreatePricing {
    pub model: String,
    pub provider: String,
    pub input_price: f64,
    pub output_price: f64,
    pub multiplier: Option<f64>,
}

#[derive(Debug, Deserialize)]
pub struct UpdatePricing {
    pub input_price: Option<f64>,
    pub output_price: Option<f64>,
    pub multiplier: Option<f64>,
    pub is_active: Option<bool>,
}

/// Built-in official pricing data ($/1M tokens)
pub fn official_pricing() -> Vec<CreatePricing> {
    vec![
        // OpenAI
        CreatePricing { model: "gpt-4o".into(), provider: "openai".into(), input_price: 2.50, output_price: 10.00, multiplier: None },
        CreatePricing { model: "gpt-4o-mini".into(), provider: "openai".into(), input_price: 0.15, output_price: 0.60, multiplier: None },
        CreatePricing { model: "gpt-4-turbo".into(), provider: "openai".into(), input_price: 10.00, output_price: 30.00, multiplier: None },
        CreatePricing { model: "gpt-4".into(), provider: "openai".into(), input_price: 30.00, output_price: 60.00, multiplier: None },
        CreatePricing { model: "gpt-3.5-turbo".into(), provider: "openai".into(), input_price: 0.50, output_price: 1.50, multiplier: None },
        CreatePricing { model: "o1".into(), provider: "openai".into(), input_price: 15.00, output_price: 60.00, multiplier: None },
        CreatePricing { model: "o1-mini".into(), provider: "openai".into(), input_price: 3.00, output_price: 12.00, multiplier: None },
        CreatePricing { model: "o3-mini".into(), provider: "openai".into(), input_price: 1.10, output_price: 4.40, multiplier: None },
        // Claude
        CreatePricing { model: "claude-sonnet-4-20250514".into(), provider: "claude".into(), input_price: 3.00, output_price: 15.00, multiplier: None },
        CreatePricing { model: "claude-opus-4-20250514".into(), provider: "claude".into(), input_price: 15.00, output_price: 75.00, multiplier: None },
        CreatePricing { model: "claude-haiku-4-20250514".into(), provider: "claude".into(), input_price: 0.80, output_price: 4.00, multiplier: None },
        CreatePricing { model: "claude-3-5-sonnet-20241022".into(), provider: "claude".into(), input_price: 3.00, output_price: 15.00, multiplier: None },
        CreatePricing { model: "claude-3-5-haiku-20241022".into(), provider: "claude".into(), input_price: 0.80, output_price: 4.00, multiplier: None },
        CreatePricing { model: "claude-3-opus-20240229".into(), provider: "claude".into(), input_price: 15.00, output_price: 75.00, multiplier: None },
        // Gemini
        CreatePricing { model: "gemini-2.5-pro".into(), provider: "gemini".into(), input_price: 1.25, output_price: 10.00, multiplier: None },
        CreatePricing { model: "gemini-2.5-flash".into(), provider: "gemini".into(), input_price: 0.15, output_price: 0.60, multiplier: None },
        CreatePricing { model: "gemini-2.0-flash".into(), provider: "gemini".into(), input_price: 0.10, output_price: 0.40, multiplier: None },
        CreatePricing { model: "gemini-1.5-pro".into(), provider: "gemini".into(), input_price: 1.25, output_price: 5.00, multiplier: None },
        CreatePricing { model: "gemini-1.5-flash".into(), provider: "gemini".into(), input_price: 0.075, output_price: 0.30, multiplier: None },
    ]
}

impl ModelPricing {
    pub async fn list(pool: &PgPool) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as("SELECT * FROM model_pricing ORDER BY provider, model")
            .fetch_all(pool)
            .await
    }

    pub async fn list_active(pool: &PgPool) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as("SELECT * FROM model_pricing WHERE is_active = true ORDER BY provider, model")
            .fetch_all(pool)
            .await
    }

    pub async fn find_by_model(pool: &PgPool, model: &str) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as("SELECT * FROM model_pricing WHERE model = $1")
            .bind(model)
            .fetch_optional(pool)
            .await
    }

    /// Find best matching pricing for a model (exact match or prefix match)
    pub async fn find_best_match(pool: &PgPool, model: &str) -> Result<Option<Self>, sqlx::Error> {
        // Try exact match first
        if let Some(p) = Self::find_by_model(pool, model).await? {
            return Ok(Some(p));
        }
        // Try prefix match (e.g., "gpt-4o-2024-08-06" matches "gpt-4o")
        let all = Self::list_active(pool).await?;
        let best = all.into_iter().find(|p| model.starts_with(&p.model));
        Ok(best)
    }

    pub async fn create(pool: &PgPool, input: &CreatePricing) -> Result<Self, sqlx::Error> {
        let multiplier = input.multiplier.unwrap_or(1.0);
        sqlx::query_as(
            "INSERT INTO model_pricing (model, provider, input_price, output_price, multiplier)
             VALUES ($1, $2, $3, $4, $5) RETURNING *"
        )
        .bind(&input.model)
        .bind(&input.provider)
        .bind(input.input_price)
        .bind(input.output_price)
        .bind(multiplier)
        .fetch_one(pool)
        .await
    }

    pub async fn upsert(pool: &PgPool, input: &CreatePricing) -> Result<Self, sqlx::Error> {
        let multiplier = input.multiplier.unwrap_or(1.0);
        sqlx::query_as(
            "INSERT INTO model_pricing (model, provider, input_price, output_price, multiplier)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (model) DO UPDATE SET
                provider = EXCLUDED.provider,
                input_price = EXCLUDED.input_price,
                output_price = EXCLUDED.output_price,
                updated_at = now()
             RETURNING *"
        )
        .bind(&input.model)
        .bind(&input.provider)
        .bind(input.input_price)
        .bind(input.output_price)
        .bind(multiplier)
        .fetch_one(pool)
        .await
    }

    pub async fn update(pool: &PgPool, id: Uuid, input: &UpdatePricing) -> Result<Self, sqlx::Error> {
        let current = sqlx::query_as::<_, Self>("SELECT * FROM model_pricing WHERE id = $1")
            .bind(id)
            .fetch_one(pool)
            .await?;

        sqlx::query_as(
            "UPDATE model_pricing SET input_price = $1, output_price = $2, multiplier = $3, is_active = $4, updated_at = now()
             WHERE id = $5 RETURNING *"
        )
        .bind(input.input_price.unwrap_or(current.input_price))
        .bind(input.output_price.unwrap_or(current.output_price))
        .bind(input.multiplier.unwrap_or(current.multiplier))
        .bind(input.is_active.unwrap_or(current.is_active))
        .bind(id)
        .fetch_one(pool)
        .await
    }

    pub async fn delete(pool: &PgPool, id: Uuid) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM model_pricing WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }

    pub async fn batch_update_multiplier(pool: &PgPool, ids: &[Uuid], multiplier: f64) -> Result<u64, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE model_pricing SET multiplier = $1, updated_at = now() WHERE id = ANY($2)"
        )
        .bind(multiplier)
        .bind(ids)
        .execute(pool)
        .await?;
        Ok(result.rows_affected())
    }

    /// Get effective price (official × multiplier)
    pub fn effective_input_price(&self) -> f64 {
        self.input_price * self.multiplier
    }

    pub fn effective_output_price(&self) -> f64 {
        self.output_price * self.multiplier
    }
}
