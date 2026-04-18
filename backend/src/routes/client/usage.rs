use axum::{
    extract::{Query, State},
    routing::get,
    Json, Router,
};
use serde::Deserialize;
use sqlx::PgPool;

use crate::auth::middleware::CurrentUser;
use crate::error::AppError;
use crate::models::request_log::RequestLog;

#[derive(Debug, Deserialize)]
pub struct ListParams {
    pub page: Option<i64>,
    pub per_page: Option<i64>,
}

pub fn router(pool: PgPool) -> Router {
    Router::new()
        .route("/logs", get(list_logs))
        .with_state(pool)
}

async fn list_logs(
    user: CurrentUser,
    State(pool): State<PgPool>,
    Query(params): Query<ListParams>,
) -> Result<Json<Vec<RequestLog>>, AppError> {
    let page = params.page.unwrap_or(1).max(1);
    let per_page = params.per_page.unwrap_or(20).clamp(1, 100);
    let offset = (page - 1) * per_page;
    let logs = RequestLog::list_by_user(&pool, user.id, offset, per_page).await?;
    Ok(Json(logs))
}
