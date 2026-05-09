-- Seed the response-cache configuration row. The application reads/writes this
-- JSONB on every forwarded request, so we initialize the defaults here rather
-- than special-casing a NULL row at read time.

INSERT INTO system_settings (key, value)
VALUES (
    'cache',
    '{"enabled": true, "ttl_seconds": 3600, "recent_keys_limit": 200}'::jsonb
)
ON CONFLICT (key) DO NOTHING;
