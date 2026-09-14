-- Bind idempotency replays to the original actor and request body: a reused
-- key from a different same-tenant user, or the same key with changed request
-- content, must conflict instead of replaying the cached response.
ALTER TABLE idempotency_keys ADD COLUMN IF NOT EXISTS actor_id uuid;
ALTER TABLE idempotency_keys ADD COLUMN IF NOT EXISTS request_hash varchar(64);
