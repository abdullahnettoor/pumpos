ALTER TABLE "idempotency_keys" DROP CONSTRAINT "idempotency_keys_idempotency_key_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_keys_org_key_uniq" ON "idempotency_keys" USING btree ("organization_id","idempotency_key");
