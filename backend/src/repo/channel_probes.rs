//! Active liveness-probe history (`channel_probes`).
//!
//! Rows are written by the background prober (`services::prober`), one per
//! probe attempt against a `(channel, model)` target. The request-forwarding
//! path never touches this table — these are synthetic `max_tokens: 1`
//! requests, not billed traffic.

use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::PgPool;
use std::collections::HashMap;

use crate::error::AppResult;
use crate::models::ChannelProvider;
use crate::repo::system_settings::ProbeTarget;

/// Number of timeline buckets, matching the user dashboard sparkline.
pub const PROBE_BUCKET_COUNT: i32 = 30;

/// A single probe result to persist.
pub struct NewProbe<'a> {
    pub channel_id: i64,
    pub group_id: Option<i64>,
    pub model: &'a str,
    pub ok: bool,
    pub latency_ms: i32,
    pub status_code: Option<i32>,
    pub detail: &'a str,
}

pub async fn insert(pool: &PgPool, p: &NewProbe<'_>) -> AppResult<()> {
    sqlx::query(
        "INSERT INTO channel_probes \
            (channel_id, group_id, model, ok, latency_ms, status_code, detail) \
         VALUES ($1, $2, $3, $4, $5, $6, $7)",
    )
    .bind(p.channel_id)
    .bind(p.group_id)
    .bind(p.model)
    .bind(p.ok)
    .bind(p.latency_ms)
    .bind(p.status_code)
    .bind(p.detail)
    .execute(pool)
    .await?;
    Ok(())
}

/// Drop probe rows older than `retention_days`. Keeps the table bounded.
pub async fn prune(pool: &PgPool, retention_days: i64) -> AppResult<u64> {
    let res = sqlx::query(
        "DELETE FROM channel_probes \
         WHERE checked_at < NOW() - ($1::BIGINT * INTERVAL '1 day')",
    )
    .bind(retention_days.max(1))
    .execute(pool)
    .await?;
    Ok(res.rows_affected())
}

#[derive(Debug, Serialize, Clone)]
pub struct ProbeBucket {
    pub idx: i32,
    pub total: i64,
    pub error: i64,
}

/// Admin-facing view of one configured probe target.
#[derive(Debug, Serialize)]
pub struct ProbeTargetView {
    pub channel_id: i64,
    pub channel_name: String,
    pub provider: ChannelProvider,
    pub group_id: Option<i64>,
    pub group_label: Option<String>,
    pub model: String,
    /// `operational` | `degraded` | `failed` | `unknown`
    pub status: &'static str,
    pub total: i64,
    pub ok_count: i64,
    /// 0..=100, null when there were no probes in the window.
    pub availability: Option<f64>,
    pub latest_ok: Option<bool>,
    pub latest_latency_ms: Option<i32>,
    pub avg_latency_ms: Option<i64>,
    pub last_checked_at: Option<DateTime<Utc>>,
    pub last_detail: Option<String>,
    pub buckets: Vec<ProbeBucket>,
    pub bucket_count: i32,
}

/// One raw probe row, only the fields used during in-Rust aggregation.
struct RawProbe {
    ok: bool,
    latency_ms: i32,
    detail: String,
    checked_at: DateTime<Utc>,
}

