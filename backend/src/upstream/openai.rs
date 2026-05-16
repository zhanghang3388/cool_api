use async_trait::async_trait;
use bytes::Bytes;
use eventsource_stream::Eventsource;
use futures::StreamExt;
use serde::Deserialize;
use std::time::Instant;

use super::{
    join_url, truncate, ChatJsonResponse, ChatRequest, ChatResponse, ChatStreamResponse,
    ModelEntry, TestReport, UpstreamAdapter, Usage, FORWARD_TIMEOUT, TEST_TIMEOUT,
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
        let url = join_url(base_url, "/v1/chat/completions");

        // For streaming, force `stream_options.include_usage = true` so the
        // upstream emits a final chunk with `usage`. Without it, OpenAI never
        // sends usage on a stream and we'd bill the user 0 tokens.
        let body_to_send: Bytes = if req.stream {
            ensure_include_usage(&req.raw_body)
        } else {
            req.raw_body.clone()
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
            let usage = extract_usage_json(&body);
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

        let events = async_stream::try_stream! {
            let mut sse = byte_stream.eventsource();
            let mut final_usage = Usage::default();

            while let Some(ev) = sse.next().await {
                let ev = ev.map_err(|e| format!("sse parse: {e}"))?;

                // OpenAI marks end-of-stream with `data: [DONE]`. The
                // eventsource-stream crate emits it as a normal event with
                // data "[DONE]".
                if ev.data.trim() == "[DONE]" {
                    // Forward the terminator verbatim and stop.
                    yield Bytes::from_static(b"data: [DONE]\n\n");
                    break;
                }

                // Try to capture usage from chunks; late chunks with
                // `stream_options.include_usage` get a `usage` object.
                if let Ok(chunk) = serde_json::from_str::<StreamChunk>(&ev.data) {
                    if let Some(u) = chunk.usage {
                        final_usage.prompt_tokens = u.prompt_tokens.unwrap_or(0);
                        final_usage.completion_tokens = u.completion_tokens.unwrap_or(0);
                        final_usage.cached_tokens = u
                            .prompt_tokens_details
                            .and_then(|d| d.cached_tokens)
                            .unwrap_or(0);
                        // Mirror to the shared snapshot so caller can recover
                        // billing data if the stream is later dropped.
                        if let Ok(mut g) = partial_for_stream.lock() {
                            *g = final_usage;
                        }
                    }
                }

                yield Bytes::from(format!("data: {}\n\n", ev.data));
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
}
