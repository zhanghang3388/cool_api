-- Model pricing configuration
CREATE TABLE model_pricing (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model        VARCHAR(128) UNIQUE NOT NULL,
    provider     VARCHAR(32) NOT NULL,
    input_price  DOUBLE PRECISION NOT NULL,
    output_price DOUBLE PRECISION NOT NULL,
    multiplier   DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    is_active    BOOLEAN NOT NULL DEFAULT true,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_model_pricing_provider ON model_pricing(provider);
CREATE INDEX idx_model_pricing_active ON model_pricing(is_active);
