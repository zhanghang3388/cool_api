-- Billing transactions
CREATE TABLE billing_transactions (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID NOT NULL REFERENCES users(id),
    type           VARCHAR(32) NOT NULL,
    amount         BIGINT NOT NULL,
    balance_after  BIGINT NOT NULL,
    description    TEXT,
    request_log_id UUID REFERENCES request_logs(id),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_billing_user_created ON billing_transactions(user_id, created_at DESC);
