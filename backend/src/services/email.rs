//! Outbound email via Resend (https://resend.com/).
//!
//! The Resend API key + sender identity live in `system_settings.email`,
//! configured by an admin. We resolve them lazily per send so config changes
//! take effect without a restart.

use serde::Serialize;

use crate::error::{AppError, AppResult};
use crate::repo;
use crate::AppState;

const RESEND_ENDPOINT: &str = "https://api.resend.com/emails";

#[derive(Debug, Serialize)]
struct ResendRequest<'a> {
    from: String,
    to: [&'a str; 1],
    subject: &'a str,
    html: &'a str,
}

/// Send an HTML email via Resend. Returns 503-style errors when the feature
/// is disabled / unconfigured, and 502 when Resend itself rejects the call —
/// callers can pass these straight through to API responses.
pub async fn send_html(
    state: &AppState,
    to: &str,
    subject: &str,
    html: &str,
) -> AppResult<()> {
    let cfg = repo::system_settings::get_email_config(&state.db).await?;
    if !cfg.enabled {
        return Err(AppError::BadRequest("邮件服务未启用".into()));
    }
    if cfg.api_key_encrypted.is_empty() || cfg.from_email.is_empty() {
        return Err(AppError::BadRequest(
            "邮件服务未完整配置 (API Key / 发件人)".into(),
        ));
    }

    let api_key = state
        .cipher
        .decrypt(&cfg.api_key_encrypted)
        .map_err(|_| AppError::Internal("email api key decrypt failed".into()))?;

    let from = if cfg.from_name.trim().is_empty() {
        cfg.from_email.clone()
    } else {
        format!("{} <{}>", cfg.from_name.trim(), cfg.from_email)
    };

    let body = ResendRequest {
        from,
        to: [to],
        subject,
        html,
    };

    let resp = state
        .http
        .post(RESEND_ENDPOINT)
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| AppError::Upstream(format!("resend request failed: {e}")))?;

    if !resp.status().is_success() {
        let status = resp.status();
        // Resend's body on error is a small JSON {message, name}; logging the
        // raw text is enough to debug, but we don't surface it to the client.
        let text = resp.text().await.unwrap_or_default();
        tracing::warn!(%status, body = %text, "resend send failed");
        return Err(AppError::Upstream(format!("邮件发送失败 ({status})")));
    }

    Ok(())
}

pub fn render_register_code(code: &str, ttl_minutes: i64, site_name: &str) -> String {
    format!(
        "<div style=\"font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; line-height:1.6; color:#222\">\
         <p>您好，</p>\
         <p>您正在注册 <strong>{site}</strong>。请在 <strong>{ttl} 分钟</strong> 内使用以下验证码完成注册：</p>\
         <p style=\"font-size:28px; font-weight:700; letter-spacing:6px; margin:16px 0; color:#000\">{code}</p>\
         <p style=\"color:#888; font-size:12px\">如果不是您本人操作，请忽略此邮件。</p>\
         </div>",
        site = html_escape(site_name),
        ttl = ttl_minutes,
        code = html_escape(code),
    )
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}
