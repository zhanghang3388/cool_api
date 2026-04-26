pub mod admin;
pub mod auth;
pub mod client;
pub mod relay;

use crate::config::AppConfig;
use axum::{
    Router,
    body::Body,
    extract::{Extension, State},
    http::{HeaderValue, Request, StatusCode, header::HeaderName},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::get,
};
use sqlx::PgPool;
use std::sync::{
    Arc,
    atomic::{AtomicU64, Ordering},
};

pub fn create_router(pool: PgPool, config: AppConfig) -> Router {
    let metrics = Arc::new(AppMetrics::default());
    let api = Router::new()
        .nest("/api/auth", auth::router(pool.clone(), config.clone()))
        .nest("/api/admin", admin::router(pool.clone()))
        .nest("/api/client", client::router(pool.clone()));

    let relay = relay::router(pool.clone(), config.clone());

    Router::new()
        .route("/health", get(health))
        .route("/metrics", get(metrics_endpoint))
        .merge(api)
        .merge(relay)
        .layer(middleware::from_fn_with_state(
            metrics.clone(),
            metrics_middleware,
        ))
        .layer(Extension(metrics))
        .layer(axum::Extension(config))
        .layer(axum::Extension(pool))
}

#[derive(Default)]
struct AppMetrics {
    requests_total: AtomicU64,
    requests_in_flight: AtomicU64,
    responses_4xx_total: AtomicU64,
    responses_5xx_total: AtomicU64,
    latency_ms_total: AtomicU64,
}

async fn health() -> impl IntoResponse {
    StatusCode::NO_CONTENT
}

async fn metrics_endpoint(Extension(metrics): Extension<Arc<AppMetrics>>) -> impl IntoResponse {
    let total = metrics.requests_total.load(Ordering::Relaxed);
    let latency_total = metrics.latency_ms_total.load(Ordering::Relaxed);
    let avg_latency = if total == 0 {
        0.0
    } else {
        latency_total as f64 / total as f64
    };

    let body = format!(
        "# HELP cool_api_requests_total Total HTTP requests handled.\n\
         # TYPE cool_api_requests_total counter\n\
         cool_api_requests_total {total}\n\
         # HELP cool_api_requests_in_flight HTTP requests currently in flight.\n\
         # TYPE cool_api_requests_in_flight gauge\n\
         cool_api_requests_in_flight {}\n\
         # HELP cool_api_responses_4xx_total Total HTTP 4xx responses.\n\
         # TYPE cool_api_responses_4xx_total counter\n\
         cool_api_responses_4xx_total {}\n\
         # HELP cool_api_responses_5xx_total Total HTTP 5xx responses.\n\
         # TYPE cool_api_responses_5xx_total counter\n\
         cool_api_responses_5xx_total {}\n\
         # HELP cool_api_request_latency_ms_total Total HTTP request latency in milliseconds.\n\
         # TYPE cool_api_request_latency_ms_total counter\n\
         cool_api_request_latency_ms_total {latency_total}\n\
         # HELP cool_api_request_latency_ms_avg Average HTTP request latency in milliseconds.\n\
         # TYPE cool_api_request_latency_ms_avg gauge\n\
         cool_api_request_latency_ms_avg {avg_latency:.3}\n",
        metrics.requests_in_flight.load(Ordering::Relaxed),
        metrics.responses_4xx_total.load(Ordering::Relaxed),
        metrics.responses_5xx_total.load(Ordering::Relaxed),
    );

    (
        StatusCode::OK,
        [("content-type", "text/plain; version=0.0.4")],
        body,
    )
}

async fn metrics_middleware(
    State(metrics): State<Arc<AppMetrics>>,
    mut req: Request<Body>,
    next: Next,
) -> Response {
    let request_id_header = HeaderName::from_static("x-request-id");
    let request_id = req
        .headers()
        .get(&request_id_header)
        .cloned()
        .unwrap_or_else(|| HeaderValue::from_str(&uuid::Uuid::new_v4().to_string()).unwrap());

    req.extensions_mut().insert(request_id.clone());
    metrics.requests_total.fetch_add(1, Ordering::Relaxed);
    metrics.requests_in_flight.fetch_add(1, Ordering::Relaxed);

    let start = std::time::Instant::now();
    let mut response = next.run(req).await;
    let latency_ms = start.elapsed().as_millis().min(u128::from(u64::MAX)) as u64;

    metrics
        .latency_ms_total
        .fetch_add(latency_ms, Ordering::Relaxed);
    metrics.requests_in_flight.fetch_sub(1, Ordering::Relaxed);

    if response.status().is_client_error() {
        metrics.responses_4xx_total.fetch_add(1, Ordering::Relaxed);
    } else if response.status().is_server_error() {
        metrics.responses_5xx_total.fetch_add(1, Ordering::Relaxed);
    }

    response.headers_mut().insert(request_id_header, request_id);
    response
}
