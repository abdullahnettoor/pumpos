-- Scope idempotency keys per organization. Constraint names vary between
-- Drizzle-managed and Supabase-created databases, so drop whichever exists.
ALTER TABLE "idempotency_keys" DROP CONSTRAINT IF EXISTS "idempotency_keys_idempotency_key_unique";--> statement-breakpoint
ALTER TABLE "idempotency_keys" DROP CONSTRAINT IF EXISTS "idempotency_keys_idempotency_key_key";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idempotency_keys_org_key_uniq" ON "idempotency_keys" USING btree ("organization_id","idempotency_key");
