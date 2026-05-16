//! Response cache.
//!
//! Cache keys: `sha256(model || "\n" || canonical_body)`. The canonical body
//! is the request JSON with non-semantic fields (stream, user, metadata) removed
//! and object keys sorted, so `{"a":1,"b":2}` and `{"b":2,"a":1}` hit the same
//! entry.
//!
//! Redis layout (all under the `cache:` prefix):
//!   cache:e:{hash}          JSON blob   — cached response envelope (status/body/usage/model/created_at)
//!   cache:recent            LIST<hash>  — most recent N hashes, left-pushed
//!   cache:stats:hit         INT         — counter
//!   cache:stats:store       INT         — counter
//!   cache:stats:saved_tokens INT        — sum of tokens served from cache
//!   cache:stats:saved_cents  INT        — cents that *would have been* charged
//!                                         had each hit been a miss (i.e. the
//!                                         delta between full price and cached
//!                                         price).

use redis::aio::ConnectionManager;
use redis::AsyncCommands;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::error::AppResult;
use crate::upstream::Usage;

const PREFIX: &str = "cache:";
const ENTRY_PREFIX: &str = "cache:e:";
const RECENT_KEY: &str = "cache:recent";
const HIT_KEY: &str = "cache:stats:hit";
const STORE_KEY: &str = "cache:stats:store";
const SAVED_TOKENS_KEY: &str = "cache:stats:saved_tokens";
const SAVED_CENTS_KEY: &str = "cache:stats:saved_cents";

/// Envelope written to Redis alongside the response body.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedEntry {
    pub model: String,
    pub status: u16,
    pub body_base64: String,
    pub prompt_tokens: i32,
    pub completion_tokens: i32,
    pub cached_tokens: i32,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

impl CachedEntry {
    pub fn usage(&self) -> Usage {
        Usage {
            prompt_tokens: self.prompt_tokens,
            completion_tokens: self.completion_tokens,
            cached_tokens: self.cached_tokens,
            // Serving from the local response cache never creates a new
            // upstream prompt-cache entry.
            cache_creation_tokens: 0,
        }
    }
}

/// Stable key, **scoped per API key** so cache entries never cross tenants.
///
/// Two users sending the exact same request body must NOT share a cache hit:
/// the cached response was generated for user A's prompt and may incorporate
/// content (system prompts, names, fragments of files) that we shouldn't echo
/// to user B. The api_key_id namespace makes that mathematical: distinct keys
/// → distinct hashes, even when model + body are byte-identical.
pub fn make_key(api_key_id: i64, model: &str, raw_body: &[u8]) -> String {
    let canonical = canonicalize_body(raw_body);
    let mut h = Sha256::new();
    h.update(api_key_id.to_le_bytes());
    h.update(b"\n");
    h.update(model.as_bytes());
    h.update(b"\n");
    h.update(canonical.as_bytes());
    hex::encode(h.finalize())
}

/// Parse body as JSON, strip non-semantic keys (stream, user, metadata,
/// stream_options), re-serialize with sorted keys. If parsing fails we fall
/// back to the raw bytes, which still yields a stable key.
fn canonicalize_body(raw: &[u8]) -> String {
    let value: serde_json::Value = match serde_json::from_slice(raw) {
        Ok(v) => v,
        Err(_) => return String::from_utf8_lossy(raw).into_owned(),
    };
    let sanitized = sanitize(value);
    // serde_json::to_string with a BTreeMap-backed object keeps keys sorted.
    let as_sorted = to_sorted_json(&sanitized);
    serde_json::to_string(&as_sorted).unwrap_or_default()
}

fn sanitize(v: serde_json::Value) -> serde_json::Value {
    const DROP: &[&str] = &["stream", "user", "metadata", "stream_options"];
    match v {
        serde_json::Value::Object(map) => {
            let kept: serde_json::Map<String, serde_json::Value> = map
                .into_iter()
                .filter(|(k, _)| !DROP.contains(&k.as_str()))
                .map(|(k, v)| (k, sanitize(v)))
                .collect();
            serde_json::Value::Object(kept)
        }
        serde_json::Value::Array(xs) => {
            serde_json::Value::Array(xs.into_iter().map(sanitize).collect())
        }
        other => other,
    }
}

