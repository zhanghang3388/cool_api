//! Pricing oracle — fetch the community-maintained price catalog from
//! [models.dev](https://models.dev/api.json) and turn its raw USD-per-1M-tokens
//! payload into the `0.01¥ per 1M tokens` units our `models` table stores.
//!
//! The user has decided 1 USD == 1 ¥ for this product, so the conversion is
//! `cents = round(usd_per_1M * 100)`. No exchange rate wired in.
//!
//! models.dev returns a `provider → models` tree. The same model name often
//! appears under multiple providers (Anthropic native + a reseller, OpenAI +
//! a gateway, etc.) so we flatten with new-api's tie-break rule: prefer the
//! non-zero candidate; among non-zero, prefer the lowest input price; then
//! deterministic by provider name.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use serde::Deserialize;
use tokio::sync::Mutex;

use crate::error::{AppError, AppResult};

const MODELS_DEV_URL: &str = "https://models.dev/api.json";
/// Cache lifetime — models.dev only updates daily-ish, so half an hour is
/// more than enough and saves us a network round-trip on every preview.
const CACHE_TTL: Duration = Duration::from_secs(30 * 60);
/// Hard request timeout — short enough that a hung models.dev doesn't wedge
/// the admin UI; the catalog is small (~few hundred KB) so this is plenty.
const FETCH_TIMEOUT: Duration = Duration::from_secs(15);

/// Price entry in our internal representation: cents-per-1M-tokens, where
/// "cents" means 0.01¥ (= the unit `models.input_price_cents` stores).
#[derive(Debug, Clone, serde::Serialize)]
pub struct PricingEntry {
    pub input_cents: i64,
    pub output_cents: i64,
    pub cache_read_cents: Option<i64>,
    pub cache_write_cents: Option<i64>,
    /// Which provider in models.dev contributed this row — used for debugging
    /// only, not exposed to the API consumer.
    #[serde(skip)]
    pub source_provider: String,
}

#[derive(Debug, Deserialize)]
struct ModelsDevPayload(HashMap<String, ProviderEntry>);

#[derive(Debug, Deserialize)]
struct ProviderEntry {
    #[serde(default)]
    models: HashMap<String, ModelEntry>,
}

#[derive(Debug, Deserialize)]
struct ModelEntry {
    #[serde(default)]
    cost: Option<CostEntry>,
}

#[derive(Debug, Deserialize)]
struct CostEntry {
    #[serde(default)]
    input: Option<f64>,
    #[serde(default)]
    output: Option<f64>,
    #[serde(default)]
    cache_read: Option<f64>,
    #[serde(default)]
    cache_write: Option<f64>,
}

#[derive(Debug, Clone)]
struct Candidate {
    provider: String,
    input: f64,
    output: f64,
    cache_read: Option<f64>,
    cache_write: Option<f64>,
}

fn is_finite_non_negative(v: f64) -> bool {
    v.is_finite() && v >= 0.0
}

fn build_candidate(provider: &str, cost: &CostEntry) -> Option<Candidate> {
    let input = cost.input?;
    if !is_finite_non_negative(input) {
        return None;
    }
    let output = cost.output?;
    if !is_finite_non_negative(output) {
        return None;
    }
    // input=0 with positive output cannot survive our ratio-free model — both
    // need to be zero or both need to be positive.
    if input == 0.0 && output > 0.0 {
        return None;
    }
    let validate_opt = |v: Option<f64>| -> Option<Option<f64>> {
        match v {
            Some(x) if is_finite_non_negative(x) => Some(Some(x)),
            Some(_) => None, // present but invalid → reject the whole candidate
            None => Some(None),
        }
    };
    let cache_read = validate_opt(cost.cache_read)?;
    let cache_write = validate_opt(cost.cache_write)?;
    Some(Candidate {
        provider: provider.to_string(),
        input,
        output,
        cache_read,
        cache_write,
    })
}

fn should_replace(current: &Candidate, next: &Candidate) -> bool {
    let cur_nz = current.input > 0.0;
    let next_nz = next.input > 0.0;
    if cur_nz != next_nz {
        return next_nz;
    }
    if next_nz && (next.input - current.input).abs() > f64::EPSILON {
        return next.input < current.input;
    }
    next.provider < current.provider
}

fn usd_to_cents_per_1m(usd_per_1m: f64) -> i64 {
    // `models.input_price_cents` unit is 0.01¥ per 1M tokens; user policy
    // 1 USD == 1 ¥; so multiply by 100 and round.
    (usd_per_1m * 100.0).round() as i64
}

