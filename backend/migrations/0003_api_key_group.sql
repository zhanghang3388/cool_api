-- Each API key (token) is now scoped to a pricing group.
-- Requests authenticated by a token are routed/billed under the token's group,
-- not the owning user's group.

ALTER TABLE api_keys
    ADD COLUMN group_id BIGINT REFERENCES groups(id) ON DELETE RESTRICT;

UPDATE api_keys
   SET group_id = users.group_id
  FROM users
 WHERE api_keys.user_id = users.id;

ALTER TABLE api_keys
    ALTER COLUMN group_id SET NOT NULL;

CREATE INDEX idx_api_keys_group_id ON api_keys(group_id);
