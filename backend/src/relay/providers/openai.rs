use async_trait::async_trait;
use reqwest::Client;
use std::time::Duration;

use super::{ChatRequest, ChatResponse, Provider, ProviderError, SseStream};

pub struct OpenAiProvider {
    client: Client,
}

impl OpenAiProvider {
    pub fn new() -> Self {
        Self {
            client: provider_client(),
        }
    }

    fn url(base_url: Option<&str>, path: &str) -> String {
        let base = base_url.unwrap_or("https://api.openai.com/v1");
        let base = base.trim_end_matches('/');
        // If base already ends with /v1, don't double it
        if base.ends_with("/v1") {
            format!("{base}{path}")
        } else {
            format!("{base}/v1{path}")
        }
    }
}

#[async_trait]
impl Provider for OpenAiProvider {
    async fn chat(
        &self,
        api_key: &str,
        base_url: Option<&str>,
        request: &ChatRequest,
    ) -> Result<ChatResponse, ProviderError> {
        let mut req = request.clone();
        req.stream = Some(false);

        let resp = self
            .client
            .post(Self::url(base_url, "/chat/completions"))
            .bearer_auth(api_key)
            .json(&req)
            .send()
            .await
            .map_err(|e| ProviderError {
                status: 502,
                message: format!("Request failed: {e}"),
                retryable: true,
            })?;

        let status = resp.status().as_u16();
        if !resp.status().is_success() {
            let body = resp.text().await.unwrap_or_default();
            return Err(ProviderError {
                status,
                message: body,
                retryable: status == 429 || status >= 500,
            });
        }

        resp.json::<ChatResponse>()
            .await
            .map_err(|e| ProviderError {
                status: 502,
                message: format!("Failed to parse response: {e}"),
                retryable: false,
            })
    }

    async fn chat_stream(
        &self,
        api_key: &str,
        base_url: Option<&str>,
        request: &ChatRequest,
    ) -> Result<SseStream, ProviderError> {
        let mut req = request.clone();
        req.stream = Some(true);

        let resp = self
            .client
            .post(Self::url(base_url, "/chat/completions"))
            .bearer_auth(api_key)
            .json(&req)
            .send()
            .await
            .map_err(|e| ProviderError {
                status: 502,
                message: format!("Request failed: {e}"),
                retryable: true,
            })?;

        let status = resp.status().as_u16();
        if !resp.status().is_success() {
            let body = resp.text().await.unwrap_or_default();
            return Err(ProviderError {
                status,
                message: body,
                retryable: status == 429 || status >= 500,
            });
        }

        // OpenAI already returns SSE in the right format, pass through
        let stream = resp.bytes_stream();
        Ok(Box::pin(stream))
    }
}

fn provider_client() -> Client {
    let timeout_secs = std::env::var("PROVIDER_TIMEOUT_SECS")
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(120);

    Client::builder()
        .timeout(Duration::from_secs(timeout_secs))
        .build()
        .expect("Failed to build OpenAI HTTP client")
}
