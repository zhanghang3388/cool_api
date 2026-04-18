mod auth;
mod config;
mod db;
mod error;
mod middleware;
mod models;
mod relay;
mod routes;
mod services;

use config::AppConfig;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();

    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "cool_api=debug,tower_http=debug".into()),
        )
        .init();

    let config = AppConfig::from_env();
    let pool = db::init_pool(&config.database_url).await;

    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("Failed to run migrations");

    // Create initial admin account if it doesn't exist
    if models::user::User::find_by_username(&pool, &config.admin_username)
        .await
        .ok()
        .flatten()
        .is_none()
    {
        let hash = auth::password::hash_password(&config.admin_password)
            .expect("Failed to hash admin password");
        models::user::User::create(
            &pool,
            &models::user::CreateUser {
                username: config.admin_username.clone(),
                email: format!("{}@localhost", config.admin_username),
                password_hash: hash,
                role: Some("admin".into()),
            },
        )
        .await
        .expect("Failed to create admin user");
        tracing::info!("Created initial admin user: {}", config.admin_username);
    }

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = routes::create_router(pool, config.clone())
        .layer(TraceLayer::new_for_http())
        .layer(cors);

    let addr = format!("{}:{}", config.server_host, config.server_port);
    tracing::info!("Starting server on {addr}");

    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .expect("Failed to bind address");

    axum::serve(listener, app)
        .await
        .expect("Server error");
}
