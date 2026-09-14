-- Scope idempotency keys per organization. The old global unique constraint is
-- named "idempotency_keys_idempotency_key_unique" on drizzle-managed databases
-- and "idempotency_keys_idempotency_key_key" on databases created from the
-- Supabase baseline, so drop whichever exists.
ALTER TABLE "idempotency_keys" DROP CONSTRAINT IF EXISTS "idempotency_keys_idempotency_key_unique";
ALTER TABLE "idempotency_keys" DROP CONSTRAINT IF EXISTS "idempotency_keys_idempotency_key_key";
CREATE UNIQUE INDEX IF NOT EXISTS "idempotency_keys_org_key_uniq" ON "idempotency_keys" ("organization_id", "idempotency_key");
