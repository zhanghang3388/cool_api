use axum::extract::State;
use axum::routing::{get, post};
use axum::{Json, Router};

use crate::auth::AdminUser;
use crate::error::AppResult;
use crate::routes::shared::{authenticate, fetch_user_info, LoginRequest, LoginResponse, UserInfo};
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/login", post(login))
        .route("/me", get(me))
}

async fn login(
    State(state): State<AppState>,
    Json(req): Json<LoginRequest>,
) -> AppResult<Json<LoginResponse>> {
    // Admin-facing login rejects normal users with 403.
    let resp = authenticate(&state, &req, true).await?;
    Ok(Json(resp))
}

async fn me(
    State(state): State<AppState>,
    admin: AdminUser,
) -> AppResult<Json<UserInfo>> {
    Ok(Json(fetch_user_info(&state, admin.user_id()).await?))
}
