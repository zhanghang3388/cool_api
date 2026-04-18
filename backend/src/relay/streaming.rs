use bytes::Bytes;
use futures::Stream;
use std::pin::Pin;
use std::sync::{Arc, Mutex};
use std::task::{Context, Poll};

use super::providers::ChatChunk;

/// Wraps an SSE byte stream and collects the streamed text content for token counting.
pub struct SseCollector {
    inner: Pin<Box<dyn Stream<Item = Result<Bytes, reqwest::Error>> + Send>>,
    collected: Arc<Mutex<StreamedContent>>,
}

#[derive(Default, Clone)]
pub struct StreamedContent {
    pub text: String,
    pub finish_reason: Option<String>,
    pub prompt_tokens: Option<u32>,
    pub completion_tokens: Option<u32>,
}

impl SseCollector {
    pub fn new(
        stream: Pin<Box<dyn Stream<Item = Result<Bytes, reqwest::Error>> + Send>>,
    ) -> (Self, Arc<Mutex<StreamedContent>>) {
        let collected = Arc::new(Mutex::new(StreamedContent::default()));
        let collector = Self {
            inner: stream,
            collected: collected.clone(),
        };
        (collector, collected)
    }
}

impl Stream for SseCollector {
    type Item = Result<Bytes, reqwest::Error>;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        match self.inner.as_mut().poll_next(cx) {
            Poll::Ready(Some(Ok(bytes))) => {
                // Parse SSE lines to extract content
                let text = String::from_utf8_lossy(&bytes);
                for line in text.lines() {
                    if let Some(data) = line.strip_prefix("data: ") {
                        if data == "[DONE]" {
                            continue;
                        }
                        if let Ok(chunk) = serde_json::from_str::<ChatChunk>(data) {
                            if let Some(choice) = chunk.choices.first() {
                                if let Some(content) = &choice.delta.content {
                                    if let Ok(mut c) = self.collected.lock() {
                                        c.text.push_str(content);
                                    }
                                }
                                if let Some(reason) = &choice.finish_reason {
                                    if let Ok(mut c) = self.collected.lock() {
                                        c.finish_reason = Some(reason.clone());
                                    }
                                }
                            }
                            if let Some(usage) = &chunk.usage {
                                if let Ok(mut c) = self.collected.lock() {
                                    c.prompt_tokens = Some(usage.prompt_tokens);
                                    c.completion_tokens = Some(usage.completion_tokens);
                                }
                            }
                        }
                    }
                }
                Poll::Ready(Some(Ok(bytes)))
            }
            other => other,
        }
    }
}
