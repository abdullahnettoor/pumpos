ALTER TABLE "idempotency_keys" DROP CONSTRAINT "idempotency_keys_idempotency_key_unique";
CREATE UNIQUE INDEX "idempotency_keys_org_key_uniq" ON "idempotency_keys" ("organization_id", "idempotency_key");
