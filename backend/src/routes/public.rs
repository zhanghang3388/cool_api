//! Public (unauthenticated) endpoints.

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
}

#[derive(Debug, Serialize)]
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
    group: ShowcaseGroup,
    models: Vec<ShowcaseModel>,
}

#[derive(Debug, Serialize)]
struct PricingShowcase {
    /// One entry per provider whose showcase group has been picked and is
    /// still enabled. Empty list = nothing to show, frontend hides the section.
    sections: Vec<ShowcaseSection>,
}

/// Public price catalog used on the landing page. Returns one section per
/// provider that the admin has picked a (still-enabled) group for. Models in
/// each section are filtered to that provider so the multiplier always matches.
async fn pricing_showcase(
    State(state): State<AppState>,
) -> AppResult<Json<PricingShowcase>> {
    let cfg = repo::system_settings::get_landing_pricing_groups(&state.db).await?;
    let all_models = repo::models::list(&state.db).await?;

    let mut sections = Vec::new();
    for provider in [ChannelProvider::Openai, ChannelProvider::Anthropic] {
        let Some(gid) = cfg.get(provider) else { continue };
        let group = match repo::groups::get(&state.db, gid).await {
            Ok(g) if g.enabled && g.provider == provider => g,
            // Picked group was disabled / deleted / reassigned — skip the
            // section instead of leaking a stale or mismatched group.
            _ => continue,
        };
        let provider_name = match provider {
            ChannelProvider::Openai => "openai",
            ChannelProvider::Anthropic => "anthropic",
        };
        let models = all_models
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
            .collect::<Vec<_>>();
        if models.is_empty() {
            continue;
        }
        sections.push(ShowcaseSection {
            provider,
            group: ShowcaseGroup {
                id: group.id,
                name: group.name,
                label: group.label,
                multiplier: group.multiplier,
            },
            models,
        });
    }

    Ok(Json(PricingShowcase { sections }))
}
