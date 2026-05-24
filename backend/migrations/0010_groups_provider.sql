-- Scope groups to a provider so Anthropic and OpenAI each have their own set
-- of pricing tiers. A token (api_key) can now bind one group per provider via
-- the new `api_key_groups` mapping table — when a request comes in we pick
-- the group whose provider matches the call's provider.
--
-- The project has no production data yet, so this migration is destructive:
-- the legacy `default` group, all api_keys, request_logs, user overrides and
-- the system-wide default user groups list are wiped. Operators recreate
-- per-provider groups and rebind their tokens after the upgrade.

BEGIN;

-- 1) Wipe the tables that referenced groups via RESTRICT or that would carry
--    stale per-group state across the schema change.
TRUNCATE TABLE request_logs;
TRUNCATE TABLE user_group_overrides;
TRUNCATE TABLE api_keys RESTART IDENTITY CASCADE;

-- Reset the system-wide default-user-groups list — group ids in there will
-- not survive the swap to per-provider tiers.
UPDATE system_settings SET value = '[]'::jsonb, updated_at = NOW()
 WHERE key = 'default_user_groups';

-- And the landing-page showcase pointer (a single int now picks an arbitrary
-- per-provider group; admins repick after the upgrade).
DELETE FROM system_settings WHERE key = 'landing_pricing_group_id';

-- 2) Drop api_keys.group_id (RESTRICT FK to groups) — replaced by the
--    api_key_groups mapping table created below.
DROP INDEX IF EXISTS idx_api_keys_group_id;
ALTER TABLE api_keys DROP COLUMN group_id;

-- 3) Drop the pre-existing default group. With request_logs cleared above,
--    the RESTRICT FK from request_logs.group_id no longer holds it.
DELETE FROM groups WHERE name = 'default';

-- 4) Add the provider column. The channel_provider enum already covers
--    ('openai', 'anthropic') so we reuse it for consistency.
ALTER TABLE groups ADD COLUMN provider channel_provider;
-- No surviving rows expected, but if any custom groups slipped through, give
-- them a sentinel provider so the NOT NULL constraint below is satisfiable;
-- the operator can reassign them manually after migration.
UPDATE groups SET provider = 'anthropic' WHERE provider IS NULL;
ALTER TABLE groups ALTER COLUMN provider SET NOT NULL;

-- 5) Swap UNIQUE(name) for UNIQUE(provider, name) so the same name can be
--    used in different providers (e.g. an "aws" group under each).
ALTER TABLE groups DROP CONSTRAINT groups_name_key;
ALTER TABLE groups ADD CONSTRAINT groups_provider_name_key UNIQUE (provider, name);

CREATE INDEX idx_groups_provider ON groups(provider);

-- 6) Mapping table: a token may bind at most one group per provider. The
--    CHECK at the application layer ensures `groups.provider = api_key_groups.provider`
--    on insert; we also enforce it here via a trigger.
CREATE TABLE api_key_groups (
    api_key_id BIGINT NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
    provider   channel_provider NOT NULL,
    group_id   BIGINT NOT NULL REFERENCES groups(id) ON DELETE RESTRICT,
    PRIMARY KEY (api_key_id, provider)
);

CREATE INDEX idx_api_key_groups_group_id ON api_key_groups(group_id);

-- Guard against a token row referencing a group whose provider doesn't match
-- the row's provider column. The repo layer already validates on write, but
-- a DB-level trigger keeps the invariant true under any direct manipulation.
CREATE OR REPLACE FUNCTION api_key_groups_check_provider()
RETURNS TRIGGER AS $$
DECLARE
    g_provider channel_provider;
BEGIN
    SELECT provider INTO g_provider FROM groups WHERE id = NEW.group_id;
    IF g_provider IS NULL THEN
        RAISE EXCEPTION 'group % does not exist', NEW.group_id;
    END IF;
    IF g_provider <> NEW.provider THEN
        RAISE EXCEPTION 'group % provider % does not match api_key_groups.provider %',
            NEW.group_id, g_provider, NEW.provider;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER api_key_groups_provider_match
BEFORE INSERT OR UPDATE ON api_key_groups
FOR EACH ROW EXECUTE FUNCTION api_key_groups_check_provider();

COMMIT;
