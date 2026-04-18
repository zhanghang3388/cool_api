CREATE TABLE pricing_groups (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(64) NOT NULL,
    multiplier  DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE pricing_group_channels (
    group_id    UUID NOT NULL REFERENCES pricing_groups(id) ON DELETE CASCADE,
    channel_id  UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    PRIMARY KEY (group_id, channel_id)
);

ALTER TABLE relay_keys ADD COLUMN group_id UUID REFERENCES pricing_groups(id);