/// Build the admin monitor view for the configured `targets` over the trailing
/// `minutes`. Targets with no probes in the window still appear (as `unknown`)
/// so the admin can see that a freshly-configured target hasn't run yet.
pub async fn monitor_view(
    pool: &PgPool,
    targets: &[ProbeTarget],
    minutes: i32,
) -> AppResult<Vec<ProbeTargetView>> {
    if targets.is_empty() {
        return Ok(Vec::new());
    }

    let channel_ids: Vec<i64> = {
        let mut v: Vec<i64> = targets.iter().map(|t| t.channel_id).collect();
        v.sort_unstable();
        v.dedup();
        v
    };

    // Channel metadata for labelling.
    let chan_rows: Vec<(i64, String, ChannelProvider)> = sqlx::query_as(
        "SELECT id, name, provider FROM channels WHERE id = ANY($1::BIGINT[])",
    )
    .bind(&channel_ids)
    .fetch_all(pool)
    .await?;
    let chan_meta: HashMap<i64, (String, ChannelProvider)> = chan_rows
        .into_iter()
        .map(|(id, name, provider)| (id, (name, provider)))
        .collect();

    // Group labels for any group_ids referenced by the targets.
    let group_ids: Vec<i64> = {
        let mut v: Vec<i64> = targets.iter().filter_map(|t| t.group_id).collect();
        v.sort_unstable();
        v.dedup();
        v
    };
    let group_labels: HashMap<i64, String> = if group_ids.is_empty() {
        HashMap::new()
    } else {
        let rows: Vec<(i64, String)> =
            sqlx::query_as("SELECT id, label FROM groups WHERE id = ANY($1::BIGINT[])")
                .bind(&group_ids)
                .fetch_all(pool)
                .await?;
        rows.into_iter().collect()
    };

    // All probes in the window for the referenced channels, oldest first.
    let raw: Vec<(i64, String, bool, i32, String, DateTime<Utc>)> = sqlx::query_as(
        "SELECT channel_id, model, ok, latency_ms, detail, checked_at \
         FROM channel_probes \
         WHERE channel_id = ANY($1::BIGINT[]) \
           AND checked_at >= NOW() - ($2::INT * INTERVAL '1 minute') \
         ORDER BY checked_at ASC",
    )
    .bind(&channel_ids)
    .bind(minutes)
    .fetch_all(pool)
    .await?;

    // Bucket probes by (channel_id, model).
    let now = Utc::now();
    let window_start = now - chrono::Duration::minutes(minutes as i64);
    let bucket_span_secs = (minutes as f64 * 60.0) / PROBE_BUCKET_COUNT as f64;

    let mut by_target: HashMap<(i64, String), Vec<RawProbe>> = HashMap::new();
    for (channel_id, model, ok, latency_ms, detail, checked_at) in raw {
        by_target
            .entry((channel_id, model))
            .or_default()
            .push(RawProbe {
                ok,
                latency_ms,
                detail,
                checked_at,
            });
    }

    let mut out = Vec::with_capacity(targets.len());
    for t in targets {
        let (channel_name, provider) = chan_meta
            .get(&t.channel_id)
            .cloned()
            .unwrap_or_else(|| (format!("#{}", t.channel_id), ChannelProvider::Openai));

        let probes = by_target.get(&(t.channel_id, t.model.clone()));

        let mut buckets: Vec<ProbeBucket> = (0..PROBE_BUCKET_COUNT)
            .map(|i| ProbeBucket {
                idx: i,
                total: 0,
                error: 0,
            })
            .collect();

        let (mut total, mut ok_count, mut latency_sum) = (0i64, 0i64, 0i64);
        let (mut latest_ok, mut latest_latency, mut last_checked, mut last_detail) =
            (None, None, None, None);

        if let Some(rows) = probes {
            for r in rows {
                total += 1;
                if r.ok {
                    ok_count += 1;
                }
                latency_sum += r.latency_ms as i64;

                let offset = (r.checked_at - window_start).num_seconds() as f64;
                let mut idx = (offset / bucket_span_secs).floor() as i32;
                if idx < 0 {
                    idx = 0;
                }
                if idx > PROBE_BUCKET_COUNT - 1 {
                    idx = PROBE_BUCKET_COUNT - 1;
                }
                let slot = &mut buckets[idx as usize];
                slot.total += 1;
                if !r.ok {
                    slot.error += 1;
                }

                // rows are ascending, so the last one wins as "latest".
                latest_ok = Some(r.ok);
                latest_latency = Some(r.latency_ms);
                last_checked = Some(r.checked_at);
                last_detail = Some(r.detail.clone());
            }
        }

        let availability = if total > 0 {
            Some((ok_count as f64 / total as f64) * 100.0)
        } else {
            None
        };
        let avg_latency_ms = if total > 0 {
            Some((latency_sum as f64 / total as f64).round() as i64)
        } else {
            None
        };
        let status = match (latest_ok, availability) {
            (None, _) => "unknown",
            (Some(false), _) => "failed",
            (Some(true), Some(a)) if a >= 95.0 => "operational",
            (Some(true), _) => "degraded",
        };

        out.push(ProbeTargetView {
            channel_id: t.channel_id,
            channel_name,
            provider,
            group_id: t.group_id,
            group_label: t.group_id.and_then(|gid| group_labels.get(&gid).cloned()),
            model: t.model.clone(),
            status,
            total,
            ok_count,
            availability,
            latest_ok,
            latest_latency_ms: latest_latency,
            avg_latency_ms,
            last_checked_at: last_checked,
            last_detail,
            buckets,
            bucket_count: PROBE_BUCKET_COUNT,
        });
    }

    Ok(out)
}

/// User-facing liveness, one row per accessible group that has probe data.
/// Status is the worst case across that group's probes in the window.
#[derive(Debug, Serialize)]
pub struct GroupLiveness {
    pub group_id: i64,
    /// `operational` | `degraded` | `failed`
    pub status: &'static str,
    pub availability: f64,
    pub total: i64,
    pub last_checked_at: Option<DateTime<Utc>>,
}

pub async fn group_liveness_for_user(
    pool: &PgPool,
    group_ids: &[i64],
    minutes: i32,
) -> AppResult<Vec<GroupLiveness>> {
    if group_ids.is_empty() {
        return Ok(Vec::new());
    }
    let rows: Vec<(i64, i64, i64, Option<DateTime<Utc>>)> = sqlx::query_as(
        "SELECT group_id, \
            COUNT(*)::BIGINT AS total, \
            COUNT(*) FILTER (WHERE ok)::BIGINT AS ok_count, \
            MAX(checked_at) AS last_checked \
         FROM channel_probes \
         WHERE group_id = ANY($1::BIGINT[]) \
           AND checked_at >= NOW() - ($2::INT * INTERVAL '1 minute') \
         GROUP BY group_id",
    )
    .bind(group_ids)
    .bind(minutes)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|(group_id, total, ok_count, last_checked)| {
            let availability = if total > 0 {
                (ok_count as f64 / total as f64) * 100.0
            } else {
                0.0
            };
            let status = if availability >= 95.0 {
                "operational"
            } else if availability >= 50.0 {
                "degraded"
            } else {
                "failed"
            };
            GroupLiveness {
                group_id,
                status,
                availability,
                total,
                last_checked_at: last_checked,
            }
        })
        .collect())
}
