pub mod admin;
pub mod auth;
pub mod client;
pub mod relay;

use axum::Router;
use sqlx::PgPool;
use crate::config::AppConfig;

pub fn create_router(pool: PgPool, config: AppConfig) -> Router {
    let api = Router::new()
        .nest("/api/auth", auth::router(pool.clone(), config.clone()))
        .nest("/api/admin", admin::router(pool.clone()))
        .nest("/api/client", client::router(pool.clone()));

    let relay = relay::router(pool.clone());

    Router::new()
        .merge(api)
        .merge(relay)
        .layer(axum::Extension(config))
        .layer(axum::Extension(pool))
}
