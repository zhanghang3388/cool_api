use async_trait::async_trait;
use axum::extract::{FromRef, FromRequestParts};
use axum::http::header;
use axum::http::request::Parts;
use bigdecimal::BigDecimal;
use chrono::Utc;

use crate::auth::jwt::Claims;
use crate::error::AppError;
use crate::models::{User, UserRole, UserStatus};
use crate::repo;
use crate::AppState;

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

fn bearer_token(parts: &Parts) -> Result<&str, AppError> {
    let auth = parts
        .headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .ok_or(AppError::Unauthorized)?;
    auth.strip_prefix("Bearer ")
        .map(str::trim)
        .ok_or(AppError::Unauthorized)
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

        let hash = repo::api_keys::hash_key(raw);
        let key = repo::api_keys::find_active_by_hash(&app_state.db, &hash)
            .await?
            .ok_or(AppError::Unauthorized)?;

        let user: User = sqlx::query_as(
            "SELECT id, username, email, password_hash, role, status, group_id, \
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

        // Fire-and-forget: bump last_used_at. Don't fail the request on error.
        let pool = app_state.db.clone();
        let key_id = key.id;
        tokio::spawn(async move {
            let _ = repo::api_keys::touch_last_used(&pool, key_id, Utc::now()).await;
        });

        Ok(ApiUser {
            user,
            group_id: key.group_id,
            group_multiplier: multiplier,
            group_name,
            api_key_id: key.id,
        })
    }
}
