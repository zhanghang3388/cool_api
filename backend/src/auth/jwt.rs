use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, Algorithm, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};
use crate::models::UserRole;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    /// user id
    pub sub: i64,
    pub role: UserRole,
    /// issued at (seconds since epoch)
    pub iat: i64,
    /// expiry (seconds since epoch)
    pub exp: i64,
}

#[derive(Clone)]
pub struct JwtService {
    encoding: EncodingKey,
    decoding: DecodingKey,
    validation: Validation,
    ttl: Duration,
}

impl JwtService {
    pub fn new(secret: &str, ttl_hours: i64) -> Self {
        // Pin the algorithm. `Validation::default()` happens to be HS256
        // today but lets the decoder accept whatever the token's `alg`
        // header claims — the foundation of "alg confusion" attacks. The
        // matching encoder also runs HS256 by default, but we pin the
        // header explicitly below for symmetry.
        let validation = Validation::new(Algorithm::HS256);
        Self {
            encoding: EncodingKey::from_secret(secret.as_bytes()),
            decoding: DecodingKey::from_secret(secret.as_bytes()),
            validation,
            ttl: Duration::hours(ttl_hours),
        }
    }

    pub fn issue(&self, user_id: i64, role: UserRole) -> AppResult<String> {
        let now = Utc::now();
        let claims = Claims {
            sub: user_id,
            role,
            iat: now.timestamp(),
            exp: (now + self.ttl).timestamp(),
        };
        encode(&Header::new(Algorithm::HS256), &claims, &self.encoding)
            .map_err(|e| AppError::Internal(format!("jwt encode: {e}")))
    }

    pub fn verify(&self, token: &str) -> AppResult<Claims> {
        let data = decode::<Claims>(token, &self.decoding, &self.validation)
            .map_err(|_| AppError::Unauthorized)?;
        Ok(data.claims)
    }
}
