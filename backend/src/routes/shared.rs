//! Shared DTOs and helpers used by both admin and user routes.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::auth::password;
use crate::error::{AppError, AppResult};
use crate::models::{User, UserRole, UserStatus};
use crate::AppState;

#[derive(Debug, Serialize)]
pub struct UserInfo {
    pub id: i64,
    pub username: String,
    pub email: Option<String>,
    pub role: UserRole,
    pub status: UserStatus,
    pub balance_cents: i64,
    pub created_at: DateTime<Utc>,
    pub last_login_at: Option<DateTime<Utc>>,
}

impl From<User> for UserInfo {
    fn from(u: User) -> Self {
        Self {
            id: u.id,
            username: u.username,
            email: u.email,
            role: u.role,
            status: u.status,
            balance_cents: u.balance_cents,
            created_at: u.created_at,
            last_login_at: u.last_login_at,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
pub struct LoginResponse {
    pub token: String,
    pub user: UserInfo,
}

pub const USER_COLUMNS: &str =
    "id, username, email, password_hash, role, status, \
     balance_cents, total_used_cents, created_at, last_login_at";

/// Verify credentials, update last_login_at, issue a JWT. Shared by both
/// admin and user login endpoints. `require_admin` rejects non-admin users
/// with 403 — useful for the admin-only login endpoint.
pub async fn authenticate(
    state: &AppState,
    req: &LoginRequest,
    require_admin: bool,
) -> AppResult<LoginResponse> {
    if req.username.trim().is_empty() || req.password.is_empty() {
        return Err(AppError::BadRequest("username and password required".into()));
    }

    let user = sqlx::query_as::<_, User>(&format!(
        "SELECT {USER_COLUMNS} FROM users WHERE username = $1"
    ))
    .bind(req.username.trim())
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::Unauthorized)?;

    if user.status != UserStatus::Active {
        return Err(AppError::Forbidden);
    }

    if require_admin && user.role != UserRole::Admin {
        return Err(AppError::Forbidden);
    }

    if !password::verify_password(&req.password, &user.password_hash)? {
        return Err(AppError::Unauthorized);
    }

    sqlx::query("UPDATE users SET last_login_at = NOW() WHERE id = $1")
        .bind(user.id)
        .execute(&state.db)
        .await?;

    let token = state.jwt.issue(user.id, user.role)?;

    Ok(LoginResponse {
        token,
        user: user.into(),
    })
}

pub async fn fetch_user_info(state: &AppState, user_id: i64) -> AppResult<UserInfo> {
    let user = sqlx::query_as::<_, User>(&format!(
        "SELECT {USER_COLUMNS} FROM users WHERE id = $1"
    ))
    .bind(user_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;
    Ok(user.into())
}
