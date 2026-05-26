//! Redis-backed email verification codes for registration / future flows.
//!
//! Layout (per scene):
//!   ec:{scene}:{email}        JSON {code, attempts}, EX = TTL
//!   ec:{scene}:{email}:cool   "1", EX = COOLDOWN — gates resends
//!
//! Flows:
//!   issue   — fail if cooldown key exists; create record + cooldown
//!   verify  — load record; if missing => expired; mismatch increments
//!             attempts; ≥ MAX_ATTEMPTS deletes the record (forces resend)
//!
//! All emails are lowercased before becoming part of the key so casing
//! doesn't bypass throttling.

use rand::Rng;
use redis::aio::ConnectionManager;
use redis::AsyncCommands;
use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

pub const TTL_SECONDS: i64 = 600; // 10 minutes
pub const COOLDOWN_SECONDS: i64 = 60;
pub const MAX_ATTEMPTS: i32 = 5;

#[derive(Debug, Clone, Copy)]
pub enum Scene {
    Register,
}

impl Scene {
    fn as_str(self) -> &'static str {
        match self {
            Scene::Register => "register",
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
struct Record {
    code: String,
    attempts: i32,
}

fn key(scene: Scene, email: &str) -> String {
    format!("ec:{}:{}", scene.as_str(), email.to_ascii_lowercase())
}

fn cooldown_key(scene: Scene, email: &str) -> String {
    format!("{}:cool", key(scene, email))
}

pub fn generate_code() -> String {
    let n: u32 = rand::thread_rng().gen_range(0..1_000_000);
    format!("{:06}", n)
}

/// Persist a freshly minted code, refusing if a cooldown is still active
/// (the SET NX dance is the rate-limit). Returns the cooldown remainder
/// when it refuses so callers can include a friendly hint.
pub async fn issue(
    redis: &mut ConnectionManager,
    scene: Scene,
    email: &str,
    code: &str,
) -> AppResult<()> {
    let cool = cooldown_key(scene, email);
    // SET key 1 EX cooldown NX — atomically claim the cooldown slot.
    let claimed: Option<String> = redis::cmd("SET")
        .arg(&cool)
        .arg("1")
        .arg("EX")
        .arg(COOLDOWN_SECONDS)
        .arg("NX")
        .query_async(redis)
        .await?;
    if claimed.is_none() {
        let ttl: i64 = redis.ttl(&cool).await.unwrap_or(0);
        let secs = if ttl > 0 { ttl } else { COOLDOWN_SECONDS };
        return Err(AppError::BadRequest(format!(
            "请等待 {secs} 秒后再试"
        )));
    }

    let record = Record {
        code: code.to_string(),
        attempts: 0,
    };
    let payload =
        serde_json::to_string(&record).map_err(|e| AppError::Internal(e.to_string()))?;
    let _: () = redis
        .set_ex(key(scene, email), payload, TTL_SECONDS as u64)
        .await?;
    Ok(())
}

/// Returns Ok(()) on a correct, unexpired code (and deletes the record).
/// Mismatch / missing / exhausted-attempts all map to BadRequest with a
/// translated reason so the route layer doesn't need to.
pub async fn verify(
    redis: &mut ConnectionManager,
    scene: Scene,
    email: &str,
    code: &str,
) -> AppResult<()> {
    let k = key(scene, email);
    let raw: Option<String> = redis.get(&k).await?;
    let raw = raw
        .ok_or_else(|| AppError::BadRequest("验证码已过期，请重新获取".into()))?;
    let mut record: Record = serde_json::from_str(&raw)
        .map_err(|e| AppError::Internal(format!("decode email code: {e}")))?;

    if record.code == code {
        // Single-use — drop the record so a leaked code can't be replayed.
        let _: () = redis.del(&k).await?;
        return Ok(());
    }

    record.attempts += 1;
    if record.attempts >= MAX_ATTEMPTS {
        let _: () = redis.del(&k).await?;
        return Err(AppError::BadRequest(
            "验证码错误次数过多，请重新获取".into(),
        ));
    }
    let payload =
        serde_json::to_string(&record).map_err(|e| AppError::Internal(e.to_string()))?;
    // Preserve remaining TTL — TTL of -1 (no expiry) shouldn't happen but
    // we re-arm with the original window if it does, which is the safer drift.
    let ttl: i64 = redis.ttl(&k).await.unwrap_or(TTL_SECONDS);
    let ex = if ttl > 0 { ttl as u64 } else { TTL_SECONDS as u64 };
    let _: () = redis.set_ex(&k, payload, ex).await?;
    Err(AppError::BadRequest("验证码不正确".into()))
}
