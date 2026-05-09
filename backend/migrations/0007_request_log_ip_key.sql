-- Enrich request_logs with the caller identity + source IP so the usage
-- page can join / group by token and expose the client address per request.
-- Both columns are nullable: pre-existing rows and future internal callers
-- (e.g. the failed-forward bookkeeping path) can still insert without them.

ALTER TABLE request_logs
    ADD COLUMN api_key_id BIGINT REFERENCES api_keys(id) ON DELETE SET NULL,
    ADD COLUMN client_ip  INET;

CREATE INDEX idx_request_logs_api_key_id ON request_logs(api_key_id)
    WHERE api_key_id IS NOT NULL;
