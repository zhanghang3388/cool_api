ALTER TABLE request_logs ADD COLUMN cache_creation_tokens INT NOT NULL DEFAULT 0;
ALTER TABLE request_logs ADD COLUMN cache_read_tokens INT NOT NULL DEFAULT 0;
