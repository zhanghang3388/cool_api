//! Pricing oracle — fetch the community-maintained price catalog from
//! [models.dev](https://models.dev/api.json) and look up canonical USD
//! pricing per model.
//!
//! Per project policy 1 USD == 1 ¥, so cents (= 0.01¥) is just `usd * 100`.
//!
//! **Important: there is NO global dedup across providers.** Earlier we
//! tried "non-zero, lowest input wins" (copied from new-api). That picks
//! reseller pricing — a reseller listing `claude-haiku-4-5` at $0.14/M
//! beats Anthropic's own $1.00/M, which is wrong. Instead we keep the
//! per-provider tree intact and force callers to ask for a specific
//! provider key (`anthropic`, `openai`, ...). If models.dev doesn't have
//! the canonical entry, the model is skipped — admin can add it manually.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use serde::Deserialize;
use tokio::sync::Mutex;

use crate::error::{AppError, AppResult};

const MODELS_DEV_URL: &str = "https://models.dev/api.json";
/// Cache lifetime — models.dev only updates daily-ish, so half an hour is
/// more than enough and saves a network round-trip per preview.
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
}

/// `provider_key → model_name → entry`. provider_key matches the top-level
/// keys used by models.dev (e.g. `"anthropic"`, `"openai"`).
pub type RawTable = HashMap<String, HashMap<String, PricingEntry>>;

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

fn is_finite_non_negative(v: f64) -> bool {
    v.is_finite() && v >= 0.0
}

fn build_entry(cost: &CostEntry) -> Option<PricingEntry> {
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
    let cache_read = match cost.cache_read {
        Some(x) if is_finite_non_negative(x) => Some(usd_to_cents_per_1m(x)),
        Some(_) => return None,
        None => None,
    };
    let cache_write = match cost.cache_write {
        Some(x) if is_finite_non_negative(x) => Some(usd_to_cents_per_1m(x)),
        Some(_) => return None,
        None => None,
    };
    Some(PricingEntry {
        input_cents: usd_to_cents_per_1m(input),
        output_cents: usd_to_cents_per_1m(output),
        cache_read_cents: cache_read,
        cache_write_cents: cache_write,
    })
}

fn usd_to_cents_per_1m(usd_per_1m: f64) -> i64 {
    // `models.input_price_cents` unit is 0.01¥ per 1M tokens; user policy
    // 1 USD == 1 ¥; so multiply by 100 and round.
    (usd_per_1m * 100.0).round() as i64
}

fn build_table(payload: ModelsDevPayload) -> RawTable {
    let mut out: RawTable = HashMap::new();
    for (provider, prov_entry) in payload.0 {
        let mut inner: HashMap<String, PricingEntry> = HashMap::new();
        for (model_name, model) in prov_entry.models {
            let Some(cost) = model.cost.as_ref() else {
                continue;
            };
            if let Some(entry) = build_entry(cost) {
                inner.insert(model_name, entry);
            }
        }
        if !inner.is_empty() {
            out.insert(provider, inner);
        }
    }
    out
}

#[derive(Debug, Clone)]
struct CacheState {
    fetched_at: Instant,
    table: Arc<RawTable>,
}

static CACHE: tokio::sync::OnceCell<Mutex<Option<CacheState>>> = tokio::sync::OnceCell::const_new();

async fn cache_slot() -> &'static Mutex<Option<CacheState>> {
    CACHE.get_or_init(|| async { Mutex::new(None) }).await
}

/// Fetch + cache the full per-provider price tree from models.dev.
/// Caller looks up `table[provider_key][model_name]`.
pub async fn get_pricing_table(http: &reqwest::Client) -> AppResult<Arc<RawTable>> {
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
    let table = Arc::new(build_table(payload));
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
        assert_eq!(usd_to_cents_per_1m(1.25), 125);
    }

    #[test]
    fn build_entry_keeps_canonical_anthropic_pricing() {
        // Verify the regression case: claude-haiku-4-5-20251001 official
        // price under the `anthropic` key is $1 / $5 / cache_read $0.1 /
        // cache_write $1.25. The catalog also has a reseller `qihang-ai`
        // with $0.14 / $0.71 — but we no longer global-dedup, so the
        // canonical anthropic row must round-trip unchanged.
        let cost = CostEntry {
            input: Some(1.0),
            output: Some(5.0),
            cache_read: Some(0.1),
            cache_write: Some(1.25),
        };
        let entry = build_entry(&cost).expect("valid cost");
        assert_eq!(entry.input_cents, 100);
        assert_eq!(entry.output_cents, 500);
        assert_eq!(entry.cache_read_cents, Some(10));
        assert_eq!(entry.cache_write_cents, Some(125));
    }

    #[test]
    fn build_entry_rejects_invalid() {
        // input=0 with output>0 has no valid representation.
        assert!(build_entry(&CostEntry {
            input: Some(0.0),
            output: Some(5.0),
            cache_read: None,
            cache_write: None,
        })
        .is_none());

        // Missing input.
        assert!(build_entry(&CostEntry {
            input: None,
            output: Some(5.0),
            cache_read: None,
            cache_write: None,
        })
        .is_none());

        // Negative input.
        assert!(build_entry(&CostEntry {
            input: Some(-1.0),
            output: Some(5.0),
            cache_read: None,
            cache_write: None,
        })
        .is_none());
    }
}
