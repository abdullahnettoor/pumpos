ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "access_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizations" ALTER COLUMN "subscription_plan" SET DEFAULT 'CORE';--> statement-breakpoint
ALTER TABLE "organizations" ALTER COLUMN "subscription_status" SET DEFAULT 'ACTIVE';--> statement-breakpoint
UPDATE "organizations" SET "subscription_plan" = 'CORE' WHERE upper("subscription_plan") = 'CORE';--> statement-breakpoint
UPDATE "organizations" SET "subscription_status" = CASE upper("subscription_status")
    WHEN 'ACTIVE' THEN 'ACTIVE'
    WHEN 'DEACTIVATED' THEN 'SUSPENDED'
    WHEN 'REVOKED' THEN 'SUSPENDED'
    ELSE upper("subscription_status")
  END;
