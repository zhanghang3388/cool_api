use sqlx::PgPool;
use std::collections::HashMap;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

use crate::models::channel::Channel;
use crate::models::provider_key::ProviderKey;

use super::providers::claude::ClaudeProvider;
use super::providers::gemini::GeminiProvider;
use super::providers::openai::OpenAiProvider;
use super::providers::{ChatRequest, ChatResponse, Provider, ProviderError, SseStream};

pub struct Dispatcher {
    pool: PgPool,
    openai: OpenAiProvider,
    claude: ClaudeProvider,
    gemini: GeminiProvider,
    /// Round-robin counters per channel
    rr_counters: dashmap::DashMap<uuid::Uuid, AtomicUsize>,
}

pub struct DispatchResult {
    pub response: ChatResponse,
    pub provider_key_id: uuid::Uuid,
    pub channel_id: uuid::Uuid,
}

pub struct DispatchStreamResult {
    pub stream: SseStream,
    pub provider_key_id: uuid::Uuid,
    pub channel_id: uuid::Uuid,
}

impl Dispatcher {
    pub fn new(pool: PgPool) -> Self {
        Self {
            pool,
            openai: OpenAiProvider::new(),
            claude: ClaudeProvider::new(),
            gemini: GeminiProvider::new(),
            rr_counters: dashmap::DashMap::new(),
        }
    }

    fn get_provider(&self, provider: &str) -> &dyn Provider {
        match provider {
            "claude" => &self.claude,
            "gemini" => &self.gemini,
            _ => &self.openai,
        }
    }

    /// Find a channel matching the requested model
    async fn find_channel(&self, model: &str) -> Result<Channel, ProviderError> {
        let channels = Channel::list(&self.pool).await.map_err(|e| ProviderError {
            status: 500,
            message: format!("DB error: {e}"),
            retryable: false,
        })?;

        // Find first active channel whose pattern matches the model
        for ch in channels {
            if !ch.is_active {
                continue;
            }
            if model_matches(&ch.model_pattern, model) {
                return Ok(ch);
            }
        }

        Err(ProviderError {
            status: 404,
            message: format!("No channel configured for model: {model}"),
            retryable: false,
        })
    }

    /// Get ordered list of keys for a channel based on its strategy
    async fn get_ordered_keys(&self, channel: &Channel) -> Result<Vec<ProviderKey>, ProviderError> {
        let key_ids = Channel::get_key_ids(&self.pool, channel.id)
            .await
            .map_err(|e| ProviderError {
                status: 500,
                message: format!("DB error: {e}"),
                retryable: false,
            })?;

        if key_ids.is_empty() {
            return Err(ProviderError {
                status: 503,
                message: "No keys configured for this channel".into(),
                retryable: false,
            });
        }

        let mut keys = Vec::new();
        for kid in &key_ids {
            if let Some(key) = ProviderKey::find_by_id(&self.pool, *kid)
                .await
                .map_err(|e| ProviderError {
                    status: 500,
                    message: format!("DB error: {e}"),
                    retryable: false,
                })?
            {
                if key.is_active {
                    keys.push(key);
                }
            }
        }

        if keys.is_empty() {
            return Err(ProviderError {
                status: 503,
                message: "No active keys available".into(),
                retryable: false,
            });
        }

        match channel.strategy.as_str() {
            "priority" => {
                keys.sort_by_key(|k| k.priority);
            }
            "weighted" => {
                // Weighted random: build a list where each key appears `weight` times
                use rand::seq::SliceRandom;
                let mut weighted: Vec<ProviderKey> = Vec::new();
                for k in &keys {
                    for _ in 0..k.weight.max(1) {
                        weighted.push(k.clone());
                    }
                }
                weighted.shuffle(&mut rand::rng());
                // Deduplicate while preserving shuffled order
                let mut seen = std::collections::HashSet::new();
                keys = weighted
                    .into_iter()
                    .filter(|k| seen.insert(k.id))
                    .collect();
            }
            _ => {
                // round_robin
                let counter = self
                    .rr_counters
                    .entry(channel.id)
                    .or_insert_with(|| AtomicUsize::new(0));
                let idx = counter.fetch_add(1, Ordering::Relaxed) % keys.len();
                keys.rotate_left(idx);
            }
        }

        Ok(keys)
    }

