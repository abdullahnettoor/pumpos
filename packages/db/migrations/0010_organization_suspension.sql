ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "suspended_at" timestamp with time zone;--> statement-breakpoint
-- Rows suspended while suspension lived in the status column keep their stop,
-- now recorded where paying an invoice cannot clear it.
UPDATE "organizations" SET "suspended_at" = now() WHERE upper("subscription_status") = 'SUSPENDED';
