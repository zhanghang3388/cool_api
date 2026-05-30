//! Admin liveness-probe monitor: read aggregated probe status for the
//! configured targets, and trigger an on-demand probe cycle.

use axum::extract::{Query, State};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};

use crate::auth::AdminUser;
use crate::error::AppResult;
use crate::repo;
use crate::upstream;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/monitor", get(monitor))
        .route("/run", post(run_now))
}

#[derive(Debug, Deserialize)]
struct MonitorQuery {
    /// Look-back window in minutes (clamped 5..=1440). Defaults to 60.
    minutes: Option<i32>,
}

#[derive(Debug, Serialize)]
struct MonitorResponse {
    enabled: bool,
    interval_minutes: i64,
    targets: Vec<repo::channel_probes::ProbeTargetView>,
}

async fn monitor(
    State(state): State<AppState>,
    _admin: AdminUser,
    Query(q): Query<MonitorQuery>,
) -> AppResult<Json<MonitorResponse>> {
    let minutes = q.minutes.unwrap_or(60).clamp(5, 1440);
    let cfg = repo::system_settings::get_probe_config(&state.db).await?;
    let targets = repo::channel_probes::monitor_view(&state.db, &cfg.targets, minutes).await?;
    Ok(Json(MonitorResponse {
        enabled: cfg.enabled,
        interval_minutes: cfg.interval_minutes,
        targets,
    }))
}

#[derive(Debug, Serialize)]
struct RunResponse {
    probed: usize,
}

/// Probe every configured target once, right now, and persist the results.
/// Independent of the `enabled` flag so an admin can test their config before
/// turning the scheduler on.
async fn run_now(
    State(state): State<AppState>,
    _admin: AdminUser,
) -> AppResult<Json<RunResponse>> {
    let cfg = repo::system_settings::get_probe_config(&state.db).await?;
    let mut probed = 0usize;

    for target in &cfg.targets {
        let channel = match repo::channels::get(&state.db, target.channel_id).await {
            Ok(c) => c,
            Err(_) => continue,
        };

        let (ok, latency_ms, status_code, detail) = if !channel.enabled {
            (false, 0, None, "channel disabled".to_string())
        } else {
            let api_key = state.cipher.decrypt(&channel.api_key_encrypted)?;
            let adapter = upstream::adapter_for(channel.provider);
            let report = adapter
                .probe_model(&state.http, &channel.base_url, &api_key, &target.model)
                .await?;
            (report.ok, report.latency_ms, report.status_code, report.detail)
        };

        repo::channel_probes::insert(
            &state.db,
            &repo::channel_probes::NewProbe {
                channel_id: target.channel_id,
                group_id: target.group_id,
                model: &target.model,
                ok,
                latency_ms,
                status_code,
                detail: &detail,
            },
        )
        .await?;
        probed += 1;
    }

    Ok(Json(RunResponse { probed }))
}
