//! Public (unauthenticated) endpoints.

use axum::extract::State;
use axum::routing::get;
use axum::{Json, Router};
use bigdecimal::BigDecimal;
use serde::Serialize;

use crate::error::AppResult;
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
struct PricingShowcase {
    /// `None` when admin hasn't picked a group, or the picked group is
    /// disabled / deleted. Frontend hides the whole section in that case.
    group: Option<ShowcaseGroup>,
    models: Vec<ShowcaseModel>,
}

/// Public price catalog used on the landing page. Returns the group whose
/// pricing the admin has chosen to showcase, plus every enabled model. The
/// frontend computes `effective = base × multiplier` and shows it next to
/// the base price for comparison.
async fn pricing_showcase(
    State(state): State<AppState>,
) -> AppResult<Json<PricingShowcase>> {
    let group_id = repo::system_settings::get_landing_pricing_group_id(&state.db).await?;
    let Some(group_id) = group_id else {
        return Ok(Json(PricingShowcase {
            group: None,
            models: Vec::new(),
        }));
    };

    // Resolve group; if the admin picked one and then disabled/deleted it,
    // fall back to "hide the section" instead of leaking a stale group.
    let group = match repo::groups::get(&state.db, group_id).await {
        Ok(g) if g.enabled => g,
        _ => {
            return Ok(Json(PricingShowcase {
                group: None,
                models: Vec::new(),
            }));
        }
    };

    let models = repo::models::list(&state.db)
        .await?
        .into_iter()
        .filter(|m| m.enabled)
        .map(|m| ShowcaseModel {
            name: m.name,
            provider: m.provider,
            input_price_cents: m.input_price_cents,
            output_price_cents: m.output_price_cents,
            cache_read_price_cents: m.cache_read_price_cents,
            cache_write_price_cents: m.cache_write_price_cents,
        })
        .collect();

    Ok(Json(PricingShowcase {
        group: Some(ShowcaseGroup {
            id: group.id,
            name: group.name,
            label: group.label,
            multiplier: group.multiplier,
        }),
        models,
    }))
}
