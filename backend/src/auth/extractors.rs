use async_trait::async_trait;
use axum::extract::{FromRef, FromRequestParts};
use axum::http::header;
use axum::http::request::Parts;
use bigdecimal::BigDecimal;
use chrono::Utc;
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use crate::auth::jwt::Claims;
use crate::error::AppError;
use crate::models::{User, UserRole, UserStatus};
use crate::repo;
use crate::AppState;

/// Throttle for `last_used_at` writes. Bumping it on every API call would
/// have us spawning a Postgres UPDATE per request — under bursty traffic
/// that drains the pool. One bump per minute per key is enough for the UI.
const TOUCH_INTERVAL: Duration = Duration::from_secs(60);

fn touch_seen() -> &'static Mutex<HashMap<i64, Instant>> {
    static SEEN: OnceLock<Mutex<HashMap<i64, Instant>>> = OnceLock::new();
    SEEN.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Returns true if we should write `last_used_at` for this key now. Stamps
/// the in-memory map either way so concurrent callers cooperate.
fn should_touch(key_id: i64, now: Instant) -> bool {
    let Ok(mut map) = touch_seen().lock() else {
        // Lock poisoning — be conservative and let the caller write.
        return true;
    };
    match map.get(&key_id).copied() {
        Some(prev) if now.duration_since(prev) < TOUCH_INTERVAL => false,
        _ => {
            map.insert(key_id, now);
            true
        }
    }
}

/// Authenticated user (any role). Extractor for routes that allow both
/// normal users and admins.
#[derive(Debug, Clone)]
pub struct AuthUser {
    pub user_id: i64,
    pub role: UserRole,
    #[allow(dead_code)]
    pub claims: Claims,
}

/// Admin-only principal. Rejects non-admins with 403.
#[derive(Debug, Clone)]
pub struct AdminUser(pub AuthUser);

impl AdminUser {
    pub fn user_id(&self) -> i64 {
        self.0.user_id
    }
}

/// Authenticated via an API key (Authorization: Bearer sk-ag-...). Used by
/// forwarding endpoints (/v1/*, /anthropic/*). Carries the full user record
/// plus the pricing group **scoped to the API key** (not the user) so
/// downstream services (router, billing) don't need to re-query.
#[derive(Debug, Clone)]
pub struct ApiUser {
    pub user: User,
    pub group_id: i64,
    pub group_multiplier: BigDecimal,
    pub group_name: String,
    pub api_key_id: i64,
}

/// Parse and verify the `Authorization: Bearer <jwt>` header.
pub(crate) fn parse_claims<S>(parts: &Parts, state: &S) -> Result<Claims, AppError>
where
    AppState: FromRef<S>,
{
    let app_state = AppState::from_ref(state);
    let auth = parts
        .headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .ok_or(AppError::Unauthorized)?;
    let token = auth
        .strip_prefix("Bearer ")
        .ok_or(AppError::Unauthorized)?
        .trim();
    app_state.jwt.verify(token)
}

/// Read the API key from either `Authorization: Bearer <key>` (OpenAI SDK
/// convention) or `x-api-key: <key>` (Anthropic SDK default). Returns an
/// owned String so we don't tie the lifetime to a single header value —
/// the two header lookups can't share one borrow.
fn bearer_token(parts: &Parts) -> Result<String, AppError> {
    if let Some(auth) = parts
        .headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
    {
        if let Some(rest) = auth.strip_prefix("Bearer ") {
            let trimmed = rest.trim();
            if !trimmed.is_empty() {
                return Ok(trimmed.to_string());
            }
        }
    }
    if let Some(key) = parts
        .headers
        .get("x-api-key")
        .and_then(|v| v.to_str().ok())
    {
        let trimmed = key.trim();
        if !trimmed.is_empty() {
            return Ok(trimmed.to_string());
        }
    }
    Err(AppError::Unauthorized)
}

#[async_trait]
impl<S> FromRequestParts<S> for AuthUser
where
    AppState: FromRef<S>,
    S: Send + Sync,
{
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let claims = parse_claims::<S>(parts, state)?;
        Ok(AuthUser {
            user_id: claims.sub,
            role: claims.role,
            claims,
        })
    }
}

#[async_trait]
impl<S> FromRequestParts<S> for AdminUser
where
    AppState: FromRef<S>,
    S: Send + Sync,
{
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let auth = AuthUser::from_request_parts(parts, state).await?;
        if auth.role != UserRole::Admin {
            return Err(AppError::Forbidden);
        }
        Ok(AdminUser(auth))
    }
}

#[async_trait]
impl<S> FromRequestParts<S> for ApiUser
where
    AppState: FromRef<S>,
    S: Send + Sync,
{
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let app_state = AppState::from_ref(state);
        let raw = bearer_token(parts)?;
        if !raw.starts_with("sk-ag-") {
            return Err(AppError::Unauthorized);
        }

        let hash = repo::api_keys::hash_key(&raw);
        let key = repo::api_keys::find_active_by_hash(&app_state.db, &hash)
            .await?
            .ok_or(AppError::Unauthorized)?;

        let user: User = sqlx::query_as(
            "SELECT id, username, email, password_hash, role, status, \
                    balance_cents, total_used_cents, created_at, last_login_at \
             FROM users WHERE id = $1",
        )
        .bind(key.user_id)
        .fetch_optional(&app_state.db)
        .await?
        .ok_or(AppError::Unauthorized)?;

        let (multiplier, group_name): (BigDecimal, String) =
            sqlx::query_as("SELECT multiplier, name FROM groups WHERE id = $1")
                .bind(key.group_id)
                .fetch_one(&app_state.db)
                .await?;

        if user.status != UserStatus::Active {
            return Err(AppError::Forbidden);
        }

        // Runtime group enforcement: even though the token was created with a
        // valid group, admin may have revoked the user's access to that group
        // afterwards. Admins bypass.
        if user.role != UserRole::Admin {
            let effective =
                repo::user_groups::effective_group_ids(&app_state.db, user.id, user.role).await?;
            if !effective.contains(&key.group_id) {
                return Err(AppError::Forbidden);
            }
        }

        // Fire-and-forget: bump last_used_at. Throttled so we don't spawn
        // a DB write on every single request — the UI only needs minute
        // resolution.
        if should_touch(key.id, Instant::now()) {
            let pool = app_state.db.clone();
            let key_id = key.id;
            tokio::spawn(async move {
                let _ = repo::api_keys::touch_last_used(&pool, key_id, Utc::now()).await;
            });
        }

        Ok(ApiUser {
            user,
            group_id: key.group_id,
            group_multiplier: multiplier,
            group_name,
            api_key_id: key.id,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::should_touch;
    use std::time::{Duration, Instant};

    #[test]
    fn first_call_writes_then_throttles() {
        // Use unlikely IDs so we don't collide with anything else in the
        // process-wide map (the function intentionally shares state).
        let key_id = i64::MAX - 7;
        let t0 = Instant::now();
        assert!(should_touch(key_id, t0));
        // Same instant — within the throttle window, must NOT write again.
        assert!(!should_touch(key_id, t0));
        // Still inside the window.
        assert!(!should_touch(key_id, t0 + Duration::from_secs(30)));
        // Past the window — write again.
        assert!(should_touch(key_id, t0 + Duration::from_secs(120)));
    }

    #[test]
    fn different_keys_dont_block_each_other() {
        let a = i64::MAX - 11;
        let b = i64::MAX - 12;
        let t0 = Instant::now();
        assert!(should_touch(a, t0));
        assert!(should_touch(b, t0));
    }
}
