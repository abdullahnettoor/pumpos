-- Sync live databases with schema.ts for columns that were added to the
-- baseline without an incremental migration (found via preview-API 500s:
-- idempotency reserve + shift-close tank dip variance inserts failed).
ALTER TABLE "idempotency_keys" ADD COLUMN IF NOT EXISTS "actor_id" uuid;
ALTER TABLE "idempotency_keys" ADD COLUMN IF NOT EXISTS "request_hash" varchar(64);
ALTER TABLE "stock_variances" ADD COLUMN IF NOT EXISTS "metadata" jsonb NOT NULL DEFAULT '{}';
