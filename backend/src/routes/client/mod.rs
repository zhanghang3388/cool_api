pub mod profile;
pub mod keys;
pub mod usage;
pub mod billing;

use axum::Router;
use sqlx::PgPool;

pub fn router(pool: PgPool) -> Router {
    Router::new()
        .nest("/keys", keys::router(pool.clone()))
        .nest("/billing", billing::router(pool.clone()))
        .nest("/usage", usage::router(pool.clone()))
        .nest("/profile", profile::router(pool.clone()))
}
