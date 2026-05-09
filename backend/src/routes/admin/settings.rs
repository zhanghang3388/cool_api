//! Admin settings: site metadata + payment provider config.
//!
//! Both endpoints namespace into `system_settings` via the repo. The payment
//! merchant key is encrypted at rest and never returned to the client — GETs
//! redact it to a "****" placeholder. PATCH accepts a fresh plaintext key or
//! an empty string (keep existing).

use axum::extract::State;
use axum::routing::{get, patch};
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
