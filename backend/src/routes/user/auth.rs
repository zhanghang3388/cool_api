use axum::extract::State;
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;

use crate::auth::{password, AuthUser};
use crate::error::{AppError, AppResult};
use crate::models::{User, UserRole, UserStatus};
use crate::routes::shared::{
    authenticate, fetch_user_info, LoginRequest, LoginResponse, UserInfo, USER_COLUMNS,
};
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/register", post(register))
        .route("/login", post(login))
        .route("/me", get(me).patch(update_me))
}

const REGISTRATION_SETTING_KEY: &str = "registration_enabled";

async fn registration_enabled(state: &AppState) -> AppResult<bool> {
    // default = true, stored as JSON boolean under `registration_enabled`
    let row: Option<(serde_json::Value,)> =
        sqlx::query_as("SELECT value FROM system_settings WHERE key = $1")
            .bind(REGISTRATION_SETTING_KEY)
            .fetch_optional(&state.db)
            .await?;
    Ok(row
        .and_then(|(v,)| v.as_bool())
        .unwrap_or(true))
}

#[derive(Debug, Deserialize)]
struct RegisterRequest {
    username: String,
    password: String,
    #[serde(default)]
    email: Option<String>,
}

async fn register(
    State(state): State<AppState>,
    Json(req): Json<RegisterRequest>,
) -> AppResult<Json<LoginResponse>> {
    if !registration_enabled(&state).await? {
        return Err(AppError::Forbidden);
    }

    let username = req.username.trim();
    if username.len() < 3 || username.len() > 32 {
        return Err(AppError::BadRequest("username length must be 3..=32".into()));
    }
    if !username
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    {
        return Err(AppError::BadRequest(
            "username must be alphanumeric, '-' or '_'".into(),
        ));
    }
    if req.password.len() < 6 {
        return Err(AppError::BadRequest("password must be >= 6 chars".into()));
    }

    let email = req.email.as_deref().map(str::trim).filter(|s| !s.is_empty());

    // Check collisions up front so we can return a friendlier error than a
    // Postgres unique-violation.
    let exists: Option<(i64,)> =
        sqlx::query_as("SELECT id FROM users WHERE username = $1")
            .bind(username)
            .fetch_optional(&state.db)
            .await?;
    if exists.is_some() {
        return Err(AppError::Conflict("username already taken".into()));
    }
    if let Some(e) = email {
        let email_taken: Option<(i64,)> =
            sqlx::query_as("SELECT id FROM users WHERE email = $1")
                .bind(e)
                .fetch_optional(&state.db)
                .await?;
        if email_taken.is_some() {
            return Err(AppError::Conflict("email already registered".into()));
        }
    }

    let default_group_id: i64 =
        sqlx::query_scalar("SELECT id FROM groups WHERE name = 'default'")
            .fetch_one(&state.db)
            .await?;

    let hash = password::hash_password(&req.password)?;
    let user = sqlx::query_as::<_, User>(&format!(
        "INSERT INTO users (username, email, password_hash, role, status, group_id)
         VALUES ($1, $2, $3, $4, 'active', $5)
         RETURNING {USER_COLUMNS}"
    ))
    .bind(username)
    .bind(email)
    .bind(&hash)
    .bind(UserRole::User)
    .bind(default_group_id)
    .fetch_one(&state.db)
    .await?;

    let token = state.jwt.issue(user.id, user.role)?;
    Ok(Json(LoginResponse {
        token,
        user: user.into(),
    }))
}

async fn login(
    State(state): State<AppState>,
    Json(req): Json<LoginRequest>,
) -> AppResult<Json<LoginResponse>> {
    // Unified login: both admins and users use this endpoint.
    let resp = authenticate(&state, &req, false).await?;
    Ok(Json(resp))
}

async fn me(
    State(state): State<AppState>,
    auth: AuthUser,
) -> AppResult<Json<UserInfo>> {
    Ok(Json(fetch_user_info(&state, auth.user_id).await?))
}

#[derive(Debug, Deserialize)]
struct UpdateMeRequest {
    email: Option<String>,
    current_password: Option<String>,
    new_password: Option<String>,
}

async fn update_me(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<UpdateMeRequest>,
) -> AppResult<Json<UserInfo>> {
    // Email update (best-effort, nullable)
    if let Some(email) = body.email.as_deref().map(str::trim) {
        let value = if email.is_empty() { None } else { Some(email) };
        sqlx::query("UPDATE users SET email = $1 WHERE id = $2")
            .bind(value)
            .bind(auth.user_id)
            .execute(&state.db)
            .await
            .map_err(|e| match e {
                sqlx::Error::Database(db) if db.is_unique_violation() => {
                    AppError::Conflict("email already registered".into())
                }
                other => AppError::from(other),
            })?;
    }

    // Password change requires current password.
    if let Some(new_pw) = body.new_password.as_deref() {
        let current = body
            .current_password
            .as_deref()
            .ok_or_else(|| AppError::BadRequest("current_password required".into()))?;
        if new_pw.len() < 6 {
            return Err(AppError::BadRequest("new password must be >= 6 chars".into()));
        }

        let stored: String =
            sqlx::query_scalar("SELECT password_hash FROM users WHERE id = $1")
                .bind(auth.user_id)
                .fetch_one(&state.db)
                .await?;
        if !password::verify_password(current, &stored)? {
            return Err(AppError::Unauthorized);
        }

        let hash = password::hash_password(new_pw)?;
        sqlx::query("UPDATE users SET password_hash = $1 WHERE id = $2")
            .bind(&hash)
            .bind(auth.user_id)
            .execute(&state.db)
            .await?;
    }

    Ok(Json(fetch_user_info(&state, auth.user_id).await?))
}

// Prevent an unused-import warning when UserStatus is only referenced via
// transitively-used types.
#[allow(dead_code)]
const _: Option<UserStatus> = None;
