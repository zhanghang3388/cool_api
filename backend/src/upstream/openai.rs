use async_trait::async_trait;
use bytes::Bytes;
use eventsource_stream::Eventsource;
use futures::StreamExt;
use serde::Deserialize;
use std::time::Instant;

use super::{
    join_url, truncate, ChatJsonResponse, ChatRequest, ChatResponse, ChatStreamResponse,
    Endpoint, ModelEntry, TestReport, UpstreamAdapter, Usage, FORWARD_TIMEOUT, TEST_TIMEOUT,
};
use crate::error::{AppError, AppResult};

pub struct OpenAiAdapter;

#[async_trait]
impl UpstreamAdapter for OpenAiAdapter {
    async fn test_connectivity(
        &self,
        http: &reqwest::Client,
        base_url: &str,
        api_key: &str,
        _probe_model_hint: Option<&str>,
    ) -> AppResult<TestReport> {
        let url = join_url(base_url, "/v1/models");
        let start = Instant::now();

        let resp = http
            .get(&url)
            .bearer_auth(api_key)
            .timeout(TEST_TIMEOUT)
            .send()
            .await;

        let latency_ms = start.elapsed().as_millis().min(i32::MAX as u128) as i32;

        match resp {
            Ok(r) if r.status().is_success() => Ok(TestReport {
                ok: true,
                latency_ms,
                detail: format!("{} - models endpoint reachable", r.status()),
            }),
            Ok(r) => {
                let status = r.status();
                let body = r.text().await.unwrap_or_default();
                Ok(TestReport {
                    ok: false,
                    latency_ms,
                    detail: format!("{status}: {}", truncate(&body, 400)),
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
            .bearer_auth(api_key)
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
                owner: m.owned_by,
                created: m.created,
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
        let url = match req.endpoint {
            Endpoint::ChatCompletions => join_url(base_url, "/v1/chat/completions"),
            Endpoint::Responses => join_url(base_url, "/v1/responses"),
        };

        // For streaming chat-completions, force `stream_options.include_usage`
        // so the upstream emits a final chunk with `usage`. Responses API emits
        // usage in `response.completed` unconditionally — no body patch needed.
        let body_to_send: Bytes = match (req.endpoint, req.stream) {
            (Endpoint::ChatCompletions, true) => ensure_include_usage(&req.raw_body),
            _ => req.raw_body.clone(),
        };

        let resp = http
            .post(&url)
            .bearer_auth(api_key)
            .header("content-type", "application/json")
            .timeout(FORWARD_TIMEOUT)
            .body(body_to_send)
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
            // 4xx (excluding auth + rate-limit) means the request body is bad.
            // The channel is healthy — surface as a request error so the router
            // does NOT failover to other channels or mark this one unhealthy.
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
            let usage = match req.endpoint {
                Endpoint::ChatCompletions => extract_usage_json(&body),
                Endpoint::Responses => extract_usage_responses_json(&body),
            };
            return Ok(ChatResponse::Json(ChatJsonResponse {
                status: status.as_u16(),
                body,
                usage,
            }));
        }

        // Streaming path.
        let byte_stream = resp.bytes_stream();
        let (usage_tx, usage_rx) = tokio::sync::oneshot::channel::<Usage>();
        let partial = std::sync::Arc::new(std::sync::Mutex::new(Usage::default()));
        let partial_for_stream = partial.clone();
        let endpoint = req.endpoint;

        let events = async_stream::try_stream! {
            let mut sse = byte_stream.eventsource();
            let mut final_usage = Usage::default();

            while let Some(ev) = sse.next().await {
                let ev = ev.map_err(|e| format!("sse parse: {e}"))?;

                // Chat Completions marks end-of-stream with `data: [DONE]`.
                // Responses API doesn't — it ends naturally after `response.completed`.
                if ev.data.trim() == "[DONE]" {
                    yield Bytes::from_static(b"data: [DONE]\n\n");
                    break;
                }

                // Capture usage when present. Both endpoints send usage in
                // their own shape; check whichever applies for this request.
                let captured = match endpoint {
                    Endpoint::ChatCompletions => parse_chat_chunk_usage(&ev.data),
                    Endpoint::Responses => parse_responses_event_usage(&ev.event, &ev.data),
                };
                if let Some(u) = captured {
                    final_usage = u;
                    if let Ok(mut g) = partial_for_stream.lock() {
                        *g = final_usage;
                    }
                }

                // Re-emit the event verbatim. Responses uses named events
                // (`event: response.completed\ndata: {...}\n\n`) — preserve
                // the event name so the client SDK matches its handlers.
                if ev.event.is_empty() {
                    yield Bytes::from(format!("data: {}\n\n", ev.data));
                } else {
                    yield Bytes::from(format!("event: {}\ndata: {}\n\n", ev.event, ev.data));
                }
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

/// Patch a chat-completions request body so the upstream emits a final
/// `usage` chunk on streaming responses. OpenAI gates this behind
/// `stream_options.include_usage = true`; without it, streamed responses
/// never carry usage and we'd record 0 tokens for every streamed call.
///
/// We only mutate `stream_options.include_usage`; every other user field
/// (including unrelated keys under `stream_options`) is preserved. If the
/// body isn't valid JSON we return it unchanged and let the upstream reject
/// it — we'd rather surface the upstream's error than mask it.
fn ensure_include_usage(raw: &Bytes) -> Bytes {
    let mut value: serde_json::Value = match serde_json::from_slice(raw) {
        Ok(v) => v,
        Err(_) => return raw.clone(),
    };
    let Some(obj) = value.as_object_mut() else {
        return raw.clone();
    };

    let opts = obj
        .entry("stream_options".to_string())
        .or_insert_with(|| serde_json::json!({}));
    if let Some(opts_obj) = opts.as_object_mut() {
        opts_obj.insert(
            "include_usage".to_string(),
            serde_json::Value::Bool(true),
        );
    } else {
        // `stream_options` was set to a non-object (rare, malformed). Replace
        // it with the minimal correct shape rather than crashing.
        *opts = serde_json::json!({ "include_usage": true });
    }

    match serde_json::to_vec(&value) {
        Ok(buf) => Bytes::from(buf),
        Err(_) => raw.clone(),
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
            .map(|u| Usage {
                prompt_tokens: u.prompt_tokens.unwrap_or(0),
                completion_tokens: u.completion_tokens.unwrap_or(0),
                cached_tokens: u
                    .prompt_tokens_details
                    .and_then(|d| d.cached_tokens)
                    .unwrap_or(0),
                // OpenAI's prompt caching doesn't bill creation separately,
                // so nothing to attribute here.
                cache_creation_tokens: 0,
            })
            .unwrap_or_default(),
        Err(_) => Usage::default(),
    }
}

/// Pull usage out of a Chat Completions streaming chunk. Late chunks (when
/// `stream_options.include_usage` is set) carry a `usage` object; everything
/// else returns `None`.
fn parse_chat_chunk_usage(data: &str) -> Option<Usage> {
    let chunk: StreamChunk = serde_json::from_str(data).ok()?;
    let u = chunk.usage?;
    Some(Usage {
        prompt_tokens: u.prompt_tokens.unwrap_or(0),
        completion_tokens: u.completion_tokens.unwrap_or(0),
        cached_tokens: u
            .prompt_tokens_details
            .and_then(|d| d.cached_tokens)
            .unwrap_or(0),
        cache_creation_tokens: 0,
    })
}

/// Pull usage out of a Responses API SSE event. Usage shows up on
/// `response.completed` (terminal) and sometimes `response.in_progress`
/// snapshots — both carry the same shape: `data.response.usage`.
fn parse_responses_event_usage(_event_name: &str, data: &str) -> Option<Usage> {
    let env: ResponsesEnvelope = serde_json::from_str(data).ok()?;
    let resp = env.response?;
    let u = resp.usage?;
    Some(usage_from_responses(u))
}

fn extract_usage_responses_json(body: &[u8]) -> Usage {
    // Non-streaming Responses API returns the response object directly.
    #[derive(Deserialize)]
    struct Env {
        usage: Option<ResponsesUsageRaw>,
    }
    match serde_json::from_slice::<Env>(body) {
        Ok(env) => env.usage.map(usage_from_responses).unwrap_or_default(),
        Err(_) => Usage::default(),
    }
}

fn usage_from_responses(u: ResponsesUsageRaw) -> Usage {
    Usage {
        prompt_tokens: u.input_tokens.unwrap_or(0),
        completion_tokens: u.output_tokens.unwrap_or(0),
        cached_tokens: u
            .input_tokens_details
            .and_then(|d| d.cached_tokens)
            .unwrap_or(0),
        cache_creation_tokens: 0,
    }
}

#[derive(Debug, Deserialize)]
struct ResponsesEnvelope {
    #[serde(default)]
    response: Option<ResponsesPayload>,
}

#[derive(Debug, Deserialize)]
struct ResponsesPayload {
    #[serde(default)]
    usage: Option<ResponsesUsageRaw>,
}

#[derive(Debug, Deserialize)]
struct ResponsesUsageRaw {
    #[serde(default)]
    input_tokens: Option<i32>,
    #[serde(default)]
    output_tokens: Option<i32>,
    #[serde(default)]
    input_tokens_details: Option<ResponsesInputDetails>,
}

#[derive(Debug, Deserialize)]
struct ResponsesInputDetails {
    #[serde(default)]
    cached_tokens: Option<i32>,
}

#[derive(Debug, Deserialize)]
struct StreamChunk {
    #[serde(default)]
    usage: Option<UsageRaw>,
}

#[derive(Debug, Deserialize)]
struct UsageRaw {
    #[serde(default)]
    prompt_tokens: Option<i32>,
    #[serde(default)]
    completion_tokens: Option<i32>,
    #[serde(default)]
    prompt_tokens_details: Option<PromptDetails>,
}

#[derive(Debug, Deserialize)]
struct PromptDetails {
    #[serde(default)]
    cached_tokens: Option<i32>,
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
    owned_by: Option<String>,
    #[serde(default)]
    created: Option<i64>,
}

#[cfg(test)]
mod tests {
    use super::super::join_url;
    use super::extract_usage_json;

    #[test]
    fn url_join() {
        assert_eq!(join_url("https://api.openai.com", "/v1/models"), "https://api.openai.com/v1/models");
        assert_eq!(join_url("https://api.openai.com/", "/v1/models"), "https://api.openai.com/v1/models");
        assert_eq!(join_url("https://api.openai.com/v1", "/v1/models"), "https://api.openai.com/v1/models");
    }

    #[test]
    fn usage_extraction() {
        let body = br#"{
            "id":"x","choices":[],
            "usage":{"prompt_tokens":12,"completion_tokens":3,"prompt_tokens_details":{"cached_tokens":4}}
        }"#;
        let u = extract_usage_json(body);
        assert_eq!(u.prompt_tokens, 12);
        assert_eq!(u.completion_tokens, 3);
        assert_eq!(u.cached_tokens, 4);
    }

    #[test]
    fn usage_missing_defaults_zero() {
        let body = br#"{"id":"x"}"#;
        let u = extract_usage_json(body);
        assert_eq!(u.prompt_tokens, 0);
    }

    #[test]
    fn ensure_include_usage_adds_when_missing() {
        let body = br#"{"model":"gpt-4o","stream":true,"messages":[]}"#;
        let out = super::ensure_include_usage(&bytes::Bytes::from_static(body));
        let v: serde_json::Value = serde_json::from_slice(&out).unwrap();
        assert_eq!(v["stream_options"]["include_usage"], serde_json::json!(true));
        // Original fields are preserved.
        assert_eq!(v["model"], "gpt-4o");
        assert_eq!(v["stream"], true);
    }

    #[test]
    fn ensure_include_usage_overrides_false() {
        let body = br#"{"stream":true,"stream_options":{"include_usage":false}}"#;
        let out = super::ensure_include_usage(&bytes::Bytes::from_static(body));
        let v: serde_json::Value = serde_json::from_slice(&out).unwrap();
        assert_eq!(v["stream_options"]["include_usage"], serde_json::json!(true));
    }

    #[test]
    fn ensure_include_usage_keeps_other_options() {
        let body = br#"{"stream":true,"stream_options":{"some_other":"keep"}}"#;
        let out = super::ensure_include_usage(&bytes::Bytes::from_static(body));
        let v: serde_json::Value = serde_json::from_slice(&out).unwrap();
        assert_eq!(v["stream_options"]["include_usage"], serde_json::json!(true));
        assert_eq!(v["stream_options"]["some_other"], "keep");
    }

    #[test]
    fn ensure_include_usage_passes_through_unparseable() {
        // Garbage in → garbage out, untouched. Lets the upstream reject it
        // with its own error message instead of us masking it.
        let body = b"not-json";
        let out = super::ensure_include_usage(&bytes::Bytes::copy_from_slice(body));
        assert_eq!(&out[..], body);
    }

    #[test]
    fn responses_json_usage_extraction() {
        let body = br#"{
            "id":"resp_x","status":"completed",
            "usage":{"input_tokens":42,"output_tokens":7,
                     "input_tokens_details":{"cached_tokens":5}}
        }"#;
        let u = super::extract_usage_responses_json(body);
        assert_eq!(u.prompt_tokens, 42);
        assert_eq!(u.completion_tokens, 7);
        assert_eq!(u.cached_tokens, 5);
        assert_eq!(u.cache_creation_tokens, 0);
    }

    #[test]
    fn responses_event_usage_from_completed() {
        // The `response.completed` SSE event wraps the response under `response`.
        let data = r#"{"type":"response.completed","response":{"id":"r","usage":{"input_tokens":11,"output_tokens":3}}}"#;
        let u = super::parse_responses_event_usage("response.completed", data).unwrap();
        assert_eq!(u.prompt_tokens, 11);
        assert_eq!(u.completion_tokens, 3);
    }

    #[test]
    fn responses_event_usage_missing_returns_none() {
        // Mid-stream events like `response.output_text.delta` have no usage.
        let data = r#"{"type":"response.output_text.delta","delta":"hi"}"#;
        assert!(super::parse_responses_event_usage("response.output_text.delta", data).is_none());
    }

    #[test]
    fn chat_chunk_usage_only_on_late_chunk() {
        // Mid-stream chat completion chunks have no usage.
        let chunk_no_usage = r#"{"id":"x","choices":[{"delta":{"content":"hi"}}]}"#;
        assert!(super::parse_chat_chunk_usage(chunk_no_usage).is_none());

        let chunk_with_usage = r#"{"id":"x","choices":[],"usage":{"prompt_tokens":10,"completion_tokens":2}}"#;
        let u = super::parse_chat_chunk_usage(chunk_with_usage).unwrap();
        assert_eq!(u.prompt_tokens, 10);
        assert_eq!(u.completion_tokens, 2);
    }
}
