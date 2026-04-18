use axum::{
    extract::{Query, State},
    routing::get,
    Json, Router,
};
use serde::Deserialize;
use sqlx::PgPool;

use crate::auth::middleware::CurrentUser;
use crate::error::AppError;
use crate::models::billing::BillingTransaction;
use crate::models::user::User;

#[derive(Debug, Deserialize)]
pub struct ListParams {
    pub page: Option<i64>,
    pub per_page: Option<i64>,
}

#[derive(serde::Serialize)]
pub struct BillingOverview {
    pub balance: i64,
    pub transactions: Vec<BillingTransaction>,
}

pub fn router(pool: PgPool) -> Router {
    Router::new()
        .route("/", get(get_billing))
        .route("/transactions", get(list_transactions))
        .with_state(pool)
}

async fn get_billing(
    user: CurrentUser,
    State(pool): State<PgPool>,
) -> Result<Json<BillingOverview>, AppError> {
    let u = User::find_by_id(&pool, user.id)
        .await?
        .ok_or_else(|| AppError::NotFound("User not found".into()))?;
    let txs = BillingTransaction::list_by_user(&pool, user.id, 0, 10).await?;
    Ok(Json(BillingOverview {
        balance: u.balance,
        transactions: txs,
    }))
}

async fn list_transactions(
    user: CurrentUser,
    State(pool): State<PgPool>,
    Query(params): Query<ListParams>,
) -> Result<Json<Vec<BillingTransaction>>, AppError> {
    let page = params.page.unwrap_or(1).max(1);
    let per_page = params.per_page.unwrap_or(20).clamp(1, 100);
    let offset = (page - 1) * per_page;
    let txs = BillingTransaction::list_by_user(&pool, user.id, offset, per_page).await?;
    Ok(Json(txs))
}
