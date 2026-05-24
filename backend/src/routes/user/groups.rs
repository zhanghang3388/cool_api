use axum::extract::{Query, State};
use axum::routing::get;
use axum::{Json, Router};
use bigdecimal::BigDecimal;
use serde::{Deserialize, Serialize};

use crate::auth::AuthUser;
use crate::error::AppResult;
use crate::models::ChannelProvider;
use crate::repo;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route("/", get(list))
}

#[derive(Debug, Deserialize)]
struct ListQuery {
    provider: Option<ChannelProvider>,
}

/// Minimal DTO: users don't need to see descriptions, but they do need the
/// multiplier so the frontend can compute effective prices per group.
#[derive(Debug, Serialize)]
struct UserGroupDto {
    id: i64,
    provider: ChannelProvider,
    name: String,
    label: String,
    multiplier: BigDecimal,
}

async fn list(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(q): Query<ListQuery>,
) -> AppResult<Json<Vec<UserGroupDto>>> {
    let effective =
        repo::user_groups::effective_group_ids(&state.db, auth.user_id, auth.role).await?;
    let rows = repo::groups::list(&state.db).await?;
    Ok(Json(
        rows.into_iter()
            .filter(|g| g.enabled && effective.contains(&g.id))
            .filter(|g| q.provider.map(|p| g.provider == p).unwrap_or(true))
            .map(|g| UserGroupDto {
                id: g.id,
                provider: g.provider,
                name: g.name,
                label: g.label,
                multiplier: g.multiplier,
            })
            .collect(),
    ))
}
