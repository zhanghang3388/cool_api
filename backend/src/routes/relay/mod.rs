pub mod chat;
pub mod messages;
pub mod models;

use axum::Router;
use sqlx::PgPool;
use std::sync::Arc;

use crate::config::AppConfig;
use crate::middleware::rate_limiter::RateLimiter;
use crate::relay::dispatcher::Dispatcher;

pub fn router(pool: PgPool, config: AppConfig) -> Router {
    let dispatcher = Arc::new(Dispatcher::new(pool.clone()));
    let rate_limiter = RateLimiter::new();

    // Spawn background cleanup task
    let rl_clone = rate_limiter.clone();
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(tokio::time::Duration::from_secs(60)).await;
            rl_clone.cleanup();
        }
    });

    Router::new()
        .nest("/v1", chat::router(pool.clone(), dispatcher.clone(), rate_limiter.clone(), config.clone()))
        .nest("/v1", messages::router(pool.clone(), dispatcher.clone(), rate_limiter, config))
        .nest("/v1", models::router(dispatcher.clone(), pool.clone()))
}
