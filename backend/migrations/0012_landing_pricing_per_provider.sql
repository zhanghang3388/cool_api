-- Landing-page pricing showcase becomes per-provider. Groups are scoped to a
-- single provider since 0010, so a single int can only describe one side of
-- the catalog — the other provider's models would render against the wrong
-- multiplier (or be hidden). We now store
--     { "openai": <id|null>, "anthropic": <id|null> }
-- and the public endpoint returns one section per filled slot.

BEGIN;

UPDATE system_settings
   SET value = (
           CASE
               WHEN value IS NULL OR jsonb_typeof(value) <> 'number' THEN
                   '{"openai": null, "anthropic": null}'::jsonb
               ELSE
                   jsonb_build_object(
                       'openai',
                       (SELECT to_jsonb(g.id) FROM groups g
                         WHERE g.id = (value)::text::bigint
                           AND g.provider = 'openai'),
                       'anthropic',
                       (SELECT to_jsonb(g.id) FROM groups g
                         WHERE g.id = (value)::text::bigint
                           AND g.provider = 'anthropic')
                   )
           END
       ),
       updated_at = NOW()
 WHERE key = 'landing_pricing_group_id';

INSERT INTO system_settings (key, value)
VALUES ('landing_pricing_group_id', '{"openai": null, "anthropic": null}'::jsonb)
ON CONFLICT (key) DO NOTHING;

COMMIT;
