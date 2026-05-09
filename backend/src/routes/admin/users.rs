use axum::extract::{Path, Query, State};
use axum::routing::{get, patch, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};

use crate::auth::AdminUser;
use crate::error::{AppError, AppResult};
use crate::models::{User, UserRole, UserStatus};
use crate::repo;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list))
        .route("/:id", patch(update))
        .route("/:id/topup", post(topup))
}

#[derive(Debug, Deserialize)]
struct ListQuery {
    page: Option<i64>,
    page_size: Option<i64>,
    search: Option<String>,
    status: Option<UserStatus>,
    group_id: Option<i64>,
}

#[derive(Debug, Serialize)]
struct UsersResponse {
    items: Vec<repo::users::AdminUserRow>,
    total: i64,
    page: i64,
    page_size: i64,
}

async fn list(
    State(state): State<AppState>,
    _admin: AdminUser,
    Query(q): Query<ListQuery>,
) -> AppResult<Json<UsersResponse>> {
    let page = q.page.unwrap_or(1).max(1);
    let page_size = q.page_size.unwrap_or(20).clamp(1, 100);
    let offset = (page - 1) * page_size;

    let filter = repo::users::UserFilter {
        search: q.search.as_deref(),
        status: q.status,
        group_id: q.group_id,
    };
    let page_data = repo::users::list(&state.db, filter, page_size, offset).await?;
    Ok(Json(UsersResponse {
        items: page_data.items,
        total: page_data.total,
        page,
        page_size,
    }))
}

#[derive(Debug, Deserialize)]
struct UpdateUserRequest {
    status: Option<UserStatus>,
    group_id: Option<i64>,
}

#[derive(Debug, Serialize)]
struct UserRow {
    id: i64,
    username: String,
    email: Option<String>,
    role: UserRole,
    status: UserStatus,
    group_id: i64,
    balance_cents: i64,
    total_used_cents: i64,
}

impl From<User> for UserRow {
    fn from(u: User) -> Self {
        Self {
            id: u.id,
            username: u.username,
            email: u.email,
            role: u.role,
            status: u.status,
            group_id: u.group_id,
            balance_cents: u.balance_cents,
            total_used_cents: u.total_used_cents,
        }
    }
}

async fn update(
    State(state): State<AppState>,
    admin: AdminUser,
    Path(id): Path<i64>,
    Json(body): Json<UpdateUserRequest>,
) -> AppResult<Json<UserRow>> {
    // Guardrail: an admin can't lock themselves out by disabling their own account.
    if id == admin.user_id() && matches!(body.status, Some(UserStatus::Disabled)) {
        return Err(AppError::BadRequest(
            "cannot disable your own account".into(),
        ));
    }
    if let Some(gid) = body.group_id {
        let group = repo::groups::get(&state.db, gid).await.map_err(|e| match e {
            AppError::NotFound => AppError::BadRequest("group not found".into()),
            other => other,
        })?;
        if !group.enabled {
            return Err(AppError::BadRequest(format!(
                "group '{}' is disabled",
                group.name
            )));
        }
    }
    let u = repo::users::update(
        &state.db,
        id,
        repo::users::UpdateUser {
            status: body.status,
            group_id: body.group_id,
        },
    )
    .await?;
    Ok(Json(u.into()))
}

#[derive(Debug, Deserialize)]
struct TopUpRequest {
    amount_cents: i64,
    #[serde(default)]
    bonus_cents: i64,
    #[serde(default)]
    note: String,
}

async fn topup(
    State(state): State<AppState>,
    _admin: AdminUser,
    Path(id): Path<i64>,
    Json(body): Json<TopUpRequest>,
) -> AppResult<Json<UserRow>> {
    let u = repo::users::topup(
        &state.db,
        id,
        body.amount_cents,
        body.bonus_cents,
        &body.note,
    )
    .await?;
    Ok(Json(u.into()))
}
