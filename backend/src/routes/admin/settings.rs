//! Admin settings: site metadata + payment provider config.
//!
//! Both endpoints namespace into `system_settings` via the repo. The payment
//! merchant key is encrypted at rest and never returned to the client — GETs
//! redact it to a "****" placeholder. PATCH accepts a fresh plaintext key or
//! an empty string (keep existing).

use axum::extract::State;
use axum::routing::get;
use axum::{Json, Router};
use serde::{Deserialize, Serialize};

use crate::auth::AdminUser;
use crate::crypto::mask_secret;
use crate::error::{AppError, AppResult};
use crate::repo;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/site", get(get_site).patch(patch_site))
        .route("/payment", get(get_payment).patch(patch_payment))
        .route("/email", get(get_email).patch(patch_email))
        .route(
            "/default-user-groups",
            get(get_default_user_groups).put(put_default_user_groups),
        )
        .route(
            "/landing-pricing-group",
            get(get_landing_pricing).put(put_landing_pricing),
        )
}

async fn get_site(
    State(state): State<AppState>,
    _admin: AdminUser,
) -> AppResult<Json<repo::system_settings::SiteConfig>> {
    Ok(Json(
        repo::system_settings::get_site_config(&state.db).await?,
    ))
}

#[derive(Debug, Deserialize)]
struct PatchSite {
    site_name: Option<String>,
    announcement: Option<String>,
    logo_url: Option<String>,
}

async fn patch_site(
    State(state): State<AppState>,
    _admin: AdminUser,
    Json(body): Json<PatchSite>,
) -> AppResult<Json<repo::system_settings::SiteConfig>> {
    let mut cfg = repo::system_settings::get_site_config(&state.db).await?;
    if let Some(name) = body.site_name {
        if name.trim().is_empty() {
            return Err(AppError::BadRequest("site_name cannot be empty".into()));
        }
        cfg.site_name = name.trim().to_string();
    }
    if let Some(a) = body.announcement {
        cfg.announcement = a;
    }
    if let Some(url) = body.logo_url {
        cfg.logo_url = url.trim().to_string();
    }
    repo::system_settings::update_site_config(&state.db, &cfg).await?;
    Ok(Json(cfg))
}

#[derive(Debug, Serialize)]
struct PaymentView {
    enabled: bool,
    provider: String,
    pid: String,
    /// masked representation of the merchant key (never the real value)
    key_masked: String,
    key_configured: bool,
    api_url: String,
    name: String,
}

fn view(cfg: &repo::system_settings::PaymentConfig, cipher: &crate::crypto::Cipher) -> PaymentView {
    // Try to decrypt so we can show the first/last chars; fall back to a
    // generic "****" if the cipher errors (shouldn't happen in practice).
    let key_masked = if cfg.key_encrypted.is_empty() {
        String::new()
    } else {
        cipher
            .decrypt(&cfg.key_encrypted)
            .map(|k| mask_secret(&k))
            .unwrap_or_else(|_| "****".into())
    };
    PaymentView {
        enabled: cfg.enabled,
        provider: cfg.provider.clone(),
        pid: cfg.pid.clone(),
        key_configured: !cfg.key_encrypted.is_empty(),
        key_masked,
        api_url: cfg.api_url.clone(),
        name: cfg.name.clone(),
    }
}

async fn get_payment(
    State(state): State<AppState>,
    _admin: AdminUser,
) -> AppResult<Json<PaymentView>> {
    let cfg = repo::system_settings::get_payment_config(&state.db).await?;
    Ok(Json(view(&cfg, &state.cipher)))
}

#[derive(Debug, Deserialize)]
struct PatchPayment {
    enabled: Option<bool>,
    provider: Option<String>,
    pid: Option<String>,
    /// plaintext merchant key; empty string = keep existing; None = keep existing
    key: Option<String>,
    api_url: Option<String>,
    name: Option<String>,
}

async fn patch_payment(
    State(state): State<AppState>,
    _admin: AdminUser,
    Json(body): Json<PatchPayment>,
) -> AppResult<Json<PaymentView>> {
    let mut cfg = repo::system_settings::get_payment_config(&state.db).await?;
    if let Some(v) = body.enabled {
        cfg.enabled = v;
    }
    if let Some(v) = body.provider {
        cfg.provider = v.trim().to_string();
    }
    if let Some(v) = body.pid {
        cfg.pid = v.trim().to_string();
    }
    if let Some(k) = body.key {
        let k = k.trim();
        if !k.is_empty() {
            cfg.key_encrypted = state.cipher.encrypt(k)?;
        }
    }
    if let Some(v) = body.api_url {
        cfg.api_url = v.trim().trim_end_matches('/').to_string();
    }
    if let Some(v) = body.name {
        cfg.name = v.trim().to_string();
    }
    repo::system_settings::update_payment_config(&state.db, &cfg).await?;
    Ok(Json(view(&cfg, &state.cipher)))
}

#[derive(Debug, Serialize)]
struct EmailView {
    enabled: bool,
    provider: String,
    key_masked: String,
    key_configured: bool,
    from_email: String,
    from_name: String,
}