/// Re-materialize a JSON value so object keys are lexicographically sorted.
fn to_sorted_json(v: &serde_json::Value) -> serde_json::Value {
    match v {
        serde_json::Value::Object(map) => {
            let mut entries: Vec<(&String, &serde_json::Value)> = map.iter().collect();
            entries.sort_by(|a, b| a.0.cmp(b.0));
            let rebuilt: serde_json::Map<String, serde_json::Value> = entries
                .into_iter()
                .map(|(k, val)| (k.clone(), to_sorted_json(val)))
                .collect();
            serde_json::Value::Object(rebuilt)
        }
        serde_json::Value::Array(xs) => {
            serde_json::Value::Array(xs.iter().map(to_sorted_json).collect())
        }
        other => other.clone(),
    }
}

pub async fn get(
    redis: &mut ConnectionManager,
    hash: &str,
) -> redis::RedisResult<Option<CachedEntry>> {
    let raw: Option<String> = redis.get(format!("{ENTRY_PREFIX}{hash}")).await?;
    Ok(raw.and_then(|s| serde_json::from_str(&s).ok()))
}

/// Best-effort put — failures are logged but not bubbled up; forwarding should
/// keep working even if Redis hiccups.
pub async fn put(
    redis: &mut ConnectionManager,
    hash: &str,
    entry: &CachedEntry,
    ttl_seconds: i64,
    recent_limit: i64,
) {
    let Ok(payload) = serde_json::to_string(entry) else {
        return;
    };
    let key = format!("{ENTRY_PREFIX}{hash}");
    let ttl = ttl_seconds.max(1) as u64;

    let result: redis::RedisResult<()> = async {
        let _: () = redis.set_ex(&key, &payload, ttl).await?;
        let _: () = redis.lpush(RECENT_KEY, hash).await?;
        if recent_limit > 0 {
            let _: () = redis.ltrim(RECENT_KEY, 0, (recent_limit - 1) as isize).await?;
        }
        let _: () = redis.incr(STORE_KEY, 1).await?;
        Ok(())
    }
    .await;

    if let Err(e) = result {
        tracing::warn!(error = %e, "cache put failed");
    }
}

/// Drop a single entry from Redis. Used when a cached body is detected as
/// corrupt — we'd rather remove it than keep serving bad data.
pub async fn delete(redis: &mut ConnectionManager, hash: &str) -> redis::RedisResult<()> {
    let _: () = redis.del(format!("{ENTRY_PREFIX}{hash}")).await?;
    Ok(())
}

