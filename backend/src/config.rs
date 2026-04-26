use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct AppConfig {
    pub database_url: String,
    pub jwt_secret: String,
    pub jwt_expiry_hours: u64,
    pub jwt_refresh_expiry_days: u64,
    pub server_host: String,
    pub server_port: u16,
    pub admin_username: String,
    pub admin_password: String,
    pub app_env: String,
    pub allowed_origins: Vec<String>,
    pub default_user_rpm_limit: u32,
    pub global_rpm_limit: Option<u32>,
}

impl AppConfig {
    pub fn from_env() -> Self {
        let app_env = std::env::var("APP_ENV").unwrap_or_else(|_| "development".into());
        let is_production = app_env.eq_ignore_ascii_case("production");
        let jwt_secret =
            std::env::var("JWT_SECRET").unwrap_or_else(|_| "dev-secret-change-me".into());
        let admin_password = std::env::var("ADMIN_PASSWORD").unwrap_or_else(|_| "admin123".into());
        let allowed_origins = std::env::var("ALLOWED_ORIGINS")
            .ok()
            .map(|value| {
                value
                    .split(',')
                    .map(str::trim)
                    .filter(|origin| !origin.is_empty())
                    .map(str::to_string)
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();

        if is_production {
            if jwt_secret == "dev-secret-change-me" || jwt_secret.len() < 32 {
                panic!("JWT_SECRET must be set to at least 32 characters in production");
            }
            if admin_password == "admin123" || admin_password.len() < 12 {
                panic!("ADMIN_PASSWORD must be set to a strong password in production");
            }
            if allowed_origins.is_empty() {
                panic!("ALLOWED_ORIGINS must be set in production");
            }
        }

        Self {
            database_url: std::env::var("DATABASE_URL").expect("DATABASE_URL must be set"),
            jwt_secret,
            jwt_expiry_hours: std::env::var("JWT_EXPIRY_HOURS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(24),
            jwt_refresh_expiry_days: std::env::var("JWT_REFRESH_EXPIRY_DAYS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(7),
            server_host: std::env::var("SERVER_HOST").unwrap_or_else(|_| "0.0.0.0".into()),
            server_port: std::env::var("SERVER_PORT")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(3000),
            admin_username: std::env::var("ADMIN_USERNAME").unwrap_or_else(|_| "admin".into()),
            admin_password,
            app_env,
            allowed_origins,
            default_user_rpm_limit: std::env::var("DEFAULT_USER_RPM_LIMIT")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(60),
            global_rpm_limit: std::env::var("GLOBAL_RPM_LIMIT")
                .ok()
                .and_then(|v| v.parse().ok()),
        }
    }

    pub fn is_production(&self) -> bool {
        self.app_env.eq_ignore_ascii_case("production")
    }
}
