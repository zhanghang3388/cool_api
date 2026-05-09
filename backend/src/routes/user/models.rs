use axum::extract::State;
use axum::routing::get;
use axum::{Json, Router};

use crate::auth::AuthUser;
use crate::error::AppResult;
use crate::models::Model;
use crate::repo;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route("/", get(list))
}

/// Users only see enabled models. The admin catalog endpoint lives at
/// /admin/models and includes disabled rows for management.
async fn list(
    State(state): State<AppState>,
    _auth: AuthUser,
) -> AppResult<Json<Vec<Model>>> {
    let rows = repo::models::list(&state.db).await?;
    Ok(Json(rows.into_iter().filter(|m| m.enabled).collect()))
}
