-- Phase C: Credit Sale by Vehicle
-- Adds vehicle linkage + quantity/unit_price detail to credit-sale flow.

-- Add vehicle_id to collections (links a credit chit to a specific vehicle)
ALTER TABLE "collections" ADD COLUMN "vehicle_id" uuid;
--> statement-breakpoint

ALTER TABLE "collections" ADD CONSTRAINT "collections_vehicle_id_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "customer_vehicles"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
--> statement-breakpoint

-- Add structured quantity + unit_price to customer_transactions ledger rows
-- (for per-vehicle analytics + future discount engine; both optional)
ALTER TABLE "customer_transactions" ADD COLUMN "quantity" numeric(12, 3);
--> statement-breakpoint
ALTER TABLE "customer_transactions" ADD COLUMN "unit_price" numeric(12, 2);
--> statement-breakpoint
ALTER TABLE "customer_transactions" ADD COLUMN "product_id" uuid;
--> statement-breakpoint

ALTER TABLE "customer_transactions" ADD CONSTRAINT "customer_transactions_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
--> statement-breakpoint

-- Indexes for vehicle-scoped lookups
CREATE INDEX "collections_vehicle_id_idx" ON "collections" ("vehicle_id");
--> statement-breakpoint
CREATE INDEX "customer_transactions_vehicle_id_idx" ON "customer_transactions" ("vehicle_id");
