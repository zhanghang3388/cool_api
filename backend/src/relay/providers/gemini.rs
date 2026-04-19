use async_trait::async_trait;
use bytes::Bytes;
use futures::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};

use super::{
    ChatChoice, ChatChunk, ChatMessage, ChatRequest, ChatResponse, ChunkChoice, ChunkDelta,
    Provider, ProviderError, SseStream, Usage,
};

pub struct GeminiProvider {
    client: Client,
}

impl GeminiProvider {
    pub fn new() -> Self {
        Self {
            client: Client::new(),
        }
    }

    fn url(base_url: Option<&str>, model: &str, stream: bool) -> String {
        let base = base_url.unwrap_or("https://generativelanguage.googleapis.com/v1beta");
        let base = base.trim_end_matches('/');
        let method = if stream { "streamGenerateContent?alt=sse" } else { "generateContent" };
        format!("{base}/models/{model}:{method}")
    }

    fn to_gemini_request(req: &ChatRequest) -> GeminiRequest {
        let mut system_instruction = None;
        let mut contents = Vec::new();

        for msg in &req.messages {
            if msg.role == "system" {
                system_instruction = Some(GeminiContent {
                    role: "user".to_string(),
                    parts: vec![GeminiPart {
                        text: content_to_string(&msg.content),
                    }],
                });
            } else {
                let role = match msg.role.as_str() {
                    "assistant" => "model",
                    _ => "user",
                };
                contents.push(GeminiContent {
                    role: role.to_string(),
                    parts: vec![GeminiPart {
                        text: content_to_string(&msg.content),
                    }],
                });
            }
        }

        let mut config = GenerationConfig::default();
        if let Some(t) = req.temperature {
            config.temperature = Some(t);
        }
        if let Some(m) = req.max_tokens {
            config.max_output_tokens = Some(m);
        }
        if let Some(p) = req.top_p {
            config.top_p = Some(p);
        }

        GeminiRequest {
            contents,
            system_instruction,
            generation_config: Some(config),
        }
    }

