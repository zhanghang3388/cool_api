//! Channel routing: pick the best channel for a model + user group.
//!
//! Behavior:
//! - Filter to channels that are enabled, status in {active, warning}, and list
//!   the requested model in `allowed_models` (or have an empty list = wildcard).
//! - Restrict to the requested provider (phase 4 is same-protocol forwarding).
//! - Restrict by `allowed_group_ids` (empty = open to all groups).
//! - Group candidates by `priority` (lower wins), apply weighted random pick
//!   within a priority. If a call fails, fall back to the next priority.

use rand::Rng;
use sqlx::PgPool;

use crate::error::{AppError, AppResult};
use crate::models::{Channel, ChannelProvider};

/// Plan = the ordered list of candidate channels the handler should try.
pub struct RoutePlan {
    pub candidates: Vec<Channel>,
}

pub async fn plan(
    pool: &PgPool,
    provider: ChannelProvider,
    model_name: &str,
    group_id: i64,
) -> AppResult<RoutePlan> {
    let all = sqlx::query_as::<_, Channel>(
        "SELECT id, name, provider, base_url, api_key_encrypted, priority, weight, \
                enabled, status, allowed_models, allowed_group_ids, balance_cents, \
                last_test_at, last_error, created_at, updated_at \
         FROM channels \
         WHERE enabled = TRUE AND provider = $1 AND status IN ('active','warning') \
         ORDER BY priority ASC, id ASC",
    )
    .bind(provider)
    .fetch_all(pool)
    .await?;

    let candidates: Vec<Channel> = all
        .into_iter()
        .filter(|c| model_allowed(c, model_name) && group_allowed(c, group_id))
        .collect();

    if candidates.is_empty() {
        return Err(AppError::NoAvailableChannel(model_name.to_string()));
    }

    Ok(RoutePlan {
        candidates: weighted_order_by_priority(candidates),
    })
}

fn model_allowed(c: &Channel, model: &str) -> bool {
    c.allowed_models.is_empty() || c.allowed_models.iter().any(|m| m == model)
}

fn group_allowed(c: &Channel, group_id: i64) -> bool {
    c.allowed_group_ids.is_empty() || c.allowed_group_ids.contains(&group_id)
}

/// Within each priority tier, pick a weighted-random order; concatenate tiers.
fn weighted_order_by_priority(mut channels: Vec<Channel>) -> Vec<Channel> {
    channels.sort_by_key(|c| c.priority);

    let mut out = Vec::with_capacity(channels.len());
    let mut tier: Vec<Channel> = Vec::new();
    let mut current_priority: Option<i32> = None;

    for ch in channels {
        match current_priority {
            Some(p) if p == ch.priority => tier.push(ch),
            _ => {
                if !tier.is_empty() {
                    out.extend(weighted_random_order(std::mem::take(&mut tier)));
                }
                current_priority = Some(ch.priority);
                tier.push(ch);
            }
        }
    }
    if !tier.is_empty() {
        out.extend(weighted_random_order(tier));
    }
    out
}

fn weighted_random_order(mut tier: Vec<Channel>) -> Vec<Channel> {
    let mut rng = rand::thread_rng();
    let mut out = Vec::with_capacity(tier.len());
    while !tier.is_empty() {
        let total: i64 = tier.iter().map(|c| (c.weight.max(1)) as i64).sum();
        let mut roll = rng.gen_range(0..total);
        let mut idx = 0;
        for (i, c) in tier.iter().enumerate() {
            let w = c.weight.max(1) as i64;
            if roll < w {
                idx = i;
                break;
            }
            roll -= w;
        }
        out.push(tier.swap_remove(idx));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;

    fn mk(id: i64, priority: i32, weight: i32, allowed_models: &[&str]) -> Channel {
        Channel {
            id,
            name: format!("ch{id}"),
            provider: ChannelProvider::Openai,
            base_url: String::new(),
            api_key_encrypted: String::new(),
            priority,
            weight,
            enabled: true,
            status: crate::models::ChannelStatus::Active,
            allowed_models: allowed_models.iter().map(|s| (*s).to_string()).collect(),
            allowed_group_ids: vec![],
            balance_cents: None,
            last_test_at: None,
            last_error: None,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }
    }

    #[test]
    fn model_allow_wildcard() {
        let c = mk(1, 0, 1, &[]);
        assert!(model_allowed(&c, "gpt-4o"));
    }

    #[test]
    fn model_allow_specific() {
        let c = mk(1, 0, 1, &["gpt-4o"]);
        assert!(model_allowed(&c, "gpt-4o"));
        assert!(!model_allowed(&c, "gpt-4o-mini"));
    }

    #[test]
    fn priority_tiers_preserved() {
        let channels = vec![
            mk(1, 10, 1, &[]),
            mk(2, 0, 1, &[]),
            mk(3, 0, 1, &[]),
            mk(4, 5, 1, &[]),
        ];
        let ordered = weighted_order_by_priority(channels);
        let priorities: Vec<i32> = ordered.iter().map(|c| c.priority).collect();
        // priority 0 tier first, then 5, then 10
        assert_eq!(priorities[0], 0);
        assert_eq!(priorities[1], 0);
        assert_eq!(priorities[2], 5);
        assert_eq!(priorities[3], 10);
    }
}