    /// Dispatch a non-streaming request with failover
    pub async fn dispatch(
        &self,
        request: &ChatRequest,
    ) -> Result<DispatchResult, ProviderError> {
        let channel = self.find_channel(&request.model).await?;
        let keys = self.get_ordered_keys(&channel).await?;

        let mut last_err = None;
        for key in &keys {
            let provider = self.get_provider(&key.provider);
            match provider
                .chat(&key.api_key, key.base_url.as_deref(), request)
                .await
            {
                Ok(response) => {
                    return Ok(DispatchResult {
                        response,
                        provider_key_id: key.id,
                        channel_id: channel.id,
                    });
                }
                Err(e) => {
                    tracing::warn!(
                        "Provider {} key {} failed: {} (retryable: {})",
                        key.provider,
                        key.name,
                        e.message,
                        e.retryable
                    );
                    if !e.retryable {
                        return Err(e);
                    }
                    last_err = Some(e);
                }
            }
        }

        Err(last_err.unwrap_or(ProviderError {
            status: 503,
            message: "All provider keys exhausted".into(),
            retryable: false,
        }))
    }

    /// Dispatch a streaming request with failover
    pub async fn dispatch_stream(
        &self,
        request: &ChatRequest,
    ) -> Result<DispatchStreamResult, ProviderError> {
        let channel = self.find_channel(&request.model).await?;
        let keys = self.get_ordered_keys(&channel).await?;

        let mut last_err = None;
        for key in &keys {
            let provider = self.get_provider(&key.provider);
            match provider
                .chat_stream(&key.api_key, key.base_url.as_deref(), request)
                .await
            {
                Ok(stream) => {
                    return Ok(DispatchStreamResult {
                        stream,
                        provider_key_id: key.id,
                        channel_id: channel.id,
                    });
                }
                Err(e) => {
                    tracing::warn!(
                        "Provider {} key {} stream failed: {} (retryable: {})",
                        key.provider,
                        key.name,
                        e.message,
                        e.retryable
                    );
                    if !e.retryable {
                        return Err(e);
                    }
                    last_err = Some(e);
                }
            }
        }

        Err(last_err.unwrap_or(ProviderError {
            status: 503,
            message: "All provider keys exhausted".into(),
            retryable: false,
        }))
    }

    /// List available models from active channels
    pub async fn list_models(&self) -> Result<Vec<String>, ProviderError> {
        let channels = Channel::list(&self.pool).await.map_err(|e| ProviderError {
            status: 500,
            message: format!("DB error: {e}"),
            retryable: false,
        })?;

        let mut models = Vec::new();
        for ch in channels {
            if !ch.is_active {
                continue;
            }
            for pat in ch.model_pattern.split(',') {
                let pat = pat.trim();
                if !pat.is_empty() && !models.contains(&pat.to_string()) {
                    models.push(pat.to_string());
                }
            }
        }
        Ok(models)
    }
}

/// Strip bracket suffix like `[1m]` from model names (e.g. `claude-sonnet-4-6[1m]` → `claude-sonnet-4-6`)
pub fn strip_model_suffix(model: &str) -> &str {
    if let Some(idx) = model.find('[') {
        &model[..idx]
    } else {
        model
    }
}

/// Simple glob matching: supports trailing * wildcard and comma-separated patterns
fn model_matches(pattern: &str, model: &str) -> bool {
    let model_clean = strip_model_suffix(model);
    for pat in pattern.split(',') {
        let pat = pat.trim();
        if pat.is_empty() {
            continue;
        }
        if pat == model || pat == model_clean {
            return true;
        }
        if let Some(prefix) = pat.strip_suffix('*') {
            if model.starts_with(prefix) || model_clean.starts_with(prefix) {
                return true;
            }
        }
    }
    false
}
