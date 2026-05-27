-- Multiple showcase groups per provider. The 0012 migration introduced
-- { "openai": <id|null>, "anthropic": <id|null> }; admins now want to surface
-- several pricing tiers for the same provider at once, so each slot becomes an
-- array. Order in the array is the display order on the landing page.

BEGIN;

UPDATE system_settings
   SET value = jsonb_build_object(
           'openai',
           CASE jsonb_typeof(value -> 'openai')
               WHEN 'number' THEN jsonb_build_array(value -> 'openai')
               WHEN 'array'  THEN value -> 'openai'
               ELSE '[]'::jsonb
           END,
           'anthropic',
           CASE jsonb_typeof(value -> 'anthropic')
               WHEN 'number' THEN jsonb_build_array(value -> 'anthropic')
               WHEN 'array'  THEN value -> 'anthropic'
               ELSE '[]'::jsonb
           END
       ),
       updated_at = NOW()
 WHERE key = 'landing_pricing_group_id';

INSERT INTO system_settings (key, value)
VALUES ('landing_pricing_group_id', '{"openai": [], "anthropic": []}'::jsonb)
ON CONFLICT (key) DO NOTHING;

COMMIT;