fn flatten(payload: ModelsDevPayload) -> HashMap<String, PricingEntry> {
    let mut chosen: HashMap<String, Candidate> = HashMap::new();

    // Sort providers for deterministic tie-breaking even before
    // `should_replace` runs.
    let mut providers: Vec<(String, ProviderEntry)> = payload.0.into_iter().collect();
    providers.sort_by(|a, b| a.0.cmp(&b.0));

    for (provider, prov_entry) in providers {
        let mut model_names: Vec<(String, ModelEntry)> = prov_entry.models.into_iter().collect();
        model_names.sort_by(|a, b| a.0.cmp(&b.0));
        for (model_name, model) in model_names {
            let Some(cost) = model.cost.as_ref() else {
                continue;
            };
            let Some(candidate) = build_candidate(&provider, cost) else {
                continue;
            };
            match chosen.get(&model_name) {
                Some(cur) if !should_replace(cur, &candidate) => {}
                _ => {
                    chosen.insert(model_name, candidate);
                }
            }
        }
    }

    chosen
        .into_iter()
        .map(|(name, c)| {
            (
                name,
                PricingEntry {
                    input_cents: usd_to_cents_per_1m(c.input),
                    output_cents: usd_to_cents_per_1m(c.output),
                    cache_read_cents: c.cache_read.map(usd_to_cents_per_1m),
                    cache_write_cents: c.cache_write.map(usd_to_cents_per_1m),
                    source_provider: c.provider,
                },
            )
        })
        .collect()
}

#[derive(Debug, Clone)]
struct CacheState {
    fetched_at: Instant,
    table: Arc<HashMap<String, PricingEntry>>,
}

static CACHE: tokio::sync::OnceCell<Mutex<Option<CacheState>>> = tokio::sync::OnceCell::const_new();

async fn cache_slot() -> &'static Mutex<Option<CacheState>> {
    CACHE.get_or_init(|| async { Mutex::new(None) }).await
}

/// Returns the price table, fetching from models.dev if the in-memory cache
/// is empty or stale. Errors propagate as AppError so admin UI can show them.
pub async fn get_pricing_table(
    http: &reqwest::Client,
) -> AppResult<Arc<HashMap<String, PricingEntry>>> {
    let slot = cache_slot().await;
    {
        let guard = slot.lock().await;
        if let Some(state) = guard.as_ref() {
            if state.fetched_at.elapsed() < CACHE_TTL {
                return Ok(state.table.clone());
            }
        }
    }

    // Cache miss / stale: fetch fresh. We hold the lock across the network
    // request so concurrent admin requests share the result instead of all
    // pounding models.dev.
    let mut guard = slot.lock().await;
    if let Some(state) = guard.as_ref() {
        if state.fetched_at.elapsed() < CACHE_TTL {
            return Ok(state.table.clone());
        }
    }

    let resp = http
        .get(MODELS_DEV_URL)
        .timeout(FETCH_TIMEOUT)
        .send()
        .await
        .map_err(|e| AppError::Upstream(format!("fetch models.dev: {e}")))?;
    if !resp.status().is_success() {
        return Err(AppError::Upstream(format!(
            "models.dev returned {}",
            resp.status()
        )));
    }
    let payload: ModelsDevPayload = resp
        .json()
        .await
        .map_err(|e| AppError::Upstream(format!("decode models.dev: {e}")))?;
    let table = Arc::new(flatten(payload));
    *guard = Some(CacheState {
        fetched_at: Instant::now(),
        table: table.clone(),
    });
    Ok(table)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn convert_usd_to_cents() {
        assert_eq!(usd_to_cents_per_1m(3.0), 300);
        assert_eq!(usd_to_cents_per_1m(0.3), 30);
        assert_eq!(usd_to_cents_per_1m(0.0), 0);
        assert_eq!(usd_to_cents_per_1m(15.0), 1500);
    }

    #[test]
    fn replace_prefers_non_zero_then_cheapest() {
        let zero = Candidate {
            provider: "a".into(),
            input: 0.0,
            output: 0.0,
            cache_read: None,
            cache_write: None,
        };
        let cheap = Candidate {
            provider: "b".into(),
            input: 1.0,
            output: 2.0,
            cache_read: None,
            cache_write: None,
        };
        let pricier = Candidate {
            provider: "c".into(),
            input: 5.0,
            output: 10.0,
            cache_read: None,
            cache_write: None,
        };
        assert!(should_replace(&zero, &cheap), "non-zero should win over zero");
        assert!(!should_replace(&cheap, &zero), "zero should not displace non-zero");
        assert!(should_replace(&pricier, &cheap), "cheaper should win");
        assert!(!should_replace(&cheap, &pricier), "pricier shouldn't replace");
    }
}
