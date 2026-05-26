//! Public payment callback endpoints. These are *not* under /admin or /user —
//! they're hit by the payment provider asynchronously, and by the user's
//! browser on return. No auth header required.

use axum::extract::{Query, State};
use axum::response::Redirect;
use axum::routing::get;
use axum::{Form, Router};
use serde::Deserialize;
use std::collections::BTreeMap;

use crate::error::{AppError, AppResult};
use crate::repo;
use crate::services::epay;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/epay/notify", get(notify_get).post(notify_post))
        .route("/epay/return", get(returned))
}

/// Async notify from the provider. EPay historically uses GET (all params in
/// the query string); some forks send POST with a form body. We accept both by
/// parsing the corresponding transport and then running the same verifier.
async fn notify_get(
    State(state): State<AppState>,
    Query(raw): Query<BTreeMap<String, String>>,
) -> AppResult<&'static str> {
    handle_notify(state, raw).await
}

async fn notify_post(
    State(state): State<AppState>,
    Form(raw): Form<BTreeMap<String, String>>,
) -> AppResult<&'static str> {
    handle_notify(state, raw).await
}

async fn handle_notify(state: AppState, raw: BTreeMap<String, String>) -> AppResult<&'static str> {
    let pay = repo::system_settings::get_payment_config(&state.db).await?;
    if !pay.enabled || pay.key_encrypted.is_empty() {
        return Err(AppError::BadRequest("payment disabled".into()));
    }
    let merchant_key = state.cipher.decrypt(&pay.key_encrypted)?;

    if !epay::verify(&raw, &merchant_key) {
        tracing::warn!(params = ?sanitize_for_log(&raw), "epay notify sign verify failed");
        return Err(AppError::BadRequest("sign mismatch".into()));
    }

    let out_trade_no = raw
        .get("out_trade_no")
        .cloned()
        .ok_or_else(|| AppError::BadRequest("missing out_trade_no".into()))?;
    let trade_status = raw.get("trade_status").map(|s| s.as_str()).unwrap_or("");
    if trade_status != "TRADE_SUCCESS" {
        tracing::info!(%out_trade_no, %trade_status, "non-success notify ignored");
        // Providers retry on non-"success" responses; reply with OK so they
        // stop retrying a status we deliberately didn't act on.
        return Ok("success");
    }

    // Cross-check reported amount against our stored amount — a tampered money
    // field would already fail the sign, but this is cheap extra defense.
    let record = repo::top_up_records::get_by_out_trade_no(&state.db, &out_trade_no).await?;
    let reported_money = raw.get("money").and_then(|s| s.parse::<f64>().ok());
    let reported_units = reported_money.map(|m| (m * 10000.0).round() as i64);
    if reported_units != Some(record.amount_cents) {
        tracing::warn!(%out_trade_no, ?reported_units, expected = record.amount_cents,
            "amount mismatch on epay notify");
        return Err(AppError::BadRequest("amount mismatch".into()));
    }

    let external_txn_id = raw
        .get("trade_no")
        .cloned()
        .unwrap_or_else(|| out_trade_no.clone());
    let flipped =
        repo::top_up_records::mark_success_idempotent(&state.db, &out_trade_no, &external_txn_id)
            .await?;
    if flipped {
        tracing::info!(%out_trade_no, %external_txn_id, "payment credited");
    }

    // EPay spec: reply with literal body "success".
    Ok("success")
}

/// Browser return URL after payment. We don't trust these params (no sign
/// check here — they're for UX only), just forward to the frontend with the
/// relevant flags so it can show a toast.
#[derive(Debug, Deserialize)]
struct ReturnQuery {
    out_trade_no: Option<String>,
    trade_status: Option<String>,
    #[serde(default)]
    dest: Option<String>,
}

async fn returned(Query(q): Query<ReturnQuery>) -> Redirect {
    let base = normalize_return_dest(q.dest);
    let mut url = base;
    let joiner = if url.contains('?') { '&' } else { '?' };
    url.push(joiner);
    url.push_str("status=");
    url.push_str(urlencoding::encode(q.trade_status.as_deref().unwrap_or("unknown")).as_ref());
    if let Some(out) = q.out_trade_no {
        url.push_str("&out_trade_no=");
        url.push_str(urlencoding::encode(&out).as_ref());
    }
    Redirect::to(&url)
}

fn normalize_return_dest(dest: Option<String>) -> String {
    let fallback = "/console/topup".to_string();
    let Some(dest) = dest else {
        return fallback;
    };
    let trimmed = dest.trim();
    if trimmed.starts_with('/')
        && !trimmed.starts_with("//")
        && !trimmed.contains('\\')
        && !trimmed.chars().any(char::is_control)
    {
        trimmed.to_string()
    } else {
        fallback
    }
}

/// Drop `sign` from the map before logging so we don't leak the provider's
/// signature to operators — it's not secret but there's no reason to log it.
fn sanitize_for_log(m: &BTreeMap<String, String>) -> BTreeMap<String, String> {
    m.iter()
        .filter(|(k, _)| k.as_str() != "sign")
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::normalize_return_dest;

    #[test]
    fn return_dest_allows_only_local_paths() {
        assert_eq!(
            normalize_return_dest(Some("/console/topup?tab=orders".into())),
            "/console/topup?tab=orders"
        );
        assert_eq!(
            normalize_return_dest(Some("https://evil.example".into())),
            "/console/topup"
        );
        assert_eq!(
            normalize_return_dest(Some("//evil.example/path".into())),
            "/console/topup"
        );
    }
}
