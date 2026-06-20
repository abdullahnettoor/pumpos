CREATE TABLE "attendant_handovers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"station_id" uuid NOT NULL,
	"shift_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"du_id" uuid NOT NULL,
	"cash_handed_over" numeric(12, 2) DEFAULT '0' NOT NULL,
	"card_handed_over" numeric(12, 2) DEFAULT '0' NOT NULL,
	"upi_handed_over" numeric(12, 2) DEFAULT '0' NOT NULL,
	"credit_handed_over" numeric(12, 2) DEFAULT '0' NOT NULL,
	"testing_volume" numeric(10, 3) DEFAULT '0' NOT NULL,
	"expected_sales" numeric(12, 2) DEFAULT '0' NOT NULL,
	"variance_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fuel_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"station_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"effective_from" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "nozzle_readings" ADD COLUMN "unit_price" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "attendant_handovers" ADD CONSTRAINT "attendant_handovers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendant_handovers" ADD CONSTRAINT "attendant_handovers_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendant_handovers" ADD CONSTRAINT "attendant_handovers_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendant_handovers" ADD CONSTRAINT "attendant_handovers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendant_handovers" ADD CONSTRAINT "attendant_handovers_du_id_dispenser_units_id_fk" FOREIGN KEY ("du_id") REFERENCES "public"."dispenser_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fuel_prices" ADD CONSTRAINT "fuel_prices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fuel_prices" ADD CONSTRAINT "fuel_prices_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fuel_prices" ADD CONSTRAINT "fuel_prices_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;

--> statement-breakpoint
ALTER TABLE "fuel_prices" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "attendant_handovers" ENABLE ROW LEVEL SECURITY;

--> statement-breakpoint
CREATE POLICY fuel_prices_tenant_policy ON "fuel_prices"
  FOR ALL TO authenticated
  USING (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid)
  WITH CHECK (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid);

--> statement-breakpoint
CREATE POLICY attendant_handovers_tenant_policy ON "attendant_handovers"
  FOR ALL TO authenticated
  USING (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid)
  WITH CHECK (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid);