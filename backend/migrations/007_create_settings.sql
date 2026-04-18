-- Rate limit policies
CREATE TABLE rate_limit_policies (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          VARCHAR(128) NOT NULL,
    scope         VARCHAR(32) NOT NULL,
    target_id     UUID,
    rpm           INT,
    rpd           INT,
    tpm           INT,
    tpd           INT,
    is_active     BOOLEAN NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- System settings (key-value)
CREATE TABLE system_settings (
    key           VARCHAR(128) PRIMARY KEY,
    value         JSONB NOT NULL,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
