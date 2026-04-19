use async_trait::async_trait;
use bytes::Bytes;
use futures::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};

use super::{
    ChatChoice, ChatChunk, ChatMessage, ChatRequest, ChatResponse, ChunkChoice, ChunkDelta,
    Provider, ProviderError, SseStream, Usage,
};

pub struct ClaudeProvider {
    client: Client,
}

impl ClaudeProvider {
    pub fn new() -> Self {
        Self {
            client: Client::new(),
        }
    }

    fn url(base_url: Option<&str>) -> String {
        let base = base_url.unwrap_or("https://api.anthropic.com");
        format!("{}/v1/messages", base.trim_end_matches('/'))
    }

    fn to_claude_request(req: &ChatRequest) -> ClaudeRequest {
        let mut system = None;
        let mut messages = Vec::new();

        for msg in &req.messages {
            if msg.role == "system" {
                system = Some(content_to_string(&msg.content));
            } else {
                messages.push(ClaudeMessage {
                    role: msg.role.clone(),
                    content: content_to_string(&msg.content),
                });
            }
        }

        ClaudeRequest {
            model: req.model.clone(),
            max_tokens: req.max_tokens.unwrap_or(4096),
            messages,
            system,
            temperature: req.temperature,
            top_p: req.top_p,
            stream: req.stream.unwrap_or(false),
            stop_sequences: req.stop.as_ref().and_then(|s| {
                if let Some(arr) = s.as_array() {
                    Some(arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
                } else if let Some(s) = s.as_str() {
                    Some(vec![s.to_string()])
                } else {
                    None
                }
            }),
        }
    }

    fn to_chat_response(resp: ClaudeResponse, model: &str) -> ChatResponse {
        let content = resp
            .content
            .iter()
            .filter_map(|b| {
                if b.content_type == "text" {
                    Some(b.text.clone().unwrap_or_default())
                } else {
                    None
                }
            })
            .collect::<Vec<_>>()
            .join("");

        ChatResponse {
            id: resp.id,
            object: "chat.completion".to_string(),
            created: chrono::Utc::now().timestamp(),
            model: model.to_string(),
            choices: vec![ChatChoice {
                index: 0,
                message: ChatMessage {
                    role: "assistant".to_string(),
                    content: serde_json::Value::String(content),
                },
                finish_reason: Some(match resp.stop_reason.as_deref() {
                    Some("end_turn") => "stop".to_string(),
                    Some("max_tokens") => "length".to_string(),
                    Some(other) => other.to_string(),
                    None => "stop".to_string(),
                }),
            }],
            usage: Some(Usage {
                prompt_tokens: resp.usage.input_tokens,
                completion_tokens: resp.usage.output_tokens,
                total_tokens: resp.usage.input_tokens + resp.usage.output_tokens,
                cache_creation_tokens: resp.usage.cache_creation_input_tokens,
                cache_read_tokens: resp.usage.cache_read_input_tokens,
            }),
        }
    }
}

fn content_to_string(content: &serde_json::Value) -> String {
    match content {
        serde_json::Value::String(s) => s.clone(),
        serde_json::Value::Array(arr) => arr
            .iter()
            .filter_map(|item| item.get("text").and_then(|t| t.as_str()))
            .collect::<Vec<_>>()
            .join(""),
        _ => content.to_string(),
    }
}

#[derive(Serialize)]
struct ClaudeRequest {
    model: String,
    max_tokens: u32,
    messages: Vec<ClaudeMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    system: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    top_p: Option<f64>,
    stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    stop_sequences: Option<Vec<String>>,
}

#[derive(Serialize, Deserialize)]
struct ClaudeMessage {
    role: String,
    content: String,
}

#[derive(Deserialize)]
struct ClaudeResponse {
    id: String,
    content: Vec<ContentBlock>,
    stop_reason: Option<String>,
    usage: ClaudeUsage,
}

#[derive(Deserialize)]
struct ContentBlock {
    #[serde(rename = "type")]
    content_type: String,
    text: Option<String>,
}

#[derive(Deserialize)]
struct ClaudeUsage {
    input_tokens: u32,
    output_tokens: u32,
    #[serde(default)]
    cache_creation_input_tokens: u32,
    #[serde(default)]
    cache_read_input_tokens: u32,
}

// Claude SSE event types
#[derive(Deserialize)]
struct ClaudeStreamEvent {
    #[serde(rename = "type")]
    event_type: String,
    delta: Option<ClaudeStreamDelta>,
    usage: Option<ClaudeUsage>,
    message: Option<ClaudeStreamMessage>,
}

#[derive(Deserialize)]
struct ClaudeStreamDelta {
    #[serde(rename = "type")]
    delta_type: Option<String>,
    text: Option<String>,
    stop_reason: Option<String>,
}

#[derive(Deserialize)]
struct ClaudeStreamMessage {
    id: Option<String>,
}

#[async_trait]
impl Provider for ClaudeProvider {
    async fn chat(
        &self,
        api_key: &str,
        base_url: Option<&str>,
        request: &ChatRequest,
    ) -> Result<ChatResponse, ProviderError> {
        let claude_req = Self::to_claude_request(request);

        let resp = self
            .client
            .post(Self::url(base_url))
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01")
            .json(&claude_req)
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

        let claude_resp: ClaudeResponse = resp.json().await.map_err(|e| ProviderError {
            status: 502,
            message: format!("Failed to parse response: {e}"),
            retryable: false,
        })?;

        Ok(Self::to_chat_response(claude_resp, &request.model))
    }

