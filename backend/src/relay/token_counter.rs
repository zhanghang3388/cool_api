use crate::models::pricing::ModelPricing;
use sqlx::PgPool;
use tiktoken_rs::{bpe_for_model, cl100k_base_singleton};

pub fn count_tokens(text: &str, model: &str) -> u32 {
    let token_count = bpe_for_model(model)
        .unwrap_or_else(|_| cl100k_base_singleton())
        .encode_with_special_tokens(text)
        .len();
    token_count.min(u32::MAX as usize) as u32
}

pub fn count_message_tokens(messages: &[super::providers::ChatMessage], model: &str) -> u32 {
    let mut total: u32 = 0;
    for msg in messages {
        total += 4;
        let content = match &msg.content {
            serde_json::Value::String(s) => s.clone(),
            other => other.to_string(),
        };
        total += count_tokens(&content, model);
    }
    total += 3;
    total
}

/// Estimate cost from database pricing. Falls back to hardcoded defaults if not found.
pub async fn estimate_cost_from_db(
    pool: &PgPool,
    model: &str,
    prompt_tokens: u32,
    completion_tokens: u32,
) -> i64 {
    if let Ok(Some(pricing)) = ModelPricing::find_best_match(pool, model).await {
        let prompt_price = pricing.effective_input_price();
        let completion_price = pricing.effective_output_price();
        let prompt_cost = prompt_tokens as f64 * prompt_price;
        let completion_cost = completion_tokens as f64 * completion_price;
        return (prompt_cost + completion_cost).ceil() as i64;
    }
    // Fallback to hardcoded
    estimate_cost_micro_cents(model, prompt_tokens, completion_tokens)
}

pub fn estimate_cost_micro_cents(model: &str, prompt_tokens: u32, completion_tokens: u32) -> i64 {
    let (prompt_price, completion_price): (f64, f64) = match model {
        m if m.starts_with("gpt-4o-mini") => (0.15, 0.60),
        m if m.starts_with("gpt-4o") => (2.50, 10.00),
        m if m.starts_with("gpt-4-turbo") => (10.00, 30.00),
        m if m.starts_with("gpt-4") => (30.00, 60.00),
        m if m.starts_with("gpt-3.5") => (0.50, 1.50),
        m if m.contains("claude-3-5-sonnet") || m.contains("claude-sonnet-4") => (3.00, 15.00),
        m if m.contains("claude-3-5-haiku") || m.contains("claude-haiku-4") => (0.80, 4.00),
        m if m.contains("claude-3-opus") || m.contains("claude-opus-4") => (15.00, 75.00),
        m if m.contains("claude-3-haiku") => (0.25, 1.25),
        m if m.contains("gemini-2.5-pro") => (1.25, 10.00),
        m if m.contains("gemini-2.5-flash") => (0.15, 0.60),
        m if m.contains("gemini-2.0-flash") => (0.10, 0.40),
        m if m.contains("gemini-1.5-pro") || m.contains("gemini-2") => (1.25, 5.00),
        m if m.contains("gemini-1.5-flash") => (0.075, 0.30),
        m if m.contains("deepseek-chat") => (0.27, 1.10),
        m if m.contains("deepseek-reasoner") => (0.55, 2.19),
        m if m.contains("deepseek-coder") => (0.14, 0.28),
        _ => (1.00, 3.00),
    };

    let prompt_cost = prompt_tokens as f64 * prompt_price;
    let completion_cost = completion_tokens as f64 * completion_price;
    (prompt_cost + completion_cost).ceil() as i64
}
