-- Repair a snapshot/SQL divergence: migration 0008's generated SQL was
-- hand-pruned to the organization-access changes, dropping the ALTERs for
-- columns that its own snapshot (and schema.ts) already carried. Databases
-- provisioned from this chain therefore lack them (#268).
-- IF NOT EXISTS: environments patched by hand (preview) must no-op.
ALTER TABLE "idempotency_keys" ADD COLUMN IF NOT EXISTS "actor_id" uuid;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD COLUMN IF NOT EXISTS "request_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "stock_variances" ADD COLUMN IF NOT EXISTS "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;
