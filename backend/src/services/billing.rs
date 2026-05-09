//! Usage-based billing.
//!
//! Cost formula (per request):
//!   non_cached_input_cost = model.input_price_cents  * non_cached_prompt * multiplier / 1_000_000
//!   cached_input_cost     = (model.cache_read_price_cents OR input_price_cents) * cached * multiplier / 1_000_000
//!   output_cost           = model.output_price_cents * completion * multiplier / 1_000_000
//!   total                 = ceil(non_cached_input_cost + cached_input_cost + output_cost)  // in cents
//!
//! The total is ALWAYS an integer number of cents; we round up (ceil) so we
//! never under-bill fractional cents.

use bigdecimal::{BigDecimal, Signed, ToPrimitive};
use chrono::{DateTime, Utc};
use sqlx::{PgPool, Postgres, Transaction};
use std::str::FromStr;

use crate::error::{AppError, AppResult};
use crate::models::{Model, RequestStatus};
use crate::upstream::Usage;

/// Per-request billing input. Callers (v1 handler, anthropic handler) build this
/// once they know which channel + model was used and the usage counts.
pub struct ChargeInput<'a> {
    pub user_id: i64,
    pub group_id: i64,
    pub group_multiplier: &'a BigDecimal,
    pub model: &'a Model,
    pub channel_id: Option<i64>,
    pub usage: Usage,
    pub latency_ms: i32,
    pub status: RequestStatus,
    pub error_message: Option<&'a str>,
}

pub struct ChargeResult {
    pub total_cost_cents: i64,
    pub input_cost_cents: i64,
    pub output_cost_cents: i64,
    #[allow(dead_code)]
    pub created_at: DateTime<Utc>,
}

/// Run pricing math (no DB write). Useful for pre-flight checks.
pub fn compute_cost(input: &ChargeInput<'_>) -> (i64, i64, i64) {
    let mult = input.group_multiplier;
    let mut non_cached_prompt = input.usage.prompt_tokens - input.usage.cached_tokens;
    if non_cached_prompt < 0 {
        non_cached_prompt = 0;
    }

    let one_mil = BigDecimal::from(1_000_000);

    let input_price = BigDecimal::from(input.model.input_price_cents);
    let output_price = BigDecimal::from(input.model.output_price_cents);
    let cache_price = input
        .model
        .cache_read_price_cents
        .map(BigDecimal::from)
        .unwrap_or_else(|| input_price.clone());

    let non_cached_cost =
        &input_price * BigDecimal::from(non_cached_prompt) * mult / &one_mil;
    let cached_cost =
        &cache_price * BigDecimal::from(input.usage.cached_tokens) * mult / &one_mil;
    let output_cost =
        &output_price * BigDecimal::from(input.usage.completion_tokens) * mult / &one_mil;

    let input_total = ceil_to_cents(&(non_cached_cost + cached_cost));
    let output_total = ceil_to_cents(&output_cost);
    (input_total, output_total, input_total + output_total)
}

/// Cached-response pricing: every prompt token is charged at the model's
/// `cache_read_price_cents` (falling back to the normal input price if the
/// model doesn't publish a cache rate). Completion tokens still bill at the
/// standard output rate.
pub fn compute_cached_cost(input: &ChargeInput<'_>) -> (i64, i64, i64) {
    let mult = input.group_multiplier;
    let one_mil = BigDecimal::from(1_000_000);

    let input_price = BigDecimal::from(input.model.input_price_cents);
    let output_price = BigDecimal::from(input.model.output_price_cents);
    let cache_price = input
        .model
        .cache_read_price_cents
        .map(BigDecimal::from)
        .unwrap_or_else(|| input_price.clone());

    let input_cost =
        &cache_price * BigDecimal::from(input.usage.prompt_tokens) * mult / &one_mil;
    let output_cost =
        &output_price * BigDecimal::from(input.usage.completion_tokens) * mult / &one_mil;

    let input_total = ceil_to_cents(&input_cost);
    let output_total = ceil_to_cents(&output_cost);
    (input_total, output_total, input_total + output_total)
}

fn ceil_to_cents(v: &BigDecimal) -> i64 {
    if !v.is_positive() {
        return 0;
    }
    // ceil() with bigdecimal: if fractional part > 0 add 1.
    let int_part = v.with_scale(0).to_i64().unwrap_or(0);
    let fractional = v - BigDecimal::from(int_part);
    if fractional.is_positive() {
        int_part + 1
    } else {
        int_part
    }
}

