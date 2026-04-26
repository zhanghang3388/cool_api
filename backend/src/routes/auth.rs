use axum::{Json, Router, extract::State, routing::post};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;

use crate::auth::{jwt, password};
use crate::config::AppConfig;
use crate::error::AppError;
use crate::models::user::{CreateUser, User};

#[derive(Debug, Deserialize)]
pub struct RegisterRequest {
    pub username: String,
    pub email: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct RefreshRequest {
    pub refresh_token: String,
}

#[derive(Debug, Serialize)]
pub struct AuthResponse {
    pub access_token: String,
    pub refresh_token: String,
    pub user: UserInfo,
}

#[derive(Debug, Serialize)]
pub struct UserInfo {
    pub id: uuid::Uuid,
    pub username: String,
    pub email: String,
    pub display_name: Option<String>,
    pub role: String,
    pub balance: i64,
}

impl From<&User> for UserInfo {
    fn from(u: &User) -> Self {
        Self {
            id: u.id,
            username: u.username.clone(),
            email: u.email.clone(),
            display_name: u.display_name.clone(),
            role: u.role.clone(),
            balance: u.balance,
        }
    }
}

pub fn router(pool: PgPool, config: AppConfig) -> Router {
    Router::new()
        .route("/register", post(register))
        .route("/login", post(login))
        .route("/refresh", post(refresh))
        .with_state((pool, config))
}

async fn register(
    State((pool, config)): State<(PgPool, AppConfig)>,
    Json(req): Json<RegisterRequest>,
) -> Result<Json<AuthResponse>, AppError> {
    validate_username(&req.username)?;
    if !is_valid_email(&req.email) {
        return Err(AppError::BadRequest("Invalid email".into()));
    }
    validate_password(&req.password)?;

    if User::find_by_username(&pool, &req.username)
        .await?
        .is_some()
    {
        return Err(AppError::Conflict("Username already taken".into()));
    }
    if User::find_by_email(&pool, &req.email).await?.is_some() {
        return Err(AppError::Conflict("Email already registered".into()));
    }

    let hash =
        password::hash_password(&req.password).map_err(|e| AppError::Internal(e.to_string()))?;

    let user = User::create(
        &pool,
        &CreateUser {
            username: req.username,
            email: req.email,
            password_hash: hash,
            role: None,
        },
    )
    .await?;

    let access_token = jwt::create_access_token(
        user.id,
        &user.role,
        &config.jwt_secret,
        config.jwt_expiry_hours,
    )?;
    let refresh_token = jwt::create_refresh_token(
        user.id,
        &user.role,
        &config.jwt_secret,
        config.jwt_refresh_expiry_days,
    )?;

    Ok(Json(AuthResponse {
        access_token,
        refresh_token,
        user: UserInfo::from(&user),
    }))
}

fn validate_username(username: &str) -> Result<(), AppError> {
    if username.len() < 3 || username.len() > 64 {
        return Err(AppError::BadRequest(
            "Username must be 3-64 characters".into(),
        ));
    }
    if !username
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    {
        return Err(AppError::BadRequest(
            "Username can only contain letters, numbers, underscores, and hyphens".into(),
        ));
    }
    Ok(())
}

fn is_valid_email(email: &str) -> bool {
    if email.len() > 255 || email.contains(char::is_whitespace) {
        return false;
    }
    let Some((local, domain)) = email.split_once('@') else {
        return false;
    };
    !local.is_empty() && domain.contains('.') && !domain.ends_with('.')
}

fn validate_password(password: &str) -> Result<(), AppError> {
    if password.len() < 8 {
        return Err(AppError::BadRequest(
            "Password must be at least 8 characters".into(),
        ));
    }
    if !password.chars().any(|c| c.is_ascii_alphabetic())
        || !password.chars().any(|c| c.is_ascii_digit())
    {
        return Err(AppError::BadRequest(
            "Password must contain both letters and numbers".into(),
        ));
    }
    Ok(())
}

async fn login(
    State((pool, config)): State<(PgPool, AppConfig)>,
    Json(req): Json<LoginRequest>,
) -> Result<Json<AuthResponse>, AppError> {
    let user = User::find_by_username(&pool, &req.username)
        .await?
        .ok_or_else(|| AppError::Unauthorized("Invalid credentials".into()))?;

    if !user.is_active {
        return Err(AppError::Forbidden("Account is disabled".into()));
    }

    let valid = password::verify_password(&req.password, &user.password_hash)
        .map_err(|e| AppError::Internal(e.to_string()))?;

    if !valid {
        return Err(AppError::Unauthorized("Invalid credentials".into()));
    }

    let access_token = jwt::create_access_token(
        user.id,
        &user.role,
        &config.jwt_secret,
        config.jwt_expiry_hours,
    )?;
    let refresh_token = jwt::create_refresh_token(
        user.id,
        &user.role,
        &config.jwt_secret,
        config.jwt_refresh_expiry_days,
    )?;

    Ok(Json(AuthResponse {
        access_token,
        refresh_token,
        user: UserInfo::from(&user),
    }))
}

async fn refresh(
    State((pool, config)): State<(PgPool, AppConfig)>,
    Json(req): Json<RefreshRequest>,
) -> Result<Json<AuthResponse>, AppError> {
    let claims = jwt::verify_token(&req.refresh_token, &config.jwt_secret)?;

    if claims.token_type != "refresh" {
        return Err(AppError::Unauthorized("Invalid token type".into()));
    }

    let user = User::find_by_id(&pool, claims.sub)
        .await?
        .ok_or_else(|| AppError::Unauthorized("User not found".into()))?;

    if !user.is_active {
        return Err(AppError::Forbidden("Account is disabled".into()));
    }

    let access_token = jwt::create_access_token(
        user.id,
        &user.role,
        &config.jwt_secret,
        config.jwt_expiry_hours,
    )?;
    let refresh_token = jwt::create_refresh_token(
        user.id,
        &user.role,
        &config.jwt_secret,
        config.jwt_refresh_expiry_days,
    )?;

    Ok(Json(AuthResponse {
        access_token,
        refresh_token,
        user: UserInfo::from(&user),
    }))
}
