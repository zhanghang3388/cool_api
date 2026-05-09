//! Thin wrapper around the EPay (彩虹易支付 / KoalaPay 等) HTTP protocol.
//!
//! Spec summary (shared across Chinese "易支付" clones):
//! 1. Build a flat `key=value` params map (excluding `sign` and `sign_type`,
//!    plus empty values).
//! 2. Sort keys ascendingly (byte order).
//! 3. Concatenate as `k1=v1&k2=v2...` — no URL-encoding here, values are raw.
//! 4. Append the merchant key directly (NO `&key=...`, just concat).
//! 5. `sign = md5(concat).to_hex_lower()`; `sign_type = "MD5"`.
//!
//! Sign verification is the same process, using the receiver's map minus
//! `sign` and `sign_type`.

use std::collections::BTreeMap;

/// Build the signing string exactly as described above.
fn signing_string(params: &BTreeMap<String, String>) -> String {
    let mut first = true;
    let mut out = String::new();
    for (k, v) in params {
        if k == "sign" || k == "sign_type" {
            continue;
        }
        if v.is_empty() {
            continue;
        }
        if !first {
            out.push('&');
        }
        first = false;
        out.push_str(k);
        out.push('=');
        out.push_str(v);
    }
    out
}

pub fn sign(params: &BTreeMap<String, String>, merchant_key: &str) -> String {
    use md5::{Digest, Md5};
    let mut base = signing_string(params);
    base.push_str(merchant_key);
    let digest = Md5::digest(base.as_bytes());
    hex::encode(digest).to_lowercase()
}

/// Returns true when `sign` in the map matches what we'd compute for the rest.
pub fn verify(params: &BTreeMap<String, String>, merchant_key: &str) -> bool {
    let Some(provided) = params.get("sign") else {
        return false;
    };
    let expected = sign(params, merchant_key);
    // Constant-time-ish comparison on the hex digest.
    if provided.len() != expected.len() {
        return false;
    }
    provided
        .as_bytes()
        .iter()
        .zip(expected.as_bytes().iter())
        .fold(0u8, |acc, (a, b)| acc | (a ^ b))
        == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    fn kv(xs: &[(&str, &str)]) -> BTreeMap<String, String> {
        xs.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect()
    }

    #[test]
    fn skip_sign_fields_and_empty() {
        let m = kv(&[
            ("pid", "1001"),
            ("type", "alipay"),
            ("name", ""),
            ("sign", "ignored"),
            ("sign_type", "MD5"),
        ]);
        assert_eq!(signing_string(&m), "pid=1001&type=alipay");
    }

    #[test]
    fn sign_is_stable_and_verify_roundtrip() {
        let mut m = kv(&[
            ("pid", "1001"),
            ("out_trade_no", "abc123"),
            ("money", "1.00"),
            ("type", "alipay"),
        ]);
        let key = "merchant-secret";
        let s = sign(&m, key);
        m.insert("sign".into(), s.clone());
        m.insert("sign_type".into(), "MD5".into());
        assert!(verify(&m, key));

        // Tampering the amount breaks verification.
        m.insert("money".into(), "9999.00".into());
        assert!(!verify(&m, key));
    }

    #[test]
    fn sign_is_order_invariant() {
        let a = kv(&[("b", "2"), ("a", "1")]);
        let b = kv(&[("a", "1"), ("b", "2")]);
        assert_eq!(sign(&a, "k"), sign(&b, "k"));
    }
}
