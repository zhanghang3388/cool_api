use axum::{
    Json, Router,
    extract::{Query, State},
    routing::{get, post},
};
use serde::Deserialize;
use sqlx::PgPool;

use crate::auth::middleware::AdminUser;
use crate::error::AppError;
use crate::models::billing::BillingTransaction;
use crate::models::user::User;

#[derive(Debug, Deserialize)]
pub struct TopupRequest {
    pub username: String,
    pub amount: i64,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ListParams {
    pub page: Option<i64>,
    pub per_page: Option<i64>,
}

pub fn router(pool: PgPool) -> Router {
    Router::new()
        .route("/transactions", get(list_transactions))
        .route("/topup", post(topup))
        .with_state(pool)
}

async fn list_transactions(
    _admin: AdminUser,
    State(pool): State<PgPool>,
    Query(params): Query<ListParams>,
) -> Result<Json<Vec<BillingTransaction>>, AppError> {
    let page = params.page.unwrap_or(1).max(1);
    let per_page = params.per_page.unwrap_or(20).clamp(1, 100);
    let offset = (page - 1) * per_page;
    let txs = BillingTransaction::list_all(&pool, offset, per_page).await?;
    Ok(Json(txs))
}

async fn topup(
    _admin: AdminUser,
    State(pool): State<PgPool>,
    Json(req): Json<TopupRequest>,
) -> Result<Json<BillingTransaction>, AppError> {
    if req.amount <= 0 {
        return Err(AppError::BadRequest("Amount must be positive".into()));
    }
    let user = User::find_by_username(&pool, &req.username)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("User '{}' not found", req.username)))?;
    let updated = User::update_balance(&pool, user.id, req.amount).await?;
    let tx = BillingTransaction::create(
        &pool,
        user.id,
        "topup",
        req.amount,
        updated.balance,
        req.description.as_deref(),
        None,
    )
    .await?;
    Ok(Json(tx))
}
