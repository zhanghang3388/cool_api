use std::net::SocketAddr;
use std::sync::Arc;

use axum::Router;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;
use tracing_subscriber::EnvFilter;

mod auth;
mod bootstrap;
mod config;
mod crypto;
mod db;
mod error;
mod middleware;
mod models;
mod redis_client;
mod repo;
mod routes;
mod services;
mod upstream;

use crate::auth::JwtService;
use crate::config::AppConfig;
use crate::crypto::Cipher;

#[derive(Clone)]
pub struct AppState {
    pub db: sqlx::PgPool,
    pub redis: Option<redis::aio::ConnectionManager>,
    pub jwt: JwtService,
    pub cipher: Cipher,
    pub http: reqwest::Client,
    pub config: Arc<AppConfig>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();

    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info,aethergate=debug")))
        .init();

    let config = Arc::new(AppConfig::load()?);
    tracing::info!("config loaded, listening on {}", config.bind);

    let db = db::init_pool(&config.database_url).await?;
    sqlx::migrate!("./migrations").run(&db).await?;

    let redis = redis_client::init(&config.redis_url).await?;

    let jwt = JwtService::new(&config.jwt_secret, config.jwt_ttl_hours);
    let cipher = Cipher::from_base64_key(&config.encryption_key)?;
    let http = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()?;

    bootstrap::ensure_admin_user(&db).await?;

    let state = AppState {
        db,
        redis,
        jwt,
        cipher,
        http,
        config: config.clone(),
    };

    // Background liveness prober. No-op until an admin enables it in settings.
    services::prober::spawn(state.clone());

    let app = Router::new()
        .merge(routes::health::router())
        .merge(routes::public::router())
        .nest("/admin", routes::admin::router())
        .nest("/user", routes::user::router())
        .nest("/payment", routes::payment::router())
        .nest("/v1", routes::v1::router())
        .merge(routes::anthropic::router())
        .with_state(state)
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http());

    let addr: SocketAddr = config.bind.parse()?;
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