    fn to_chat_response(resp: GeminiResponse, model: &str) -> ChatResponse {
        let candidate = resp.candidates.first();
        let content = candidate
            .and_then(|c| c.content.parts.first())
            .map(|p| p.text.clone())
            .unwrap_or_default();

        let finish_reason = candidate
            .and_then(|c| c.finish_reason.as_deref())
            .map(|r| match r {
                "STOP" => "stop".to_string(),
                "MAX_TOKENS" => "length".to_string(),
                other => other.to_lowercase(),
            });

        let usage = resp.usage_metadata.map(|u| Usage {
            prompt_tokens: u.prompt_token_count.unwrap_or(0),
            completion_tokens: u.candidates_token_count.unwrap_or(0),
            total_tokens: u.total_token_count.unwrap_or(0),
            cache_creation_tokens: 0,
            cache_read_tokens: 0,
        });

        ChatResponse {
            id: format!("chatcmpl-gemini-{}", uuid::Uuid::new_v4()),
            object: "chat.completion".to_string(),
            created: chrono::Utc::now().timestamp(),
            model: model.to_string(),
            choices: vec![ChatChoice {
                index: 0,
                message: ChatMessage {
                    role: "assistant".to_string(),
                    content: serde_json::Value::String(content),
                },
                finish_reason,
            }],
            usage,
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
struct GeminiRequest {
    contents: Vec<GeminiContent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    system_instruction: Option<GeminiContent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    generation_config: Option<GenerationConfig>,
}

#[derive(Serialize, Deserialize)]
struct GeminiContent {
    role: String,
    parts: Vec<GeminiPart>,
}

#[derive(Serialize, Deserialize)]
struct GeminiPart {
    text: String,
}

#[derive(Serialize, Default)]
struct GenerationConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_output_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    top_p: Option<f64>,
}

#[derive(Deserialize)]
struct GeminiResponse {
    candidates: Vec<GeminiCandidate>,
    #[serde(rename = "usageMetadata")]
    usage_metadata: Option<GeminiUsage>,
}

#[derive(Deserialize)]
struct GeminiCandidate {
    content: GeminiContent,
    #[serde(rename = "finishReason")]
    finish_reason: Option<String>,
}

#[derive(Deserialize)]
struct GeminiUsage {
    #[serde(rename = "promptTokenCount")]
    prompt_token_count: Option<u32>,
    #[serde(rename = "candidatesTokenCount")]
    candidates_token_count: Option<u32>,
    #[serde(rename = "totalTokenCount")]
    total_token_count: Option<u32>,
}

#[async_trait]
impl Provider for GeminiProvider {
    async fn chat(
        &self,
        api_key: &str,
        base_url: Option<&str>,
        request: &ChatRequest,
    ) -> Result<ChatResponse, ProviderError> {
        let gemini_req = Self::to_gemini_request(request);
        let url = format!("{}&key={api_key}", Self::url(base_url, &request.model, false));

        let resp = self
            .client
            .post(&url)
            .json(&gemini_req)
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

        let gemini_resp: GeminiResponse = resp.json().await.map_err(|e| ProviderError {
            status: 502,
            message: format!("Failed to parse response: {e}"),
            retryable: false,
        })?;

        Ok(Self::to_chat_response(gemini_resp, &request.model))
    }

    async fn chat_stream(
        &self,
        api_key: &str,
        base_url: Option<&str>,
        request: &ChatRequest,
    ) -> Result<SseStream, ProviderError> {
        let gemini_req = Self::to_gemini_request(request);
        let url = format!("{}&key={api_key}", Self::url(base_url, &request.model, true));

        let resp = self
            .client
            .post(&url)
            .json(&gemini_req)
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
        let msg_id = format!("chatcmpl-gemini-{}", uuid::Uuid::new_v4());
        let created = chrono::Utc::now().timestamp();

        let mut buffer = String::new();

        let transformed = raw_stream.map(move |chunk| {
            let chunk = chunk?;
            let text = String::from_utf8_lossy(&chunk);
            buffer.push_str(&text);

            let mut output = String::new();

            // Gemini SSE: "data: {json}\n\n"
            while let Some(pos) = buffer.find("\n\n") {
                let line = buffer[..pos].to_string();
                buffer = buffer[pos + 2..].to_string();

                let data_str = line.strip_prefix("data: ").unwrap_or(&line);
                if data_str.is_empty() {
                    continue;
                }

                if let Ok(gemini_resp) = serde_json::from_str::<GeminiResponse>(data_str) {
                    let candidate = gemini_resp.candidates.first();
                    let text = candidate
                        .and_then(|c| c.content.parts.first())
                        .map(|p| p.text.clone());

                    let finish = candidate
                        .and_then(|c| c.finish_reason.as_deref())
                        .and_then(|r| match r {
                            "STOP" => Some("stop".to_string()),
                            "MAX_TOKENS" => Some("length".to_string()),
                            _ => None,
                        });

                    let chunk = ChatChunk {
                        id: msg_id.clone(),
                        object: "chat.completion.chunk".to_string(),
                        created,
                        model: model.clone(),
                        choices: vec![ChunkChoice {
                            index: 0,
                            delta: ChunkDelta {
                                role: None,
                                content: text,
                            },
                            finish_reason: finish,
                        }],
                        usage: gemini_resp.usage_metadata.map(|u| Usage {
                            prompt_tokens: u.prompt_token_count.unwrap_or(0),
                            completion_tokens: u.candidates_token_count.unwrap_or(0),
                            total_tokens: u.total_token_count.unwrap_or(0),
                            cache_creation_tokens: 0,
                            cache_read_tokens: 0,
                        }),
                    };
                    if let Ok(json) = serde_json::to_string(&chunk) {
                        output.push_str(&format!("data: {json}\n\n"));
                    }
                }
            }

            Ok(Bytes::from(output))
        });

        Ok(Box::pin(transformed))
    }

    fn name(&self) -> &'static str {
        "gemini"
    }
}
