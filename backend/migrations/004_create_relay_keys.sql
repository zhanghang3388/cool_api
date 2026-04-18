-- Relay keys (client-facing API keys)
CREATE TABLE relay_keys (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name           VARCHAR(128) NOT NULL,
    key_hash       VARCHAR(255) NOT NULL,
    key_prefix     VARCHAR(16) NOT NULL,
    is_active      BOOLEAN NOT NULL DEFAULT true,
    rpm_limit      INT,
    allowed_models JSONB,
    expires_at     TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_relay_keys_user ON relay_keys(user_id);
CREATE INDEX idx_relay_keys_prefix ON relay_keys(key_prefix);
