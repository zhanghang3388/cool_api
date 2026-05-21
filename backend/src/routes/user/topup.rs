//! User-facing top-up endpoints.
//!
//! Flow (synchronous, online):
//! 1. user picks an amount, client POSTs /user/topup/orders
//! 2. backend creates a `pending` top_up_record with a unique out_trade_no,
//!    signs the epay payload, returns a redirect URL (`submit_url`) plus the
//!    form fields. The client navigates the browser to the provider.
//! 3. provider posts async notify to /payment/epay/notify (public route) —
//!    we verify the sign, credit balance, idempotent by out_trade_no.
//! 4. provider redirects the browser to the user-supplied `return_url` with
//!    query params. The frontend reads `status` and refreshes.

use axum::extract::State;
use axum::routing::{get, post};
use axum::{Json, Router};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::error::{AppError, AppResult};
use crate::models::TopUpStatus;
use crate::repo;
use crate::services::epay;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/info", get(info))
        .route("/orders", post(create_order))
        .route("/records", get(records))
}

#[derive(Debug, Serialize)]
struct TopUpInfo {
    /// preset amounts in cents (keep aligned with the UI)
    presets_cents: Vec<i64>,
    /// minimum amount a user can submit, in cents
    min_amount_cents: i64,
    payment_enabled: bool,
    payment_name: String,
}

async fn info(
    State(state): State<AppState>,
    _auth: AuthUser,
) -> AppResult<Json<TopUpInfo>> {
    let pay = repo::system_settings::get_payment_config(&state.db).await?;
    let enabled = pay.enabled
        && !pay.pid.is_empty()
        && !pay.key_encrypted.is_empty()
        && !pay.api_url.is_empty();
    Ok(Json(TopUpInfo {
        presets_cents: vec![10000, 50000, 100000, 200000, 500000, 1000000],
        min_amount_cents: 10000,
        payment_enabled: enabled,
        payment_name: pay.name,
    }))
}

#[derive(Debug, Deserialize)]
struct CreateOrderRequest {
    amount_cents: i64,
    /// "alipay" | "wxpay" — passed through to epay `type` field
    #[serde(default = "default_pay_type")]
    pay_type: String,
    /// where the provider should redirect the browser after payment
    return_url: String,
    /// the URL the provider should POST the async notify to (caller-supplied
    /// because the gateway host is environment-dependent)
    notify_url: String,
}

fn default_pay_type() -> String {
    "alipay".into()
}

#[derive(Debug, Serialize)]
struct CreateOrderResponse {
    out_trade_no: String,
    /// fully-formed GET URL the browser should navigate to
    submit_url: String,
}

async fn create_order(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<CreateOrderRequest>,
) -> AppResult<Json<CreateOrderResponse>> {
    if body.amount_cents < 10000 {
        return Err(AppError::BadRequest(
            "amount must be >= 1 元 (10000 units)".into(),
        ));
    }
    if body.amount_cents > 100_000_000 {
        return Err(AppError::BadRequest(
            "amount must be <= 10000 元".into(),
        ));
    }
    let pay_type = body.pay_type.trim();
    if pay_type.is_empty() {
        return Err(AppError::BadRequest("pay_type required".into()));
    }
    if body.return_url.trim().is_empty() || body.notify_url.trim().is_empty() {
        return Err(AppError::BadRequest(
            "return_url and notify_url required".into(),
        ));
    }

    let pay = repo::system_settings::get_payment_config(&state.db).await?;
    if !pay.enabled
        || pay.pid.is_empty()
        || pay.key_encrypted.is_empty()
        || pay.api_url.is_empty()
    {
        return Err(AppError::BadRequest(
            "payment is not configured".into(),
        ));
    }
    let merchant_key = state.cipher.decrypt(&pay.key_encrypted)?;

    let out_trade_no = format!("ag{}", Uuid::new_v4().simple());
    repo::top_up_records::create_pending(
        &state.db,
        repo::top_up_records::NewPending {
            user_id: auth.user_id,
            amount_cents: body.amount_cents,
            method: pay_type,
            out_trade_no: &out_trade_no,
        },
    )
    .await?;

    let money = format!("{:.2}", (body.amount_cents as f64) / 10000.0);
    let name = format!("AetherGate 充值 {money} 元");

    let mut params: BTreeMap<String, String> = BTreeMap::new();
    params.insert("pid".into(), pay.pid);
    params.insert("type".into(), pay_type.to_string());
    params.insert("out_trade_no".into(), out_trade_no.clone());
    params.insert("notify_url".into(), body.notify_url);
    params.insert("return_url".into(), body.return_url);
    params.insert("name".into(), name);
    params.insert("money".into(), money);
    let sign = epay::sign(&params, &merchant_key);
    params.insert("sign".into(), sign);
    params.insert("sign_type".into(), "MD5".into());

    // Provider endpoint: /submit.php
    let base = pay.api_url.trim_end_matches('/');
    let query = params
        .iter()
        .map(|(k, v)| format!("{}={}", k, urlencoding::encode(v)))
        .collect::<Vec<_>>()
        .join("&");
    let submit_url = format!("{base}/submit.php?{query}");

    Ok(Json(CreateOrderResponse {
        out_trade_no,
        submit_url,
    }))
}

#[derive(Debug, Serialize)]
struct RecordRow {
    id: i64,
    amount_cents: i64,
    bonus_cents: i64,
    method: String,
    status: TopUpStatus,
    out_trade_no: Option<String>,
    external_txn_id: Option<String>,
    note: String,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

async fn records(
    State(state): State<AppState>,
    auth: AuthUser,
) -> AppResult<Json<Vec<RecordRow>>> {
    let rows = repo::top_up_records::list_by_user(&state.db, auth.user_id, 50).await?;
    Ok(Json(
        rows.into_iter()
            .map(|r| RecordRow {
                id: r.id,
                amount_cents: r.amount_cents,
                bonus_cents: r.bonus_cents,
                method: r.method,
                status: r.status,
                out_trade_no: r.out_trade_no,
                external_txn_id: r.external_txn_id,
                note: r.note,
                created_at: r.created_at,
                updated_at: r.updated_at,
            })
            .collect(),
    ))
}