pub async fn record_hit(
    redis: &mut ConnectionManager,
    tokens: i64,
    saved_cents: i64,
) {
    let result: redis::RedisResult<()> = async {
        let _: () = redis.incr(HIT_KEY, 1).await?;
        if tokens > 0 {
            let _: () = redis.incr(SAVED_TOKENS_KEY, tokens).await?;
        }
        if saved_cents > 0 {
            let _: () = redis.incr(SAVED_CENTS_KEY, saved_cents).await?;
        }
        Ok(())
    }
    .await;
    if let Err(e) = result {
        tracing::warn!(error = %e, "cache hit counter update failed");
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct CacheStats {
    pub total_entries: i64,
    pub total_hits: i64,
    pub total_stores: i64,
    pub saved_tokens: i64,
    pub saved_cents: i64,
    pub hit_rate: f64,
}

pub async fn stats(redis: &mut ConnectionManager) -> redis::RedisResult<CacheStats> {
    let (hits, stores, saved_tokens, saved_cents, pending_keys): (
        Option<i64>,
        Option<i64>,
        Option<i64>,
        Option<i64>,
        Option<i64>,
    ) = redis::pipe()
        .atomic()
        .get(HIT_KEY)
        .get(STORE_KEY)
        .get(SAVED_TOKENS_KEY)
        .get(SAVED_CENTS_KEY)
        .llen(RECENT_KEY)
        .query_async(redis)
        .await?;

    let hits = hits.unwrap_or(0);
    let stores = stores.unwrap_or(0);
    let total_entries = count_live_entries(redis, pending_keys.unwrap_or(0)).await?;
    let denom = (hits + stores).max(1);

    Ok(CacheStats {
        total_entries,
        total_hits: hits,
        total_stores: stores,
        saved_tokens: saved_tokens.unwrap_or(0),
        saved_cents: saved_cents.unwrap_or(0),
        hit_rate: (hits as f64) / (denom as f64),
    })
}

/// The `recent` list may reference evicted keys; walk it and count the ones
/// that are still live. Gives the user a rough "active entries" count without
/// an expensive KEYS call.
async fn count_live_entries(
    redis: &mut ConnectionManager,
    recent_len: i64,
) -> redis::RedisResult<i64> {
    if recent_len <= 0 {
        return Ok(0);
    }
    let hashes: Vec<String> = redis
        .lrange(RECENT_KEY, 0, (recent_len - 1) as isize)
        .await?;
    if hashes.is_empty() {
        return Ok(0);
    }
    let keys: Vec<String> = hashes
        .iter()
        .map(|h| format!("{ENTRY_PREFIX}{h}"))
        .collect();

    let mut alive = 0i64;
    for key in &keys {
        let exists: bool = redis.exists(key).await?;
        if exists {
            alive += 1;
        }
    }
    Ok(alive)
}

#[derive(Debug, Clone, Serialize)]
pub struct CacheEntrySummary {
    pub hash: String,
    pub model: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub ttl_seconds: i64,
    pub tokens: i64,
}

pub async fn list_recent(
    redis: &mut ConnectionManager,
    limit: i64,
) -> redis::RedisResult<Vec<CacheEntrySummary>> {
    let hashes: Vec<String> = redis.lrange(RECENT_KEY, 0, (limit - 1) as isize).await?;
    let mut out = Vec::with_capacity(hashes.len());
    for hash in hashes {
        let key = format!("{ENTRY_PREFIX}{hash}");
        let raw: Option<String> = redis.get(&key).await?;
        let Some(raw) = raw else {
            continue; // expired
        };
        let ttl: i64 = redis.ttl(&key).await.unwrap_or(-1);
        let Ok(entry) = serde_json::from_str::<CachedEntry>(&raw) else {
            continue;
        };
        out.push(CacheEntrySummary {
            hash,
            model: entry.model,
            created_at: entry.created_at,
            ttl_seconds: ttl,
            tokens: (entry.prompt_tokens + entry.completion_tokens) as i64,
        });
    }
    Ok(out)
}

/// Delete every cache entry + recent list + stats counters. Does not use
/// `FLUSHDB` — other services may share the Redis instance.
pub async fn clear_all(redis: &mut ConnectionManager) -> redis::RedisResult<i64> {
    let pattern = format!("{PREFIX}*");
    let mut cursor: u64 = 0;
    let mut deleted = 0i64;

    loop {
        // SCAN 0 MATCH cache:* COUNT 200
        let (next_cursor, keys): (u64, Vec<String>) = redis::cmd("SCAN")
            .arg(cursor)
            .arg("MATCH")
            .arg(&pattern)
            .arg("COUNT")
            .arg(200)
            .query_async(redis)
            .await?;

        if !keys.is_empty() {
            let n: i64 = redis.del(&keys).await?;
            deleted += n;
        }

        if next_cursor == 0 {
            break;
        }
        cursor = next_cursor;
    }

    Ok(deleted)
}

#[cfg(test)]
mod tests {
    use super::*;

    const KEY_A: i64 = 1;
    const KEY_B: i64 = 2;

    #[test]
    fn key_stable_for_reordered_keys() {
        let a = br#"{"model":"gpt-4o","messages":[{"role":"user","content":"hi"}]}"#;
        let b = br#"{"messages":[{"content":"hi","role":"user"}],"model":"gpt-4o"}"#;
        assert_eq!(make_key(KEY_A, "gpt-4o", a), make_key(KEY_A, "gpt-4o", b));
    }

    #[test]
    fn key_ignores_stream_and_user() {
        let base = br#"{"model":"gpt-4o","messages":[]}"#;
        let with_stream =
            br#"{"model":"gpt-4o","messages":[],"stream":true,"user":"alice"}"#;
        assert_eq!(
            make_key(KEY_A, "gpt-4o", base),
            make_key(KEY_A, "gpt-4o", with_stream)
        );
    }

    #[test]
    fn key_differs_across_models() {
        let body = br#"{"messages":[]}"#;
        assert_ne!(
            make_key(KEY_A, "gpt-4o", body),
            make_key(KEY_A, "gpt-4o-mini", body)
        );
    }

    #[test]
    fn key_differs_across_api_keys() {
        // Same model, same body, different api_key_id MUST hash differently —
        // otherwise user B could be served user A's cached response.
        let body = br#"{"messages":[{"role":"user","content":"hi"}]}"#;
        assert_ne!(
            make_key(KEY_A, "gpt-4o", body),
            make_key(KEY_B, "gpt-4o", body)
        );
    }

    #[test]
    fn non_json_body_still_hashes() {
        let k1 = make_key(KEY_A, "m", b"plain text");
        let k2 = make_key(KEY_A, "m", b"plain text");
        assert_eq!(k1, k2);
        assert!(!k1.is_empty());
    }
}
