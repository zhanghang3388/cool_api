use axum::Router;

use crate::AppState;

mod auth;
mod cache;
mod channels;
mod groups;
mod models;
mod probes;
mod settings;
mod stats;
mod users;

pub fn router() -> Router<AppState> {
    Router::new()
        .nest("/auth", auth::router())
        .nest("/cache", cache::router())
        .nest("/channels", channels::router())
        .nest("/groups", groups::router())
        .nest("/models", models::router())
        .nest("/probes", probes::router())
        .nest("/settings", settings::router())
        .nest("/stats", stats::router())
        .nest("/users", users::router())
}