fn email_view(
    cfg: &repo::system_settings::EmailConfig,
    cipher: &crate::crypto::Cipher,
) -> EmailView {
    let key_masked = if cfg.api_key_encrypted.is_empty() {
        String::new()
    } else {
        cipher
            .decrypt(&cfg.api_key_encrypted)
            .map(|k| mask_secret(&k))
            .unwrap_or_else(|_| "****".into())
    };
    EmailView {
        enabled: cfg.enabled,
        provider: cfg.provider.clone(),
        key_configured: !cfg.api_key_encrypted.is_empty(),
        key_masked,
        from_email: cfg.from_email.clone(),
        from_name: cfg.from_name.clone(),
    }
}

async fn get_email(
    State(state): State<AppState>,
    _admin: AdminUser,
) -> AppResult<Json<EmailView>> {
    let cfg = repo::system_settings::get_email_config(&state.db).await?;
    Ok(Json(email_view(&cfg, &state.cipher)))
}

#[derive(Debug, Deserialize)]
struct PatchEmail {
    enabled: Option<bool>,
    provider: Option<String>,
    /// plaintext API key; empty string = keep existing; None = keep existing
    api_key: Option<String>,
    from_email: Option<String>,
    from_name: Option<String>,
}

async fn patch_email(
    State(state): State<AppState>,
    _admin: AdminUser,
    Json(body): Json<PatchEmail>,
) -> AppResult<Json<EmailView>> {
    let mut cfg = repo::system_settings::get_email_config(&state.db).await?;
    if let Some(v) = body.enabled {
        cfg.enabled = v;
    }
    if let Some(v) = body.provider {
        let v = v.trim().to_string();
        if v.is_empty() {
            return Err(AppError::BadRequest("provider cannot be empty".into()));
        }
        cfg.provider = v;
    }
    if let Some(k) = body.api_key {
        let k = k.trim();
        if !k.is_empty() {
            cfg.api_key_encrypted = state.cipher.encrypt(k)?;
        }
    }
    if let Some(v) = body.from_email {
        let v = v.trim().to_string();
        // Cheap sanity check — full RFC validation lives in the email
        // provider; this only catches obvious typos before saving.
        if !v.is_empty() && !v.contains('@') {
            return Err(AppError::BadRequest("from_email 看起来不是有效的邮箱".into()));
        }
        cfg.from_email = v;
    }
    if let Some(v) = body.from_name {
        cfg.from_name = v.trim().to_string();
    }
    repo::system_settings::update_email_config(&state.db, &cfg).await?;
    Ok(Json(email_view(&cfg, &state.cipher)))
}

#[derive(Debug, Serialize)]
struct DefaultUserGroupsResponse {
    group_ids: Vec<i64>,
}

#[derive(Debug, Deserialize)]
struct PutDefaultUserGroups {
    group_ids: Vec<i64>,
}

async fn get_default_user_groups(
    State(state): State<AppState>,
    _admin: AdminUser,
) -> AppResult<Json<DefaultUserGroupsResponse>> {
    Ok(Json(DefaultUserGroupsResponse {
        group_ids: repo::user_groups::get_default_user_group_ids(&state.db).await?,
    }))
}

async fn put_default_user_groups(
    State(state): State<AppState>,
    _admin: AdminUser,
    Json(body): Json<PutDefaultUserGroups>,
) -> AppResult<Json<DefaultUserGroupsResponse>> {
    // Validate every id refers to an existing group; we don't enforce
    // `enabled = true` here so admin can pre-stage a disabled group and
    // flip it on later.
    let groups = repo::groups::list(&state.db).await?;
    for id in &body.group_ids {
        if !groups.iter().any(|g| g.id == *id) {
            return Err(AppError::BadRequest(format!(
                "group id {id} does not exist"
            )));
        }
    }
    // De-dup while preserving order so the JSON view is stable.
    let mut seen = std::collections::HashSet::new();
    let cleaned: Vec<i64> = body
        .group_ids
        .into_iter()
        .filter(|id| seen.insert(*id))
        .collect();
    repo::user_groups::set_default_user_group_ids(&state.db, &cleaned).await?;
    Ok(Json(DefaultUserGroupsResponse { group_ids: cleaned }))
}

#[derive(Debug, Serialize, Deserialize)]
struct LandingPricingGroup {
    /// `None` (== `null` in JSON) hides the landing-page pricing section.
    group_id: Option<i64>,
}

async fn get_landing_pricing(
    State(state): State<AppState>,
    _admin: AdminUser,
) -> AppResult<Json<LandingPricingGroup>> {
    let id = repo::system_settings::get_landing_pricing_group_id(&state.db).await?;
    Ok(Json(LandingPricingGroup { group_id: id }))
}

async fn put_landing_pricing(
    State(state): State<AppState>,
    _admin: AdminUser,
    Json(body): Json<LandingPricingGroup>,
) -> AppResult<Json<LandingPricingGroup>> {
    if let Some(gid) = body.group_id {
        // Validate the group exists and is enabled — saving a hidden group
        // would silently break the showcase.
        let g = repo::groups::get(&state.db, gid).await.map_err(|e| match e {
            AppError::NotFound => AppError::BadRequest("group not found".into()),
            other => other,
        })?;
        if !g.enabled {
            return Err(AppError::BadRequest(format!(
                "group '{}' is disabled",
                g.name
            )));
        }
    }
    repo::system_settings::set_landing_pricing_group_id(&state.db, body.group_id).await?;
    Ok(Json(body))
}
