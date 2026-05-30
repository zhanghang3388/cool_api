-- Active liveness-probe history. Each row is one probe attempt against a
-- (channel, model) target, optionally scoped to the group the admin picked it
-- under. Written by the background prober (services/prober.rs), never by the
-- request-forwarding path — these rows do not represent billed traffic.
--
-- Rows are pruned by the prober to a bounded retention window, so this table
-- stays small and the sparkline/availability queries stay cheap.

CREATE TABLE channel_probes (
    id          BIGSERIAL PRIMARY KEY,
    channel_id  BIGINT NOT NULL,
    -- The group the target was configured under. NULL = "any group" (the
    -- channel isn't restricted). Kept denormalized so user-facing liveness
    -- can be filtered to a user's accessible groups without a join back.
    group_id    BIGINT,
    model       TEXT NOT NULL,
    ok          BOOLEAN NOT NULL,
    latency_ms  INT NOT NULL,
    -- Upstream HTTP status, when the request reached the upstream. NULL for
    -- transport/network failures that never got a response.
    status_code INT,
    detail      TEXT NOT NULL DEFAULT '',
    checked_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Latest-status / availability / timeline lookups are always "newest first for
-- this target", so index (channel, model) by descending time.
CREATE INDEX idx_channel_probes_target ON channel_probes (channel_id, model, checked_at DESC);

-- User-facing liveness aggregates by group within a window.
CREATE INDEX idx_channel_probes_group ON channel_probes (group_id, checked_at DESC);
