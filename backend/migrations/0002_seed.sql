-- Seed default group + common model catalog.
-- The admin user is created at first startup via application code
-- (uses argon2 to hash the password from ADMIN_INITIAL_PASSWORD env var).

-- -------- groups --------
INSERT INTO groups (name, label, multiplier, description, enabled) VALUES
    ('default', '默认分组', 1.0000, '默认用户分组', TRUE);

-- -------- models (prices in cents per 1M tokens) --------
-- Anthropic
INSERT INTO models (name, provider, input_price_cents, output_price_cents, cache_read_price_cents, description) VALUES
    ('claude-opus-4-7',     'Anthropic', 1500, 7500, 150,  'Claude Opus 4.7'),
    ('claude-sonnet-4-6',   'Anthropic',  300, 1500,  30,  'Claude Sonnet 4.6'),
    ('claude-haiku-4-5',    'Anthropic',   80,  400,   8,  'Claude Haiku 4.5');

-- OpenAI
INSERT INTO models (name, provider, input_price_cents, output_price_cents, cache_read_price_cents, description) VALUES
    ('gpt-4o',              'OpenAI',    250, 1000, 125, 'GPT-4o'),
    ('gpt-4o-mini',         'OpenAI',     15,   60,   8, 'GPT-4o mini'),
    ('gpt-4-turbo',         'OpenAI',   1000, 3000, NULL, 'GPT-4 Turbo');

-- Google
INSERT INTO models (name, provider, input_price_cents, output_price_cents, cache_read_price_cents, description) VALUES
    ('gemini-2.5-pro',      'Google',    125, 1000, NULL, 'Gemini 2.5 Pro');

-- DeepSeek
INSERT INTO models (name, provider, input_price_cents, output_price_cents, cache_read_price_cents, description) VALUES
    ('deepseek-v3',         'DeepSeek',   27,  110,   7, 'DeepSeek V3');
