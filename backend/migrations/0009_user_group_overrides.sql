-- Group access model: per-user group lists replace the single users.group_id.
--
-- Effective groups for a regular user =
--     (system_settings.default_user_groups ∪ user_group_overrides.add)
--   −  user_group_overrides.remove
-- intersected with `groups WHERE enabled = TRUE`.
--
-- Admins bypass this and see all enabled groups.
--
-- This is a clean cut: no backfill from users.group_id (project has no
-- production users yet). Existing api_keys keep their group_id intact.

CREATE TABLE user_group_overrides (
    user_id   BIGINT NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
    group_id  BIGINT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    mode      TEXT   NOT NULL CHECK (mode IN ('add', 'remove')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, group_id)
);

CREATE INDEX idx_user_group_overrides_user ON user_group_overrides(user_id);

-- Initialize empty array; admin can fill it via /admin/settings/default-user-groups
INSERT INTO system_settings (key, value)
VALUES ('default_user_groups', '[]'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Drop the now-vestigial column. Routing/billing already use api_keys.group_id.
DROP INDEX IF EXISTS idx_users_group_id;
ALTER TABLE users DROP COLUMN group_id;
