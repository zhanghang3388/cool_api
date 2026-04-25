-- Harden data integrity and add indexes for hot authentication/statistics paths.

-- Relay key authentication is by key_hash, so make the lookup both fast and unambiguous.
CREATE UNIQUE INDEX IF NOT EXISTS idx_relay_keys_key_hash_unique ON relay_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_relay_keys_group ON relay_keys(group_id);
CREATE INDEX IF NOT EXISTS idx_relay_keys_active ON relay_keys(id) WHERE is_active = true;

-- Keep historical logs even when referenced runtime entities are deleted.
ALTER TABLE request_logs DROP CONSTRAINT IF EXISTS request_logs_user_id_fkey;
ALTER TABLE request_logs
    ADD CONSTRAINT request_logs_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE request_logs DROP CONSTRAINT IF EXISTS request_logs_relay_key_id_fkey;
ALTER TABLE request_logs
    ADD CONSTRAINT request_logs_relay_key_id_fkey
    FOREIGN KEY (relay_key_id) REFERENCES relay_keys(id) ON DELETE SET NULL;

ALTER TABLE request_logs DROP CONSTRAINT IF EXISTS request_logs_provider_key_id_fkey;
ALTER TABLE request_logs
    ADD CONSTRAINT request_logs_provider_key_id_fkey
    FOREIGN KEY (provider_key_id) REFERENCES provider_keys(id) ON DELETE SET NULL;

ALTER TABLE request_logs DROP CONSTRAINT IF EXISTS request_logs_channel_id_fkey;
ALTER TABLE request_logs
    ADD CONSTRAINT request_logs_channel_id_fkey
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE SET NULL;

ALTER TABLE billing_transactions DROP CONSTRAINT IF EXISTS billing_transactions_request_log_id_fkey;
ALTER TABLE billing_transactions
    ADD CONSTRAINT billing_transactions_request_log_id_fkey
    FOREIGN KEY (request_log_id) REFERENCES request_logs(id) ON DELETE SET NULL;

-- Indexes for admin dashboards, usage pages, and cache-hit-rate queries.
CREATE INDEX IF NOT EXISTS idx_request_logs_model_created ON request_logs(model, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_request_logs_status_created ON request_logs(status_code, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_request_logs_relay_key_created ON request_logs(relay_key_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_request_logs_recent_users ON request_logs(created_at DESC, user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_billing_created ON billing_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_provider_keys_provider_active_priority ON provider_keys(provider, is_active, priority, weight DESC);
CREATE INDEX IF NOT EXISTS idx_pricing_groups_active_name ON pricing_groups(is_active, name);

-- Case-insensitive uniqueness for login identifiers.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower_unique ON users (lower(username));
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower_unique ON users (lower(email));

-- Domain constraints. NOT VALID avoids failing on existing historical rows while still
-- protecting future inserts/updates.
ALTER TABLE users
    ADD CONSTRAINT chk_users_role CHECK (role IN ('admin', 'client')) NOT VALID,
    ADD CONSTRAINT chk_users_balance_nonnegative CHECK (balance >= 0) NOT VALID,
    ADD CONSTRAINT chk_users_quota_limit_nonnegative CHECK (quota_limit IS NULL OR quota_limit >= 0) NOT VALID;

ALTER TABLE provider_keys
    ADD CONSTRAINT chk_provider_keys_provider CHECK (provider IN ('openai', 'claude', 'gemini')) NOT VALID,
    ADD CONSTRAINT chk_provider_keys_weight_positive CHECK (weight > 0) NOT VALID,
    ADD CONSTRAINT chk_provider_keys_priority_nonnegative CHECK (priority >= 0) NOT VALID,
    ADD CONSTRAINT chk_provider_keys_rpm_limit_nonnegative CHECK (rpm_limit IS NULL OR rpm_limit >= 0) NOT VALID,
    ADD CONSTRAINT chk_provider_keys_tpm_limit_nonnegative CHECK (tpm_limit IS NULL OR tpm_limit >= 0) NOT VALID;

ALTER TABLE channels
    ADD CONSTRAINT chk_channels_strategy CHECK (strategy IN ('round_robin', 'priority', 'weighted')) NOT VALID;

ALTER TABLE relay_keys
    ADD CONSTRAINT chk_relay_keys_rpm_limit_nonnegative CHECK (rpm_limit IS NULL OR rpm_limit >= 0) NOT VALID;

ALTER TABLE request_logs
    ADD CONSTRAINT chk_request_logs_status_code_range CHECK (status_code BETWEEN 100 AND 599) NOT VALID,
    ADD CONSTRAINT chk_request_logs_prompt_tokens_nonnegative CHECK (prompt_tokens >= 0) NOT VALID,
    ADD CONSTRAINT chk_request_logs_completion_tokens_nonnegative CHECK (completion_tokens >= 0) NOT VALID,
    ADD CONSTRAINT chk_request_logs_total_tokens_nonnegative CHECK (total_tokens >= 0) NOT VALID,
    ADD CONSTRAINT chk_request_logs_cost_nonnegative CHECK (cost >= 0) NOT VALID,
    ADD CONSTRAINT chk_request_logs_latency_nonnegative CHECK (latency_ms >= 0) NOT VALID,
    ADD CONSTRAINT chk_request_logs_cache_creation_nonnegative CHECK (cache_creation_tokens >= 0) NOT VALID,
    ADD CONSTRAINT chk_request_logs_cache_read_nonnegative CHECK (cache_read_tokens >= 0) NOT VALID;

ALTER TABLE billing_transactions
    ADD CONSTRAINT chk_billing_transactions_type CHECK (type IN ('topup', 'usage', 'adjustment', 'refund')) NOT VALID;

ALTER TABLE model_pricing
    ADD CONSTRAINT chk_model_pricing_input_price_nonnegative CHECK (input_price >= 0) NOT VALID,
    ADD CONSTRAINT chk_model_pricing_output_price_nonnegative CHECK (output_price >= 0) NOT VALID,
    ADD CONSTRAINT chk_model_pricing_multiplier_nonnegative CHECK (multiplier >= 0) NOT VALID;

ALTER TABLE pricing_groups
    ADD CONSTRAINT chk_pricing_groups_multiplier_nonnegative CHECK (multiplier >= 0) NOT VALID;

-- Database-side updated_at maintenance for tables that expose the column.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_provider_keys_updated_at
    BEFORE UPDATE ON provider_keys
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_system_settings_updated_at
    BEFORE UPDATE ON system_settings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_model_pricing_updated_at
    BEFORE UPDATE ON model_pricing
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_pricing_groups_updated_at
    BEFORE UPDATE ON pricing_groups
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
