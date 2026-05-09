-- Prompt-caching write price: upstreams bill creation of a cached prefix at
-- a premium (Anthropic ~1.25× input), reads at a discount. The read price
-- has its own column (cache_read_price_cents); add a matching write column
-- and seed plausible defaults for existing catalog entries.

ALTER TABLE models
    ADD COLUMN cache_write_price_cents BIGINT;

-- Anthropic models: 1.25× input.
UPDATE models SET cache_write_price_cents = ROUND(input_price_cents * 1.25)
WHERE provider = 'Anthropic';

-- OpenAI models: their prompt caching has no creation fee (they only bill
-- the read side at a discount), so leaving NULL is correct.
-- Other providers (Google, DeepSeek) similarly default to NULL until known.

-- request_logs: track cache-creation tokens separately from reads so usage
-- pages can distinguish "wrote 20k token cache" from "hit 20k cached tokens".
ALTER TABLE request_logs
    ADD COLUMN cache_creation_tokens INT NOT NULL DEFAULT 0;
