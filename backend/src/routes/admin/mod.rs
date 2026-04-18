pub mod users;
pub mod keys;
pub mod channels;
pub mod stats;
pub mod billing;
pub mod settings;
pub mod pricing;

use axum::Router;
use sqlx::PgPool;

pub fn router(pool: PgPool) -> Router {
    Router::new()
        .nest("/users", users::router(pool.clone()))
        .nest("/provider-keys", keys::router(pool.clone()))
        .nest("/channels", channels::router(pool.clone()))
        .nest("/billing", billing::router(pool.clone()))
        .nest("/settings", settings::router(pool.clone()))
        .nest("/stats", stats::router(pool.clone()))
        .nest("/pricing", pricing::router(pool.clone()))
}
