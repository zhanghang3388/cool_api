/// Approximate token counting.
/// For OpenAI models we use a simple heuristic (chars / 4).
/// In production, consider using tiktoken-rs for exact counts.

pub fn count_tokens(text: &str, _model: &str) -> u32 {
    // Simple heuristic: ~4 chars per token for English text
    // This is a reasonable approximation across models
    (text.len() as f64 / 4.0).ceil() as u32
}

pub fn count_message_tokens(messages: &[super::providers::ChatMessage], model: &str) -> u32 {
    let mut total: u32 = 0;
    for msg in messages {
        // Role overhead ~4 tokens
        total += 4;
        let content = match &msg.content {
            serde_json::Value::String(s) => s.clone(),
            other => other.to_string(),
        };
        total += count_tokens(&content, model);
    }
    // Every reply is primed with assistant
    total += 3;
    total
}

pub fn estimate_cost_micro_cents(model: &str, prompt_tokens: u32, completion_tokens: u32) -> i64 {
    // Pricing per 1M tokens in micro-cents (1e-4 cents = 1e-6 dollars)
    // $1 = 100 cents = 1_000_000 micro-cents
    let (prompt_price, completion_price): (f64, f64) = match model {
        m if m.starts_with("gpt-4o-mini") => (0.15, 0.60),
        m if m.starts_with("gpt-4o") => (2.50, 10.00),
        m if m.starts_with("gpt-4-turbo") => (10.00, 30.00),
        m if m.starts_with("gpt-4") => (30.00, 60.00),
        m if m.starts_with("gpt-3.5") => (0.50, 1.50),
        m if m.contains("claude-3-5-sonnet") || m.contains("claude-sonnet-4") => (3.00, 15.00),
        m if m.contains("claude-3-5-haiku") || m.contains("claude-haiku-4") => (0.80, 4.00),
        m if m.contains("claude-3-opus") || m.contains("claude-opus-4") => (15.00, 75.00),
        m if m.contains("gemini-1.5-pro") || m.contains("gemini-2") => (1.25, 5.00),
        m if m.contains("gemini-1.5-flash") => (0.075, 0.30),
        _ => (1.00, 3.00), // default fallback
    };

    // price is per 1M tokens in dollars, convert to micro-cents
    // $X per 1M tokens = X * 1_000_000 micro-cents per 1M tokens = X micro-cents per token
    let prompt_cost = prompt_tokens as f64 * prompt_price;
    let completion_cost = completion_tokens as f64 * completion_price;

    (prompt_cost + completion_cost).ceil() as i64
}
