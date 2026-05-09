-- AetherGate initial schema
-- Monetary values are stored in cents (BIGINT) to avoid float precision issues.
-- Multipliers use NUMERIC(10, 4) for four decimal places (e.g. 0.4000).

-- -------- Enums --------
CREATE TYPE user_role AS ENUM ('admin', 'user');
CREATE TYPE user_status AS ENUM ('active', 'disabled');
CREATE TYPE channel_provider AS ENUM ('openai', 'anthropic');
CREATE TYPE channel_status AS ENUM ('active', 'warning', 'error', 'disabled');
CREATE TYPE request_status AS ENUM ('success', 'error', 'cached');
CREATE TYPE topup_status AS ENUM ('pending', 'success', 'failed', 'refunded');

-- -------- groups (pricing tiers) --------
CREATE TABLE groups (
    id           BIGSERIAL PRIMARY KEY,
    name         TEXT NOT NULL UNIQUE,             -- machine identifier, e.g. 'aws'
    label        TEXT NOT NULL,                    -- display name, e.g. 'AWS 分组'
    multiplier   NUMERIC(10, 4) NOT NULL DEFAULT 1.0,
    description  TEXT NOT NULL DEFAULT '',
    enabled      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------- users --------
CREATE TABLE users (
    id              BIGSERIAL PRIMARY KEY,
    username        TEXT NOT NULL UNIQUE,
    email           TEXT UNIQUE,
    password_hash   TEXT NOT NULL,
    role            user_role NOT NULL DEFAULT 'user',
    status          user_status NOT NULL DEFAULT 'active',
    group_id        BIGINT NOT NULL REFERENCES groups(id) ON DELETE RESTRICT,
    balance_cents   BIGINT NOT NULL DEFAULT 0,
    total_used_cents BIGINT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at   TIMESTAMPTZ,
    CONSTRAINT balance_non_negative CHECK (balance_cents >= 0)
);

CREATE INDEX idx_users_group_id ON users(group_id);

-- -------- channels (upstream providers) --------
CREATE TABLE channels (
    id                 BIGSERIAL PRIMARY KEY,
    name               TEXT NOT NULL,
    provider           channel_provider NOT NULL,
    base_url           TEXT NOT NULL,
    api_key_encrypted  TEXT NOT NULL,              -- aes-gcm ciphertext, base64
    priority           INT NOT NULL DEFAULT 0,
    weight             INT NOT NULL DEFAULT 1,
    enabled            BOOLEAN NOT NULL DEFAULT TRUE,
    status             channel_status NOT NULL DEFAULT 'active',
    allowed_models     TEXT[] NOT NULL DEFAULT '{}',
    allowed_group_ids  BIGINT[] NOT NULL DEFAULT '{}',  -- empty = all groups
    balance_cents      BIGINT,                     -- optional, reported by upstream
    last_test_at       TIMESTAMPTZ,
    last_error         TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_channels_enabled_priority ON channels(enabled, priority) WHERE enabled = TRUE;

-- -------- models (pricing catalog) --------
CREATE TABLE models (
    id                      BIGSERIAL PRIMARY KEY,
    name                    TEXT NOT NULL UNIQUE,
    provider                TEXT NOT NULL,          -- 'OpenAI' / 'Anthropic' (display)
    input_price_cents       BIGINT NOT NULL,        -- cents per 1M input tokens
    output_price_cents      BIGINT NOT NULL,        -- cents per 1M output tokens
    cache_read_price_cents  BIGINT,                 -- optional: cached input
    enabled                 BOOLEAN NOT NULL DEFAULT TRUE,
    description             TEXT NOT NULL DEFAULT '',
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------- api_keys (user forwarding credentials) --------
CREATE TABLE api_keys (
    id           BIGSERIAL PRIMARY KEY,
    user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name         TEXT NOT NULL DEFAULT '',
    key_prefix   TEXT NOT NULL,                    -- e.g. 'sk-abcd' for display
    key_hash     TEXT NOT NULL UNIQUE,             -- sha256 of full key
    enabled      BOOLEAN NOT NULL DEFAULT TRUE,
    last_used_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);

-- -------- request_logs (usage + billing audit trail) --------
CREATE TABLE request_logs (
    id                    BIGSERIAL PRIMARY KEY,
    user_id               BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel_id            BIGINT REFERENCES channels(id) ON DELETE SET NULL,
    group_id              BIGINT NOT NULL REFERENCES groups(id) ON DELETE RESTRICT,
    model_name            TEXT NOT NULL,
    prompt_tokens         INT NOT NULL DEFAULT 0,
    completion_tokens     INT NOT NULL DEFAULT 0,
    cached_tokens         INT NOT NULL DEFAULT 0,
    input_cost_cents      BIGINT NOT NULL DEFAULT 0,
    output_cost_cents     BIGINT NOT NULL DEFAULT 0,
    total_cost_cents      BIGINT NOT NULL DEFAULT 0,
    multiplier_applied    NUMERIC(10, 4) NOT NULL DEFAULT 1.0,
    latency_ms            INT NOT NULL DEFAULT 0,
    status                request_status NOT NULL,
    error_message         TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_request_logs_user_id ON request_logs(user_id, created_at DESC);
CREATE INDEX idx_request_logs_created_at_brin ON request_logs USING BRIN (created_at);

-- -------- top_up_records --------
CREATE TABLE top_up_records (
    id               BIGSERIAL PRIMARY KEY,
    user_id          BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount_cents     BIGINT NOT NULL,
    bonus_cents      BIGINT NOT NULL DEFAULT 0,
    method           TEXT NOT NULL DEFAULT 'manual',   -- 'alipay' | 'wechat' | 'manual'
    status           topup_status NOT NULL DEFAULT 'pending',
    external_txn_id  TEXT,
    note             TEXT NOT NULL DEFAULT '',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_top_up_records_user_id ON top_up_records(user_id, created_at DESC);

-- -------- system_settings (singleton KV for runtime config) --------
CREATE TABLE system_settings (
    key         TEXT PRIMARY KEY,
    value       JSONB NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
