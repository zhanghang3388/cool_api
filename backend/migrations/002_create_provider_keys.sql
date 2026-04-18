-- Provider keys (third-party API keys)
CREATE TABLE provider_keys (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider      VARCHAR(32) NOT NULL,
    name          VARCHAR(128) NOT NULL,
    api_key       VARCHAR(512) NOT NULL,
    base_url      VARCHAR(512),
    is_active     BOOLEAN NOT NULL DEFAULT true,
    weight        INT NOT NULL DEFAULT 1,
    priority      INT NOT NULL DEFAULT 0,
    rpm_limit     INT,
    tpm_limit     INT,
    models        JSONB,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
