use axum::{
    extract::State,
    routing::get,
    Json, Router,
};
use sqlx::PgPool;

use crate::auth::middleware::CurrentUser;
use crate::error::AppError;
use crate::models::user::User;

pub fn router(pool: PgPool) -> Router {
    Router::new()
        .route("/", get(get_profile))
        .with_state(pool)
}

async fn get_profile(
    user: CurrentUser,
    State(pool): State<PgPool>,
) -> Result<Json<User>, AppError> {
    let u = User::find_by_id(&pool, user.id)
        .await?
        .ok_or_else(|| AppError::NotFound("User not found".into()))?;
    Ok(Json(u))
}
