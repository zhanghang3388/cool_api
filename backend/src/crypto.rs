//! Symmetric encryption for channel API keys at rest.
//!
//! Format: `base64(nonce || ciphertext)`. Nonce is 12 random bytes per ciphertext,
//! key is derived from the base64-encoded `ENCRYPTION_KEY` env var (must decode to
//! exactly 32 bytes).
//!
//! The `Cipher` is cheap to clone; stash it on `AppState` and call `encrypt` /
//! `decrypt` as needed.

use aes_gcm::aead::{Aead, KeyInit, OsRng};
use aes_gcm::{AeadCore, Aes256Gcm, Key, Nonce};
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;

use crate::error::{AppError, AppResult};

#[derive(Clone)]
pub struct Cipher {
    inner: Aes256Gcm,
}

impl Cipher {
    pub fn from_base64_key(key_b64: &str) -> anyhow::Result<Self> {
        let bytes = B64
            .decode(key_b64.trim())
            .map_err(|e| anyhow::anyhow!("ENCRYPTION_KEY is not valid base64: {e}"))?;
        if bytes.len() != 32 {
            anyhow::bail!(
                "ENCRYPTION_KEY must decode to 32 bytes (got {})",
                bytes.len()
            );
        }
        let key = Key::<Aes256Gcm>::from_slice(&bytes);
        Ok(Self {
            inner: Aes256Gcm::new(key),
        })
    }

    pub fn encrypt(&self, plaintext: &str) -> AppResult<String> {
        let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
        let ct = self
            .inner
            .encrypt(&nonce, plaintext.as_bytes())
            .map_err(|e| AppError::Internal(format!("encrypt: {e}")))?;
        let mut out = Vec::with_capacity(nonce.len() + ct.len());
        out.extend_from_slice(&nonce);
        out.extend_from_slice(&ct);
        Ok(B64.encode(out))
    }

    pub fn decrypt(&self, blob_b64: &str) -> AppResult<String> {
        let bytes = B64
            .decode(blob_b64)
            .map_err(|e| AppError::Internal(format!("decrypt b64: {e}")))?;
        if bytes.len() < 12 {
            return Err(AppError::Internal("ciphertext too short".into()));
        }
        let (nonce_bytes, ct) = bytes.split_at(12);
        let nonce = Nonce::from_slice(nonce_bytes);
        let pt = self
            .inner
            .decrypt(nonce, ct)
            .map_err(|_| AppError::Internal("decrypt: auth failed".into()))?;
        String::from_utf8(pt).map_err(|e| AppError::Internal(format!("decrypt utf8: {e}")))
    }
}

/// Display a masked preview of a secret: first 4 + "..." + last 4 when the
/// secret is long enough, otherwise a generic mask.
pub fn mask_secret(raw: &str) -> String {
    let len = raw.chars().count();
    if len <= 12 {
        return "****".to_string();
    }
    let head: String = raw.chars().take(4).collect();
    let tail: String = raw.chars().rev().take(4).collect::<String>().chars().rev().collect();
    format!("{head}...{tail}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_generates_distinct_ciphertexts() {
        // 32 bytes of 0x42 base64-encoded
        let key = B64.encode([0x42u8; 32]);
        let c = Cipher::from_base64_key(&key).unwrap();

        let plaintext = "sk-proj-supersecret-1234567890";
        let a = c.encrypt(plaintext).unwrap();
        let b = c.encrypt(plaintext).unwrap();
        assert_ne!(a, b, "distinct nonces should yield distinct ciphertexts");
        assert_eq!(c.decrypt(&a).unwrap(), plaintext);
        assert_eq!(c.decrypt(&b).unwrap(), plaintext);
    }

    #[test]
    fn tampering_fails_auth() {
        let key = B64.encode([0x42u8; 32]);
        let c = Cipher::from_base64_key(&key).unwrap();
        let ct = c.encrypt("hello").unwrap();
        let mut bytes = B64.decode(&ct).unwrap();
        // flip a byte in ciphertext portion
        let last = bytes.len() - 1;
        bytes[last] ^= 1;
        let tampered = B64.encode(bytes);
        assert!(c.decrypt(&tampered).is_err());
    }

    #[test]
    fn mask_short_and_long() {
        assert_eq!(mask_secret("sk-xyz"), "****");
        assert_eq!(mask_secret("sk-proj-1234567890abcd"), "sk-p...abcd");
    }
}
