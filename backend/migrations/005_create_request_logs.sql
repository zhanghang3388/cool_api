-- Request logs
CREATE TABLE request_logs (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID REFERENCES users(id),
    relay_key_id      UUID REFERENCES relay_keys(id),
    provider_key_id   UUID REFERENCES provider_keys(id),
    channel_id        UUID REFERENCES channels(id),
    model             VARCHAR(128) NOT NULL,
    method            VARCHAR(16) NOT NULL,
    path              VARCHAR(256) NOT NULL,
    status_code       INT NOT NULL,
    prompt_tokens     INT NOT NULL DEFAULT 0,
    completion_tokens INT NOT NULL DEFAULT 0,
    total_tokens      INT NOT NULL DEFAULT 0,
    cost              BIGINT NOT NULL DEFAULT 0,
    latency_ms        INT NOT NULL,
    is_stream         BOOLEAN NOT NULL DEFAULT false,
    error_message     TEXT,
    ip_address        VARCHAR(45),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_request_logs_user_created ON request_logs(user_id, created_at DESC);
CREATE INDEX idx_request_logs_created ON request_logs(created_at DESC);
