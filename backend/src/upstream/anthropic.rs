use async_trait::async_trait;
use bytes::Bytes;
use eventsource_stream::Eventsource;
use futures::StreamExt;
use serde::Deserialize;
use serde_json::json;
use std::time::Instant;

use super::{
    join_url, truncate, ChatJsonResponse, ChatRequest, ChatResponse, ChatStreamResponse,
    ModelEntry, TestReport, UpstreamAdapter, Usage, FORWARD_TIMEOUT, TEST_TIMEOUT,
};
use crate::error::{AppError, AppResult};

pub struct AnthropicAdapter;

const ANTHROPIC_VERSION: &str = "2023-06-01";

#[async_trait]
impl UpstreamAdapter for AnthropicAdapter {
    async fn test_connectivity(
        &self,
        http: &reqwest::Client,
        base_url: &str,
        api_key: &str,
        probe_model_hint: Option<&str>,
    ) -> AppResult<TestReport> {
        let url = join_url(base_url, "/v1/messages");
        let model = probe_model_hint.unwrap_or("claude-haiku-4-5");

        let body = json!({
            "model": model,
            "max_tokens": 1,
            "messages": [{ "role": "user", "content": "ping" }],
        });

        let start = Instant::now();
        let resp = http
            .post(&url)
            .header("x-api-key", api_key)
            .header("anthropic-version", ANTHROPIC_VERSION)
            .timeout(TEST_TIMEOUT)
            .json(&body)
            .send()
            .await;

        let latency_ms = start.elapsed().as_millis().min(i32::MAX as u128) as i32;

        match resp {
            Ok(r) if r.status().is_success() => Ok(TestReport {
                ok: true,
                latency_ms,
                detail: format!("{} - /v1/messages ok (probe model: {model})", r.status()),
            }),
            Ok(r) => {
                let status = r.status();
                let text = r.text().await.unwrap_or_default();
                Ok(TestReport {
                    ok: false,
                    latency_ms,
                    detail: format!("{status}: {}", truncate(&text, 400)),
                })
            }
            Err(e) => Ok(TestReport {
                ok: false,
                latency_ms,
                detail: format!("network error: {e}"),
            }),
        }
    }

    async fn list_models(
        &self,
        http: &reqwest::Client,
        base_url: &str,
        api_key: &str,
    ) -> AppResult<Vec<ModelEntry>> {
        let url = join_url(base_url, "/v1/models");
        let resp = http
            .get(&url)
            .header("x-api-key", api_key)
            .header("anthropic-version", ANTHROPIC_VERSION)
            .timeout(TEST_TIMEOUT)
            .send()
            .await
            .map_err(|e| AppError::Upstream(format!("network error: {e}")))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(AppError::Upstream(format!(
                "{status}: {}",
                truncate(&body, 400)
            )));
        }

        let parsed: ListResponse = resp
            .json()
            .await
            .map_err(|e| AppError::Upstream(format!("parse: {e}")))?;

        let mut out: Vec<ModelEntry> = parsed
            .data
            .into_iter()
            .map(|m| ModelEntry {
                id: m.id,
                owner: Some("anthropic".to_string()),
                created: m.created_at.and_then(|s| {
                    chrono::DateTime::parse_from_rfc3339(&s)
                        .ok()
                        .map(|d| d.timestamp())
                }),
            })
            .collect();
        out.sort_by(|a, b| a.id.cmp(&b.id));
        Ok(out)
    }

    async fn forward_chat(
        &self,
        http: &reqwest::Client,
        base_url: &str,
        api_key: &str,
        req: ChatRequest,
    ) -> AppResult<ChatResponse> {
        let url = join_url(base_url, "/v1/messages");

        let resp = http
            .post(&url)
            .header("x-api-key", api_key)
            .header("anthropic-version", ANTHROPIC_VERSION)
            .header("content-type", "application/json")
            .timeout(FORWARD_TIMEOUT)
            .body(req.raw_body.clone())
            .send()
            .await
            .map_err(|e| AppError::Upstream(format!("network error: {e}")))?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.bytes().await.unwrap_or_default();
            let detail = format!(
                "{status}: {}",
                truncate(&String::from_utf8_lossy(&body), 800)
            );
            if super::is_request_error_status(status.as_u16()) {
                return Err(AppError::UpstreamRequest(detail));
            }
            return Err(AppError::Upstream(detail));
        }

        if !req.stream {
            let body = resp
                .bytes()
                .await
                .map_err(|e| AppError::Upstream(format!("read body: {e}")))?;
            let usage = extract_usage_json(&body);
            return Ok(ChatResponse::Json(ChatJsonResponse {
                status: status.as_u16(),
                body,
                usage,
            }));
        }

        // Streaming
        let byte_stream = resp.bytes_stream();
        let (usage_tx, usage_rx) = tokio::sync::oneshot::channel::<Usage>();
        let partial = std::sync::Arc::new(std::sync::Mutex::new(Usage::default()));
        let partial_for_stream = partial.clone();

        let events = async_stream::try_stream! {
            let mut sse = byte_stream.eventsource();
            let mut final_usage = Usage::default();

            while let Some(ev) = sse.next().await {
                let ev = ev.map_err(|e| format!("sse parse: {e}"))?;

                // Anthropic streams carry named events: message_start, content_block_delta,
                // message_delta (which updates cumulative output tokens), message_stop.
                // We re-emit events preserving the event/data lines so clients can parse them.
                match ev.event.as_str() {
                    "message_start" => {
                        if let Ok(parsed) = serde_json::from_str::<MessageStart>(&ev.data) {
                            if let Some(u) = parsed.message.usage {
                                let cached = u.cache_read_input_tokens.unwrap_or(0);
                                let written = u.cache_creation_input_tokens.unwrap_or(0);
                                let new_input = u.input_tokens.unwrap_or(0);
                                // Anthropic reports input_tokens / cache_read / cache_creation
                                // as DISJOINT counts. The billing layer expects the
                                // OpenAI-style invariant "prompt_tokens is the TOTAL
                                // input including cached", so sum them up here.
                                final_usage.prompt_tokens = new_input + cached + written;
                                final_usage.completion_tokens = u.output_tokens.unwrap_or(0);
                                final_usage.cached_tokens = cached;
                                final_usage.cache_creation_tokens = written;
                                if let Ok(mut g) = partial_for_stream.lock() {
                                    *g = final_usage;
                                }
                            }
                        }
                    }
                    "message_delta" => {
                        if let Ok(parsed) = serde_json::from_str::<MessageDelta>(&ev.data) {
                            if let Some(u) = parsed.usage {
                                // message_delta carries CUMULATIVE output_tokens in its usage
                                final_usage.completion_tokens = u.output_tokens.unwrap_or(final_usage.completion_tokens);
                                if let Ok(mut g) = partial_for_stream.lock() {
                                    *g = final_usage;
                                }
                            }
                        }
                    }
                    _ => {}
                }

                // Relay the event verbatim with its event name + data line.
                let chunk = if ev.event.is_empty() {
                    format!("data: {}\n\n", ev.data)
                } else {
                    format!("event: {}\ndata: {}\n\n", ev.event, ev.data)
                };
                yield Bytes::from(chunk);
            }

            let _ = usage_tx.send(final_usage);
        };

        let boxed: futures::stream::BoxStream<'static, Result<Bytes, String>> =
            Box::pin(events);

        Ok(ChatResponse::Stream(ChatStreamResponse {
            events: boxed,
            final_usage: usage_rx,
            partial_usage: partial,
        }))
    }
}

