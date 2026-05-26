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
use crate::services::{email as email_svc, email_codes};
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/register", post(register))
        .route("/email-code", post(send_email_code))
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

fn validate_email(raw: &str) -> AppResult<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(AppError::BadRequest("邮箱不能为空".into()));
    }
    if trimmed.len() > 254 {
        return Err(AppError::BadRequest("邮箱过长".into()));
    }
    // Cheapest workable check — one '@', non-empty local part, dotted domain.
    let (local, domain) = trimmed
        .split_once('@')
        .ok_or_else(|| AppError::BadRequest("邮箱格式不正确".into()))?;
    if local.is_empty() || !domain.contains('.') {
        return Err(AppError::BadRequest("邮箱格式不正确".into()));
    }
    Ok(trimmed.to_string())
}

#[derive(Debug, Deserialize)]
struct SendEmailCodeRequest {
    email: String,
}

async fn send_email_code(
    State(state): State<AppState>,
    Json(req): Json<SendEmailCodeRequest>,
) -> AppResult<Json<serde_json::Value>> {
    if !registration_enabled(&state).await? {
        return Err(AppError::Forbidden);
    }
    let email = validate_email(&req.email)?;

    // Reject up front if the email is already taken — sending a code in that
    // case lets attackers probe the user table.
    let taken: Option<(i64,)> = sqlx::query_as("SELECT id FROM users WHERE email = $1")
        .bind(&email)
        .fetch_optional(&state.db)
        .await?;
    if taken.is_some() {
        return Err(AppError::Conflict("该邮箱已被注册".into()));
    }

    let mut redis = state.redis.clone().ok_or_else(|| {
        AppError::Internal("redis unavailable; cannot store verification code".into())
    })?;

    let code = email_codes::generate_code();
    email_codes::issue(&mut redis, email_codes::Scene::Register, &email, &code).await?;

    let site = crate::repo::system_settings::get_site_config(&state.db).await?;
    let html = email_svc::render_register_code(
        &code,
        email_codes::TTL_SECONDS / 60,
        &site.site_name,
    );
    if let Err(e) = email_svc::send_html(&state, &email, "您的注册验证码", &html).await {
        // Roll back the issued code so the user can try again immediately;
        // otherwise the cooldown would lock them out for 60s after a Resend
        // outage they didn't cause.
        let lower = email.to_ascii_lowercase();
        let _ = redis
            .send_packed_command(
                redis::cmd("DEL")
                    .arg(format!("ec:register:{}", lower))
                    .arg(format!("ec:register:{}:cool", lower)),
            )
            .await;
        return Err(e);
    }

    Ok(Json(serde_json::json!({
        "ok": true,
        "ttl_seconds": email_codes::TTL_SECONDS,
        "cooldown_seconds": email_codes::COOLDOWN_SECONDS,
    })))
}

#[derive(Debug, Deserialize)]
struct RegisterRequest {
    username: String,
    password: String,
    email: String,
    code: String,
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

    let email = validate_email(&req.email)?;
    let code = req.code.trim();
    if code.is_empty() {
        return Err(AppError::BadRequest("验证码不能为空".into()));
    }

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
    let email_taken: Option<(i64,)> =
        sqlx::query_as("SELECT id FROM users WHERE email = $1")
            .bind(&email)
            .fetch_optional(&state.db)
            .await?;
    if email_taken.is_some() {
        return Err(AppError::Conflict("email already registered".into()));
    }

    let mut redis = state.redis.clone().ok_or_else(|| {
        AppError::Internal("redis unavailable; cannot verify registration code".into())
    })?;
    email_codes::verify(&mut redis, email_codes::Scene::Register, &email, code).await?;

    let hash = password::hash_password(&req.password)?;
    let user = sqlx::query_as::<_, User>(&format!(
        "INSERT INTO users (username, email, password_hash, role, status)
         VALUES ($1, $2, $3, $4, 'active')
         RETURNING {USER_COLUMNS}"
    ))
    .bind(username)
    .bind(&email)
    .bind(&hash)
    .bind(UserRole::User)
    .fetch_one(&state.db)
    .await?;
    // Effective group list is computed dynamically from
    // `system_settings.default_user_groups` ∪ overrides − overrides at lookup
    // time, so we don't need to materialize anything per-user at signup.

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
