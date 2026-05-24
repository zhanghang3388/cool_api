-- Persist the plaintext token alongside the hash so the UI can offer
-- "copy full token" from the keys list.
--
-- Trade-off acknowledged by the operator: a DB dump now leaks every token.
-- The hash column is kept since auth lookup is `WHERE key_hash = $1` and
-- changing that path isn't worth it.
--
-- Existing rows (from the brief window between 0010 and this migration)
-- have no recorded plaintext — the column is nullable, frontend falls back
-- to showing only the prefix for those rows. New keys always populate it.

ALTER TABLE api_keys ADD COLUMN key_plaintext TEXT;
