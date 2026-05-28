//! Public (unauthenticated) endpoints.

use std::collections::HashSet;

use axum::extract::State;
use axum::routing::get;
use axum::{Json, Router};
use bigdecimal::BigDecimal;
use serde::Serialize;

use crate::error::AppResult;
use crate::models::ChannelProvider;
use crate::repo;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/site", get(site))
        .route("/pricing-showcase", get(pricing_showcase))
}

/// Site metadata for the login/register pages. Anything sensitive stays in
/// admin-only endpoints.
async fn site(
    State(state): State<AppState>,
) -> AppResult<Json<repo::system_settings::SiteConfig>> {
    Ok(Json(
        repo::system_settings::get_site_config(&state.db).await?,
    ))
}

#[derive(Debug, Serialize)]
struct ShowcaseGroup {
    id: i64,
    name: String,
    label: String,
    multiplier: BigDecimal,
    /// Models priced under this group (always the provider's full enabled
    /// list — duplicated here per group so the frontend stays dumb).
    models: Vec<ShowcaseModel>,
}

#[derive(Debug, Clone, Serialize)]
struct ShowcaseModel {
    name: String,
    provider: String,
    /// "Official" base prices stored on the model row. Frontend treats these
    /// as 官网价 (= base × 1.0).
    input_price_cents: i64,
    output_price_cents: i64,
    cache_read_price_cents: Option<i64>,
    cache_write_price_cents: Option<i64>,
}

#[derive(Debug, Serialize)]
struct ShowcaseSection {
    /// `openai` | `anthropic` — frontend uses this to label the section.
    provider: ChannelProvider,
    /// One entry per admin-picked group still resolvable and enabled, in the
    /// admin's chosen display order.
    groups: Vec<ShowcaseGroup>,
}

#[derive(Debug, Serialize)]
struct PricingShowcase {
    /// One entry per provider with at least one valid showcase group. Empty
    /// list = nothing to show, frontend hides the whole pricing section.
    sections: Vec<ShowcaseSection>,
}

/// Public price catalog used on the landing page. Returns one section per
/// provider that the admin has picked groups for, each carrying every still-
/// valid group with its own multiplier + a pre-filtered model list.
async fn pricing_showcase(
    State(state): State<AppState>,
) -> AppResult<Json<PricingShowcase>> {
    let cfg = repo::system_settings::get_landing_pricing_groups(&state.db).await?;
    let all_models = repo::models::list(&state.db).await?;
    let all_channels = repo::channels::list(&state.db).await?;

    let mut sections = Vec::new();
    for provider in [ChannelProvider::Openai, ChannelProvider::Anthropic] {
        let ids = cfg.get(provider);
        if ids.is_empty() {
            continue;
        }
        let provider_name = match provider {
            ChannelProvider::Openai => "openai",
            ChannelProvider::Anthropic => "anthropic",
        };
        let provider_models: Vec<ShowcaseModel> = all_models
            .iter()
            .filter(|m| m.enabled && m.provider.eq_ignore_ascii_case(provider_name))
            .map(|m| ShowcaseModel {
                name: m.name.clone(),
                provider: m.provider.clone(),
                input_price_cents: m.input_price_cents,
                output_price_cents: m.output_price_cents,
                cache_read_price_cents: m.cache_read_price_cents,
                cache_write_price_cents: m.cache_write_price_cents,
            })
            .collect();
        if provider_models.is_empty() {
            continue;
        }

        // Channels eligible to serve this provider's traffic — disabled and
        // hard-down channels would never be picked by the router, so they
        // shouldn't grant pricing visibility either.
        let provider_channels: Vec<_> = all_channels
            .iter()
            .filter(|c| {
                c.provider == provider
                    && c.enabled
                    && !matches!(c.status, crate::models::ChannelStatus::Disabled)
            })
            .collect();

        let mut groups = Vec::new();
        for &gid in ids {
            // Drop picks that have since been disabled / deleted / reassigned
            // to another provider, rather than leaking stale data.
            let group = match repo::groups::get(&state.db, gid).await {
                Ok(g) if g.enabled && g.provider == provider => g,
                _ => continue,
            };

            // Walk the channels this group can route through and collect the
            // union of their `allowed_models`. An empty `allowed_models` on a
            // reachable channel = wildcard, so the group sees every provider
            // model. Mirrors `services::router::plan`.
            let reachable: Vec<_> = provider_channels
                .iter()
                .filter(|c| {
                    c.allowed_group_ids.is_empty() || c.allowed_group_ids.contains(&group.id)
                })
                .collect();
            let has_wildcard = reachable.iter().any(|c| c.allowed_models.is_empty());
            let allowed: HashSet<&str> = if has_wildcard {
                HashSet::new()
            } else {
                reachable
                    .iter()
                    .flat_map(|c| c.allowed_models.iter().map(String::as_str))
                    .collect()
            };

            let models: Vec<ShowcaseModel> = if has_wildcard {
                provider_models.clone()
            } else {
                provider_models
                    .iter()
                    .filter(|m| allowed.contains(m.name.as_str()))
                    .cloned()
                    .collect()
            };
            if models.is_empty() {
                continue;
            }

            groups.push(ShowcaseGroup {
                id: group.id,
                name: group.name,
                label: group.label,
                multiplier: group.multiplier,
                models,
            });
        }
        if groups.is_empty() {
            continue;
        }
        sections.push(ShowcaseSection { provider, groups });
    }

    Ok(Json(PricingShowcase { sections }))
}
