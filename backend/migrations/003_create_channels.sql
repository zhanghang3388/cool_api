-- Channels (model -> provider key routing)
CREATE TABLE channels (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          VARCHAR(128) NOT NULL,
    model_pattern VARCHAR(128) NOT NULL,
    strategy      VARCHAR(32) NOT NULL DEFAULT 'round_robin',
    is_active     BOOLEAN NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Channel <-> Provider Key mapping
CREATE TABLE channel_keys (
    channel_id    UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    key_id        UUID NOT NULL REFERENCES provider_keys(id) ON DELETE CASCADE,
    PRIMARY KEY (channel_id, key_id)
);