    async fn chat_stream(
        &self,
        api_key: &str,
        base_url: Option<&str>,
        request: &ChatRequest,
    ) -> Result<SseStream, ProviderError> {
        let mut claude_req = Self::to_claude_request(request);
        claude_req.stream = true;

        let resp = self
            .client
            .post(Self::url(base_url))
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01")
            .json(&claude_req)
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

        let model = request.model.clone();
        let raw_stream = resp.bytes_stream();

        // Transform Claude SSE into OpenAI SSE format
        let mut buffer = String::new();
        let mut msg_id = String::from("chatcmpl-claude");
        let created = chrono::Utc::now().timestamp();

        let transformed = raw_stream.map(move |chunk| {
            let chunk = chunk?;
            let text = String::from_utf8_lossy(&chunk);
            buffer.push_str(&text);

            let mut output = String::new();

            while let Some(pos) = buffer.find("\n\n") {
                let event_block = buffer[..pos].to_string();
                buffer = buffer[pos + 2..].to_string();

                let mut event_type = String::new();
                let mut data_str = String::new();

                for line in event_block.lines() {
                    if let Some(et) = line.strip_prefix("event: ") {
                        event_type = et.to_string();
                    } else if let Some(d) = line.strip_prefix("data: ") {
                        data_str = d.to_string();
                    }
                }

                if data_str.is_empty() {
                    continue;
                }

                if let Ok(event) = serde_json::from_str::<ClaudeStreamEvent>(&data_str) {
                    if let Some(msg) = &event.message {
                        if let Some(id) = &msg.id {
                            msg_id = format!("chatcmpl-{id}");
                        }
                    }

                    match event.event_type.as_str() {
                        "content_block_delta" => {
                            if let Some(delta) = &event.delta {
                                if let Some(text) = &delta.text {
                                    let chunk = ChatChunk {
                                        id: msg_id.clone(),
                                        object: "chat.completion.chunk".to_string(),
                                        created,
                                        model: model.clone(),
                                        choices: vec![ChunkChoice {
                                            index: 0,
                                            delta: ChunkDelta {
                                                role: None,
                                                content: Some(text.clone()),
                                            },
                                            finish_reason: None,
                                        }],
                                        usage: None,
                                    };
                                    if let Ok(json) = serde_json::to_string(&chunk) {
                                        output.push_str(&format!("data: {json}\n\n"));
                                    }
                                }
                            }
                        }
                        "message_delta" => {
                            if let Some(delta) = &event.delta {
                                let finish = delta.stop_reason.as_deref().map(|r| match r {
                                    "end_turn" => "stop".to_string(),
                                    "max_tokens" => "length".to_string(),
                                    other => other.to_string(),
                                });
                                let chunk = ChatChunk {
                                    id: msg_id.clone(),
                                    object: "chat.completion.chunk".to_string(),
                                    created,
                                    model: model.clone(),
                                    choices: vec![ChunkChoice {
                                        index: 0,
                                        delta: ChunkDelta::default(),
                                        finish_reason: finish,
                                    }],
                                    usage: event.usage.map(|u| Usage {
                                        prompt_tokens: u.input_tokens,
                                        completion_tokens: u.output_tokens,
                                        total_tokens: u.input_tokens + u.output_tokens,
                                        cache_creation_tokens: u.cache_creation_input_tokens,
                                        cache_read_tokens: u.cache_read_input_tokens,
                                    }),
                                };
                                if let Ok(json) = serde_json::to_string(&chunk) {
                                    output.push_str(&format!("data: {json}\n\n"));
                                }
                            }
                        }
                        "message_stop" => {
                            output.push_str("data: [DONE]\n\n");
                        }
                        _ => {}
                    }
                }
            }

            Ok(Bytes::from(output))
        });

        Ok(Box::pin(transformed))
    }

    fn name(&self) -> &'static str {
        "claude"
    }
}
