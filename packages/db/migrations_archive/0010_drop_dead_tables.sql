-- Tech-debt cleanup: drop four tables that were superseded and carry no runtime
-- references in @pump/core or apps/api.
--   * business_events   -> replaced by the canonical append-only `events` log
--   * sync_events       -> sync/replay now flows through `events` + idempotency_keys
--   * document_sequences-> document numbering switched to monotonic timestamps
--   * audit_logs        -> audit trail is derived from `events`
-- CASCADE removes their FKs, indexes (0002_performance_indexes) and RLS policies.
--
-- DESTRUCTIVE: applying this permanently deletes any rows in these tables. They
-- are dead in code, but review before applying to a database that may hold
-- historical audit_logs you wish to retain.
DROP TABLE IF EXISTS "business_events" CASCADE;
DROP TABLE IF EXISTS "sync_events" CASCADE;
DROP TABLE IF EXISTS "document_sequences" CASCADE;
DROP TABLE IF EXISTS "audit_logs" CASCADE;
