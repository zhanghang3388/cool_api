-- Add per-user RPM limit configuration
ALTER TABLE users ADD COLUMN rpm_limit INTEGER DEFAULT NULL;

-- Add constraint to ensure rpm_limit is non-negative if set
ALTER TABLE users
    ADD CONSTRAINT chk_users_rpm_limit_nonnegative
    CHECK (rpm_limit IS NULL OR rpm_limit >= 0) NOT VALID;

-- Add comment for documentation
COMMENT ON COLUMN users.rpm_limit IS 'Per-user rate limit in requests per minute. NULL means use system default.';
