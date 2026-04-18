use axum::{
    extract::{Path, Query, State},
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

use crate::auth::middleware::AdminUser;
use crate::error::AppError;
use crate::models::user::User;

#[derive(Debug, Deserialize)]
pub struct ListParams {
    pub page: Option<i64>,
    pub per_page: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct PaginatedUsers {
    pub data: Vec<User>,
    pub total: i64,
    pub page: i64,
    pub per_page: i64,
}

#[derive(Debug, Deserialize)]
pub struct UpdateUserRequest {
    pub is_active: Option<bool>,
    pub role: Option<String>,
    pub quota_limit: Option<Option<i64>>,
}

pub fn router(pool: PgPool) -> Router {
    Router::new()
        .route("/", get(list_users))
        .route("/{id}", get(get_user).patch(update_user))
        .with_state(pool)
}

async fn list_users(
    _admin: AdminUser,
    State(pool): State<PgPool>,
    Query(params): Query<ListParams>,
) -> Result<Json<PaginatedUsers>, AppError> {
    let page = params.page.unwrap_or(1).max(1);
    let per_page = params.per_page.unwrap_or(20).clamp(1, 100);
    let offset = (page - 1) * per_page;

    let users = User::list(&pool, offset, per_page).await?;
    let total = User::count(&pool).await?;

    Ok(Json(PaginatedUsers {
        data: users,
        total,
        page,
        per_page,
    }))
}

async fn get_user(
    _admin: AdminUser,
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> Result<Json<User>, AppError> {
    let user = User::find_by_id(&pool, id)
        .await?
        .ok_or_else(|| AppError::NotFound("User not found".into()))?;
    Ok(Json(user))
}

async fn update_user(
    _admin: AdminUser,
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateUserRequest>,
) -> Result<Json<User>, AppError> {
    let mut user = User::find_by_id(&pool, id)
        .await?
        .ok_or_else(|| AppError::NotFound("User not found".into()))?;

    if let Some(is_active) = req.is_active {
        user = User::update_active(&pool, id, is_active).await?;
    }

    if let Some(role) = &req.role {
        if role != "admin" && role != "client" {
            return Err(AppError::BadRequest("Role must be 'admin' or 'client'".into()));
        }
        user = sqlx::query_as(
            "UPDATE users SET role = $1, updated_at = now() WHERE id = $2 RETURNING *"
        )
        .bind(role)
        .bind(id)
        .fetch_one(&pool)
        .await?;
    }

    if let Some(quota_limit) = req.quota_limit {
        user = sqlx::query_as(
            "UPDATE users SET quota_limit = $1, updated_at = now() WHERE id = $2 RETURNING *"
        )
        .bind(quota_limit)
        .bind(id)
        .fetch_one(&pool)
        .await?;
    }

    Ok(Json(user))
}