/// Deduct balance, insert a request_logs row, and update total_used_cents.
/// Returns `InsufficientBalance` if deduction underflows (and nothing gets written).
pub async fn charge(pool: &PgPool, input: ChargeInput<'_>) -> AppResult<ChargeResult> {
    let (input_cost_cents, output_cost_cents, total_cost_cents) = match input.status {
        RequestStatus::Cached => compute_cached_cost(&input),
        _ => compute_cost(&input),
    };

    let mut tx: Transaction<'_, Postgres> = pool.begin().await?;

    // Atomic deduction guarded by balance_non_negative CHECK: if we'd go
    // negative, the UPDATE ... RETURNING yields 0 rows.
    let updated: Option<(i64,)> = sqlx::query_as(
        "UPDATE users
            SET balance_cents = balance_cents - $2,
                total_used_cents = total_used_cents + $2
          WHERE id = $1 AND balance_cents >= $2
          RETURNING balance_cents",
    )
    .bind(input.user_id)
    .bind(total_cost_cents)
    .fetch_optional(&mut *tx)
    .await?;

    if updated.is_none() && total_cost_cents > 0 {
        tx.rollback().await.ok();
        return Err(AppError::InsufficientBalance);
    }

    sqlx::query(
        "INSERT INTO request_logs (
            user_id, channel_id, group_id, model_name,
            prompt_tokens, completion_tokens, cached_tokens,
            input_cost_cents, output_cost_cents, total_cost_cents,
            multiplier_applied, latency_ms, status, error_message
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)",
    )
    .bind(input.user_id)
    .bind(input.channel_id)
    .bind(input.group_id)
    .bind(&input.model.name)
    .bind(input.usage.prompt_tokens)
    .bind(input.usage.completion_tokens)
    .bind(input.usage.cached_tokens)
    .bind(input_cost_cents)
    .bind(output_cost_cents)
    .bind(total_cost_cents)
    .bind(input.group_multiplier)
    .bind(input.latency_ms)
    .bind(input.status)
    .bind(input.error_message)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    Ok(ChargeResult {
        total_cost_cents,
        input_cost_cents,
        output_cost_cents,
        created_at: Utc::now(),
    })
}

/// Quick affordability check: does the user have at least `min_cents` available?
/// Used to reject requests *before* we spend compute on the upstream call.
pub async fn has_balance(pool: &PgPool, user_id: i64, min_cents: i64) -> AppResult<bool> {
    let row: Option<(i64,)> =
        sqlx::query_as("SELECT balance_cents FROM users WHERE id = $1")
            .bind(user_id)
            .fetch_optional(pool)
            .await?;
    Ok(row.map(|(b,)| b >= min_cents).unwrap_or(false))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::Model;
    use chrono::Utc;

    fn mk_model(input_p: i64, output_p: i64, cache_p: Option<i64>) -> Model {
        Model {
            id: 1,
            name: "test".into(),
            provider: "Test".into(),
            input_price_cents: input_p,
            output_price_cents: output_p,
            cache_read_price_cents: cache_p,
            enabled: true,
            description: String::new(),
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }
    }

    #[test]
    fn straight_x1_multiplier() {
        // Opus 4.7 style: $15 in, $75 out, cache $1.50
        let model = mk_model(1500, 7500, Some(150));
        let input = ChargeInput {
            user_id: 1,
            group_id: 1,
            group_multiplier: &BigDecimal::from(1),
            model: &model,
            channel_id: None,
            usage: Usage {
                prompt_tokens: 1_000_000,
                completion_tokens: 500_000,
                cached_tokens: 0,
            },
            latency_ms: 0,
            status: RequestStatus::Success,
            error_message: None,
        };
        let (i, o, t) = compute_cost(&input);
        assert_eq!(i, 1500); // 1500 cents for 1M input tokens
        assert_eq!(o, 3750); // 3750 for 500k output
        assert_eq!(t, 5250);
    }

    #[test]
    fn aws_multiplier_40_percent() {
        let model = mk_model(1500, 7500, None);
        let mult = BigDecimal::from_str("0.4").unwrap();
        let input = ChargeInput {
            user_id: 1,
            group_id: 1,
            group_multiplier: &mult,
            model: &model,
            channel_id: None,
            usage: Usage {
                prompt_tokens: 1_000_000,
                completion_tokens: 1_000_000,
                cached_tokens: 0,
            },
            latency_ms: 0,
            status: RequestStatus::Success,
            error_message: None,
        };
        let (_, _, t) = compute_cost(&input);
        // (1500 + 7500) * 0.4 = 3600
        assert_eq!(t, 3600);
    }

    #[test]
    fn fractional_rounds_up() {
        let model = mk_model(100, 100, None);
        let input = ChargeInput {
            user_id: 1,
            group_id: 1,
            group_multiplier: &BigDecimal::from(1),
            model: &model,
            channel_id: None,
            // 1 token in at $0.01/1M = 0.0000001 cents ... round up to 1 cent
            usage: Usage {
                prompt_tokens: 1,
                completion_tokens: 0,
                cached_tokens: 0,
            },
            latency_ms: 0,
            status: RequestStatus::Success,
            error_message: None,
        };
        let (i, o, t) = compute_cost(&input);
        assert_eq!(i, 1);
        assert_eq!(o, 0);
        assert_eq!(t, 1);
    }

    #[test]
    fn cached_tokens_use_cheaper_rate() {
        // Input $10/1M, cache $1/1M. 1M tokens, all cached = 1 cent.
        let model = mk_model(1000, 1000, Some(100));
        let input = ChargeInput {
            user_id: 1,
            group_id: 1,
            group_multiplier: &BigDecimal::from(1),
            model: &model,
            channel_id: None,
            usage: Usage {
                prompt_tokens: 1_000_000,
                completion_tokens: 0,
                cached_tokens: 1_000_000,
            },
            latency_ms: 0,
            status: RequestStatus::Success,
            error_message: None,
        };
        let (i, _, t) = compute_cost(&input);
        assert_eq!(i, 100); // all 1M tokens charged at cache price 100 cents/1M
        assert_eq!(t, 100);
    }

    #[test]
    fn zero_usage_zero_cost() {
        let model = mk_model(1500, 7500, None);
        let input = ChargeInput {
            user_id: 1,
            group_id: 1,
            group_multiplier: &BigDecimal::from(1),
            model: &model,
            channel_id: None,
            usage: Usage::default(),
            latency_ms: 0,
            status: RequestStatus::Error,
            error_message: None,
        };
        let (_, _, t) = compute_cost(&input);
        assert_eq!(t, 0);
    }
}
