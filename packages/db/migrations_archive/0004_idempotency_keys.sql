-- Idempotency key store: caches mutating-request responses by a client-supplied
-- Idempotency-Key so retries/offline replays return the original response.
CREATE TABLE IF NOT EXISTS "idempotency_keys" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "idempotency_key" varchar(255) NOT NULL UNIQUE,
  "request_path" varchar(255),
  "response_status" integer,
  "response_body" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idempotency_keys_org_idx" ON "idempotency_keys" ("organization_id");
