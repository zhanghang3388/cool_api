//! Upstream provider adapters.

use async_trait::async_trait;
use bytes::Bytes;
use futures::stream::BoxStream;
use std::time::Duration;

use crate::error::AppResult;
use crate::models::ChannelProvider;

pub mod anthropic;
pub mod openai;

pub struct TestReport {
    pub ok: bool,
    pub latency_ms: i32,
    pub detail: String,
}

#[derive(Debug, serde::Serialize)]
pub struct ModelEntry {
    pub id: String,
    pub owner: Option<String>,
    pub created: Option<i64>,
}

#[derive(Debug, Default, Clone, Copy)]
pub struct Usage {
    pub prompt_tokens: i32,
    pub completion_tokens: i32,
    /// Tokens served from the upstream's prompt cache. Billed at the model's
    /// `cache_read_price_cents` (falling back to `input_price_cents`).
    pub cached_tokens: i32,
    /// Tokens written into the upstream's prompt cache on this request.
    /// Billed at `cache_write_price_cents` (falling back to `input_price_cents`).
    /// Anthropic exposes this as `cache_creation_input_tokens`; OpenAI
    /// currently doesn't bill creation separately, so we leave it 0.
    pub cache_creation_tokens: i32,
}

/// Which OpenAI-compatible endpoint to forward to. Both flow through the
/// same routing/billing pipeline; only the URL and the wire format differ.
/// Anthropic ignores this — it always hits `/v1/messages`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Endpoint {
    /// Classic Chat Completions API: `/v1/chat/completions`. Used by the
    /// OpenAI Python SDK's `chat.completions.create`, by older clients, and
    /// by everything in the "OpenAI-compatible" ecosystem.
    ChatCompletions,
    /// Responses API: `/v1/responses`. Used by Codex CLI, the OpenAI
    /// Agents SDK, and newer official tools. Different request/response
    /// shape and different SSE event names (`response.completed` etc).
    Responses,
}

/// Raw chat-completion request bytes plus parsed flags we need for routing.
pub struct ChatRequest {
    pub raw_body: Bytes,
    pub model: String,
    pub stream: bool,
    pub endpoint: Endpoint,
}

/// Non-streaming response.
pub struct ChatJsonResponse {
    pub status: u16,
    pub body: Bytes,
    pub usage: Usage,
}

/// Streaming response. `events` yields raw SSE event bytes (one chunk per
/// upstream event, already formatted like `data: {...}\n\n`). The caller is
/// responsible for relaying them to the downstream client as-is.
///
/// `final_usage` is filled once the stream completes; the caller awaits it
/// *after* the stream is exhausted to drive billing. `partial_usage` is a
/// shared accumulator the adapter updates as each chunk arrives — if the
/// stream is dropped before completion (client disconnect, upstream hiccup),
/// the caller can still bill against the most recent snapshot rather than
/// recording zero tokens.
pub struct ChatStreamResponse {
    pub events: BoxStream<'static, Result<Bytes, String>>,
    pub final_usage: tokio::sync::oneshot::Receiver<Usage>,
    pub partial_usage: std::sync::Arc<std::sync::Mutex<Usage>>,
}

pub enum ChatResponse {
    Json(ChatJsonResponse),
    Stream(ChatStreamResponse),
}

#[async_trait]
pub trait UpstreamAdapter: Send + Sync {
    async fn test_connectivity(
        &self,
        http: &reqwest::Client,
        base_url: &str,
        api_key: &str,
        probe_model_hint: Option<&str>,
    ) -> AppResult<TestReport>;

    async fn list_models(
        &self,
        http: &reqwest::Client,
        base_url: &str,
        api_key: &str,
    ) -> AppResult<Vec<ModelEntry>>;

    /// Forward a chat-completion request to the upstream.
    ///
    /// On streaming responses the adapter returns immediately with a stream of
    /// SSE chunks and a oneshot that fires when the stream terminates with the
    /// final token usage. The caller is expected to tee events to the client
    /// and await the oneshot for billing.
    async fn forward_chat(
        &self,
        http: &reqwest::Client,
        base_url: &str,
        api_key: &str,
        req: ChatRequest,
    ) -> AppResult<ChatResponse>;
}

pub fn adapter_for(provider: ChannelProvider) -> &'static dyn UpstreamAdapter {
    match provider {
        ChannelProvider::Openai => &openai::OpenAiAdapter,
        ChannelProvider::Anthropic => &anthropic::AnthropicAdapter,
    }
}

pub(crate) fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        let mut cut = max;
        while !s.is_char_boundary(cut) {
            cut -= 1;
        }
        format!("{}...", &s[..cut])
    }
}

pub(crate) fn join_url(base: &str, path: &str) -> String {
    let trimmed = base.trim_end_matches('/');
    if trimmed.ends_with("/v1") && path.starts_with("/v1/") {
        format!("{trimmed}{}", &path[3..])
    } else {
        format!("{trimmed}{path}")
    }
}

pub(crate) const TEST_TIMEOUT: Duration = Duration::from_secs(15);
pub(crate) const FORWARD_TIMEOUT: Duration = Duration::from_secs(300);

/// Classify an upstream HTTP status into "user request problem" vs "channel
/// problem". 4xx that's clearly about the request body (400, 404, 422 …) is
/// the user's fault — channel stays healthy. 401/403/408/425/429 + every 5xx
/// is treated as a channel/transport issue and triggers failover.
pub(crate) fn is_request_error_status(status: u16) -> bool {
    if !(400..500).contains(&status) {
        return false;
    }
    !matches!(status, 401 | 403 | 408 | 425 | 429)
}

#[cfg(test)]
mod tests {
    use super::is_request_error_status;

    #[test]
    fn user_request_errors() {
        for s in [400u16, 404, 405, 411, 413, 414, 415, 422] {
            assert!(is_request_error_status(s), "{s} should be a user error");
        }
    }

    #[test]
    fn channel_failures() {
        for s in [401u16, 403, 408, 425, 429, 500, 502, 503, 504] {
            assert!(!is_request_error_status(s), "{s} should NOT be a user error");
        }
    }

    #[test]
    fn success_codes_not_user_errors() {
        for s in [200u16, 204, 301, 302] {
            assert!(!is_request_error_status(s));
        }
    }
}
