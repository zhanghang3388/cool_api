//! Public (unauthenticated) endpoints.

use axum::extract::State;
use axum::routing::get;
use axum::{Json, Router};

use crate::error::AppResult;
use crate::repo;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route("/site", get(site))
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
