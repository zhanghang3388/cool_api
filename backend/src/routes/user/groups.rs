use axum::extract::State;
use axum::routing::get;
use axum::{Json, Router};
use bigdecimal::BigDecimal;
use serde::Serialize;

use crate::auth::AuthUser;
use crate::error::AppResult;
use crate::repo;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route("/", get(list))
}

/// Minimal DTO: users don't need to see descriptions, but they do need the
/// multiplier so the frontend can compute effective prices per group.
#[derive(Debug, Serialize)]
struct UserGroupDto {
    id: i64,
    name: String,
    label: String,
    multiplier: BigDecimal,
}

async fn list(
    State(state): State<AppState>,
    _auth: AuthUser,
) -> AppResult<Json<Vec<UserGroupDto>>> {
    let rows = repo::groups::list(&state.db).await?;
    Ok(Json(
        rows.into_iter()
            .filter(|g| g.enabled)
            .map(|g| UserGroupDto {
                id: g.id,
                name: g.name,
                label: g.label,
                multiplier: g.multiplier,
            })
            .collect(),
    ))
}
