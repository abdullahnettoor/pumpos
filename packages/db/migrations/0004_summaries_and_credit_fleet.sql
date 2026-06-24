-- Rename dssr_snapshots to shift_summaries (per-shift summaries)
ALTER TABLE "dssr_snapshots" RENAME TO "shift_summaries";

-- Create new dssr_snapshots table (business-day rollups)
CREATE TABLE "dssr_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"station_id" uuid NOT NULL,
	"business_date" varchar(10) NOT NULL,
	"snapshot_data" jsonb NOT NULL,
	"generated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Add columns to customers table for prepaid support
ALTER TABLE "customers" ADD COLUMN "is_prepaid" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "prepaid_balance" numeric(14, 2) DEFAULT 0 NOT NULL;
--> statement-breakpoint

-- Create customer_vehicles table
CREATE TABLE "customer_vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"registration_number" varchar(50) NOT NULL,
	"vehicle_type" varchar(50) NOT NULL,
	"default_product_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Create customer_discount_rules table
CREATE TABLE "customer_discount_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"product_id" uuid,
	"rule_type" varchar(50) NOT NULL,
	"value" numeric(10, 4) NOT NULL,
	"threshold_litres" numeric(12, 2),
	"valid_from" timestamp NOT NULL,
	"valid_until" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Add vehicle_id to sales table
ALTER TABLE "sales" ADD COLUMN "vehicle_id" uuid;
--> statement-breakpoint

-- Add vehicle_id to customer_transactions table
ALTER TABLE "customer_transactions" ADD COLUMN "vehicle_id" uuid;
--> statement-breakpoint

-- Add discount_amount to sale_items table
ALTER TABLE "sale_items" ADD COLUMN "discount_amount" numeric(12, 2) DEFAULT 0 NOT NULL;
--> statement-breakpoint

-- Add foreign key constraints
ALTER TABLE "customer_vehicles" ADD CONSTRAINT "customer_vehicles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
--> statement-breakpoint
ALTER TABLE "customer_vehicles" ADD CONSTRAINT "customer_vehicles_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
--> statement-breakpoint
ALTER TABLE "customer_vehicles" ADD CONSTRAINT "customer_vehicles_product_id_fkey" FOREIGN KEY ("default_product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
--> statement-breakpoint
ALTER TABLE "customer_discount_rules" ADD CONSTRAINT "customer_discount_rules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
--> statement-breakpoint
ALTER TABLE "customer_discount_rules" ADD CONSTRAINT "customer_discount_rules_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
--> statement-breakpoint
ALTER TABLE "customer_discount_rules" ADD CONSTRAINT "customer_discount_rules_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
--> statement-breakpoint
ALTER TABLE "dssr_snapshots" ADD CONSTRAINT "dssr_snapshots_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
--> statement-breakpoint
ALTER TABLE "dssr_snapshots" ADD CONSTRAINT "dssr_snapshots_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "customer_vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
--> statement-breakpoint
ALTER TABLE "customer_transactions" ADD CONSTRAINT "customer_transactions_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "customer_vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
--> statement-breakpoint

-- Add unique constraint on (station_id, business_date) for dssr_snapshots
ALTER TABLE "dssr_snapshots" ADD CONSTRAINT "dssr_snapshots_station_business_date_unique" UNIQUE ("station_id", "business_date");
--> statement-breakpoint

-- Add unique constraint on (organization_id, registration_number) for customer_vehicles
ALTER TABLE "customer_vehicles" ADD CONSTRAINT "customer_vehicles_org_reg_unique" UNIQUE ("organization_id", "registration_number");
--> statement-breakpoint

-- Create indexes for performance
CREATE INDEX "customer_vehicles_customer_id_idx" ON "customer_vehicles" ("customer_id");
--> statement-breakpoint
CREATE INDEX "customer_vehicles_organization_id_idx" ON "customer_vehicles" ("organization_id");
--> statement-breakpoint
CREATE INDEX "customer_discount_rules_customer_id_idx" ON "customer_discount_rules" ("customer_id");
--> statement-breakpoint
CREATE INDEX "customer_discount_rules_organization_id_idx" ON "customer_discount_rules" ("organization_id");
--> statement-breakpoint
CREATE INDEX "dssr_snapshots_station_business_date_idx" ON "dssr_snapshots" ("station_id", "business_date");
--> statement-breakpoint
CREATE INDEX "dssr_snapshots_organization_id_idx" ON "dssr_snapshots" ("organization_id");
