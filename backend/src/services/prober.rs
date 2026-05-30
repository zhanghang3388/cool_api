//! Background liveness prober.
//!
//! When admins enable probing (see [`repo::system_settings::ProbeConfig`]),
//! this task walks the configured targets every `interval_minutes`, sends a
//! real `max_tokens: 1` completion against each target's model, and records the
//! outcome in `channel_probes`. The config is re-read at the top of every cycle
//! so toggles and target edits take effect without a restart.
//!
//! These probes bypass the billing / request-log pipeline entirely — they are
//! synthetic health checks, not user traffic.

use std::time::Duration;

use crate::repo;
use crate::repo::system_settings::ProbeTarget;
use crate::upstream;
use crate::AppState;

/// Smallest cycle cadence. The loop wakes this often to pick up config changes
/// even when probing is disabled; actual probing only runs when the configured
/// interval has elapsed.
const TICK: Duration = Duration::from_secs(30);

pub fn spawn(state: AppState) {
    tokio::spawn(async move {
        run(state).await;
    });
}

async fn run(state: AppState) {
    let mut last_run: Option<std::time::Instant> = None;

    loop {
        tokio::time::sleep(TICK).await;

        let cfg = match repo::system_settings::get_probe_config(&state.db).await {
            Ok(c) => c,
            Err(e) => {
                tracing::warn!("prober: failed to load config: {e}");
                continue;
            }
        };

        if !cfg.enabled || cfg.targets.is_empty() {
            last_run = None;
            continue;
        }

        let interval = Duration::from_secs((cfg.interval_minutes.max(1) as u64) * 60);
        let due = match last_run {
            None => true,
            Some(t) => t.elapsed() >= interval,
        };
        if !due {
            continue;
        }
        last_run = Some(std::time::Instant::now());

        tracing::debug!("prober: probing {} target(s)", cfg.targets.len());
        for target in &cfg.targets {
            if let Err(e) = probe_one(&state, target).await {
                tracing::warn!(
                    "prober: target channel={} model={} errored: {e}",
                    target.channel_id,
                    target.model
                );
            }
        }

        if let Err(e) = repo::channel_probes::prune(&state.db, cfg.retention_days).await {
            tracing::warn!("prober: prune failed: {e}");
        }
    }
}

async fn probe_one(state: &AppState, target: &ProbeTarget) -> anyhow::Result<()> {
    let channel = repo::channels::get(&state.db, target.channel_id).await?;

    // Skip disabled channels but record an "unknown"-ish failed probe so the
    // UI reflects that the target isn't being served. We treat it as a probe
    // failure with a clear detail rather than silently dropping it.
    if !channel.enabled {
        repo::channel_probes::insert(
            &state.db,
            &repo::channel_probes::NewProbe {
                channel_id: target.channel_id,
                group_id: target.group_id,
                model: &target.model,
                ok: false,
                latency_ms: 0,
                status_code: None,
                detail: "channel disabled",
            },
        )
        .await?;
        return Ok(());
    }

    let api_key = state.cipher.decrypt(&channel.api_key_encrypted)?;
    let adapter = upstream::adapter_for(channel.provider);
    let report = adapter
        .probe_model(&state.http, &channel.base_url, &api_key, &target.model)
        .await?;

    repo::channel_probes::insert(
        &state.db,
        &repo::channel_probes::NewProbe {
            channel_id: target.channel_id,
            group_id: target.group_id,
            model: &target.model,
            ok: report.ok,
            latency_ms: report.latency_ms,
            status_code: report.status_code,
            detail: &report.detail,
        },
    )
    .await?;

    Ok(())
}