fn extract_usage_json(body: &[u8]) -> Usage {
    #[derive(Deserialize)]
    struct Env {
        usage: Option<UsageRaw>,
    }
    match serde_json::from_slice::<Env>(body) {
        Ok(env) => env
            .usage
            .map(|u| {
                let cached = u.cache_read_input_tokens.unwrap_or(0);
                let written = u.cache_creation_input_tokens.unwrap_or(0);
                let new_input = u.input_tokens.unwrap_or(0);
                Usage {
                    // Aggregate to "total prompt" (OpenAI semantics) so the
                    // billing layer can subtract cached/written and bill the
                    // remainder at the new-input rate.
                    prompt_tokens: new_input + cached + written,
                    completion_tokens: u.output_tokens.unwrap_or(0),
                    cached_tokens: cached,
                    cache_creation_tokens: written,
                }
            })
            .unwrap_or_default(),
        Err(_) => Usage::default(),
    }
}

#[derive(Debug, Deserialize)]
struct UsageRaw {
    #[serde(default)]
    input_tokens: Option<i32>,
    #[serde(default)]
    output_tokens: Option<i32>,
    #[serde(default)]
    cache_read_input_tokens: Option<i32>,
    #[serde(default)]
    cache_creation_input_tokens: Option<i32>,
}

#[derive(Debug, Deserialize)]
struct MessageStart {
    #[serde(default)]
    message: MessageStartInner,
}

#[derive(Debug, Deserialize, Default)]
struct MessageStartInner {
    #[serde(default)]
    usage: Option<UsageRaw>,
}

#[derive(Debug, Deserialize)]
struct MessageDelta {
    #[serde(default)]
    usage: Option<UsageRaw>,
}

#[derive(Debug, Deserialize)]
struct ListResponse {
    #[serde(default)]
    data: Vec<ModelRow>,
}

#[derive(Debug, Deserialize)]
struct ModelRow {
    id: String,
    #[serde(default)]
    created_at: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::extract_usage_json;

    #[test]
    fn usage_extraction() {
        let body = br#"{
            "id":"x",
            "usage":{"input_tokens":12,"output_tokens":5,"cache_read_input_tokens":3}
        }"#;
        let u = extract_usage_json(body);
        // Anthropic reports input_tokens (=new input) and cache_read_input_tokens
        // as disjoint counts; we aggregate them to "total prompt" so billing
        // can split buckets the same way it does for OpenAI.
        assert_eq!(u.prompt_tokens, 15);
        assert_eq!(u.completion_tokens, 5);
        assert_eq!(u.cached_tokens, 3);
        assert_eq!(u.cache_creation_tokens, 0);
    }

    #[test]
    fn usage_with_cache_creation() {
        let body = br#"{
            "id":"x",
            "usage":{
                "input_tokens":1000,
                "output_tokens":500,
                "cache_read_input_tokens":2000,
                "cache_creation_input_tokens":300
            }
        }"#;
        let u = extract_usage_json(body);
        assert_eq!(u.prompt_tokens, 3300);
        assert_eq!(u.cached_tokens, 2000);
        assert_eq!(u.cache_creation_tokens, 300);
    }
}
