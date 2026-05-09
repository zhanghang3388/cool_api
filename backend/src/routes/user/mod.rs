use axum::Router;

use crate::AppState;

mod auth;
mod groups;
mod keys;
mod models;
mod topup;
mod usage;

pub fn router() -> Router<AppState> {
    Router::new()
        .nest("/auth", auth::router())
        .nest("/groups", groups::router())
        .nest("/keys", keys::router())
        .nest("/models", models::router())
        .nest("/topup", topup::router())
        .nest("/usage", usage::router())
}
