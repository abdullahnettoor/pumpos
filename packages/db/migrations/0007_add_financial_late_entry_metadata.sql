ALTER TABLE "collections" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_transactions" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "other_income" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_transactions" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
DELETE FROM "dssr_snapshots" snapshot
USING "business_days" day
WHERE snapshot."organization_id" = day."organization_id"
  AND snapshot."station_id" = day."station_id"
  AND snapshot."business_date" = day."business_date"
  AND day."status" = 'OPEN';
