use axum::{
    extract::State,
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;

use crate::auth::password;
use crate::auth::middleware::CurrentUser;
use crate::error::AppError;
use crate::models::user::User;

pub fn router(pool: PgPool) -> Router {
    Router::new()
        .route("/", get(get_profile).patch(update_profile))
        .route("/password", axum::routing::patch(update_password))
        .route("/referrals", get(get_referrals))
        .with_state(pool)
}

async fn get_profile(
    user: CurrentUser,
    State(pool): State<PgPool>,
) -> Result<Json<User>, AppError> {
    let u = User::find_by_id(&pool, user.id)
        .await?
        .ok_or_else(|| AppError::NotFound("User not found".into()))?;
    Ok(Json(u))
}

#[derive(Debug, Deserialize)]
struct UpdateProfileRequest {
    display_name: Option<String>,
    current_password: String,
}

#[derive(Debug, Deserialize)]
struct UpdatePasswordRequest {
    current_password: String,
    new_password: String,
}

#[derive(Debug, Serialize)]
struct ReferralStats {
    referral_code: String,
    referral_count: i64,
}

async fn get_referrals(
    user: CurrentUser,
    State(pool): State<PgPool>,
) -> Result<Json<ReferralStats>, AppError> {
    let count = User::count_referrals(&pool, user.id).await?;
    Ok(Json(ReferralStats {
        referral_code: user.id.to_string(),
        referral_count: count,
    }))
}

async fn update_profile(
    user: CurrentUser,
    State(pool): State<PgPool>,
    Json(req): Json<UpdateProfileRequest>,
) -> Result<Json<User>, AppError> {
    let current_user = User::find_by_id(&pool, user.id)
        .await?
        .ok_or_else(|| AppError::NotFound("User not found".into()))?;
    verify_current_password(&req.current_password, &current_user.password_hash)?;

    let display_name = normalize_display_name(req.display_name)?;
    let updated = User::update_profile(&pool, user.id, display_name.as_deref()).await?;
    Ok(Json(updated))
}

async fn update_password(
    user: CurrentUser,
    State(pool): State<PgPool>,
    Json(req): Json<UpdatePasswordRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let current_user = User::find_by_id(&pool, user.id)
        .await?
        .ok_or_else(|| AppError::NotFound("User not found".into()))?;
    verify_current_password(&req.current_password, &current_user.password_hash)?;
    validate_new_password(&req.new_password)?;

    let hash = password::hash_password(&req.new_password)
        .map_err(|e| AppError::Internal(e.to_string()))?;
    User::update_password_hash(&pool, user.id, &hash).await?;

    Ok(Json(serde_json::json!({ "ok": true })))
}

fn verify_current_password(input: &str, hash: &str) -> Result<(), AppError> {
    let valid = password::verify_password(input, hash)
        .map_err(|e| AppError::Internal(e.to_string()))?;
    if !valid {
        return Err(AppError::Unauthorized("Current password is incorrect".into()));
    }
    Ok(())
}

fn normalize_display_name(value: Option<String>) -> Result<Option<String>, AppError> {
    let Some(value) = value else {
        return Ok(None);
    };
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    if trimmed.chars().count() > 64 {
        return Err(AppError::BadRequest(
            "Display name must be 64 characters or fewer".into(),
        ));
    }
    Ok(Some(trimmed.to_owned()))
}

fn validate_new_password(password: &str) -> Result<(), AppError> {
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
