use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use uuid::Uuid;

use crate::config::AppConfig;
use crate::error::AppError;

use super::jwt;

#[derive(Debug, Clone)]
pub struct CurrentUser {
    pub id: Uuid,
    pub role: String,
}

impl<S> FromRequestParts<S> for CurrentUser
where
    S: Send + Sync,
{
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        let auth_header = parts
            .headers
            .get("Authorization")
            .and_then(|v| v.to_str().ok())
            .ok_or_else(|| AppError::Unauthorized("Missing Authorization header".into()))?;

        let token = auth_header
            .strip_prefix("Bearer ")
            .ok_or_else(|| AppError::Unauthorized("Invalid Authorization format".into()))?;

        let config = parts
            .extensions
            .get::<AppConfig>()
            .ok_or_else(|| AppError::Internal("Config not found".into()))?;

        let claims = jwt::verify_token(token, &config.jwt_secret)?;

        if claims.token_type != "access" {
            return Err(AppError::Unauthorized("Invalid token type".into()));
        }

        Ok(CurrentUser {
            id: claims.sub,
            role: claims.role,
        })
    }
}

impl CurrentUser {
    pub fn require_admin(&self) -> Result<(), AppError> {
        if self.role != "admin" {
            return Err(AppError::Forbidden("Admin access required".into()));
        }
        Ok(())
    }
}

#[derive(Debug, Clone)]
pub struct AdminUser(pub CurrentUser);

impl<S> FromRequestParts<S> for AdminUser
where
    S: Send + Sync,
{
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let user = CurrentUser::from_request_parts(parts, state).await?;
        user.require_admin()?;
        Ok(AdminUser(user))
    }
}
