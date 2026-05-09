-- Stage 7 seed: site / payment default settings + top_up_records ergonomics.

INSERT INTO system_settings (key, value)
VALUES (
    'site',
    '{"site_name": "AetherGate", "announcement": ""}'::jsonb
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO system_settings (key, value)
VALUES (
    'payment',
    '{"enabled": false, "provider": "epay", "pid": "", "key_encrypted": "", "api_url": "", "name": "易支付"}'::jsonb
)
ON CONFLICT (key) DO NOTHING;

-- Outbound payment records use `out_trade_no` to correlate with the provider.
-- Reusing external_txn_id would conflate "our id" with "their id".
ALTER TABLE top_up_records
    ADD COLUMN IF NOT EXISTS out_trade_no TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_top_up_out_trade_no
    ON top_up_records(out_trade_no)
    WHERE out_trade_no IS NOT NULL;
