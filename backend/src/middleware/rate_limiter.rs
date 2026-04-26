use dashmap::DashMap;
use std::collections::VecDeque;
use std::sync::Arc;
use std::time::{Duration, Instant};
use uuid::Uuid;

/// Sliding window rate limiter using DashMap for concurrent access.
#[derive(Clone)]
pub struct RateLimiter {
    /// Key -> timestamps of recent requests
    windows: Arc<DashMap<String, VecDeque<Instant>>>,
}

impl RateLimiter {
    pub fn new() -> Self {
        Self {
            windows: Arc::new(DashMap::new()),
        }
    }

    /// Check if a request is allowed under the given RPM limit.
    /// Returns Ok(()) if allowed, Err(retry_after_secs) if rate limited.
    pub fn check_rpm(&self, key: &str, rpm_limit: u32) -> Result<(), u64> {
        let now = Instant::now();
        let window = Duration::from_secs(60);

        let mut entry = self
            .windows
            .entry(key.to_string())
            .or_insert_with(VecDeque::new);
        let timestamps = entry.value_mut();

        // Remove expired entries
        while timestamps
            .front()
            .is_some_and(|t| now.duration_since(*t) > window)
        {
            timestamps.pop_front();
        }

        if timestamps.len() >= rpm_limit as usize {
            // Calculate retry-after
            let oldest = timestamps.front().unwrap();
            let retry_after = window.saturating_sub(now.duration_since(*oldest)).as_secs() + 1;
            return Err(retry_after);
        }

        timestamps.push_back(now);
        Ok(())
    }

    /// Check RPM for a user
    pub fn check_user_rpm(&self, user_id: Uuid, rpm: u32) -> Result<(), u64> {
        self.check_rpm(&format!("user:{user_id}"), rpm)
    }

    /// Check RPM for a relay key
    pub fn check_key_rpm(&self, key_id: Uuid, rpm: u32) -> Result<(), u64> {
        self.check_rpm(&format!("key:{key_id}"), rpm)
    }

    /// Check global RPM
    pub fn check_global_rpm(&self, rpm: u32) -> Result<(), u64> {
        self.check_rpm("global", rpm)
    }

    /// Periodic cleanup of stale entries (call from a background task)
    pub fn cleanup(&self) {
        let now = Instant::now();
        let window = Duration::from_secs(60);
        self.windows.retain(|_, v| {
            while v.front().is_some_and(|t| now.duration_since(*t) > window) {
                v.pop_front();
            }
            !v.is_empty()
        });
    }
}
