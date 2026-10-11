CREATE TABLE "decantation_chambers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"station_id" uuid NOT NULL,
	"decantation_id" uuid NOT NULL,
	"tank_line_id" uuid,
	"chamber_no" integer NOT NULL,
	"capacity_l" numeric(12, 3),
	"seal_ok" boolean,
	"mark" varchar(10),
	"dip_mm" numeric(8, 1),
	"emptied" boolean,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decantation_purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"station_id" uuid NOT NULL,
	"decantation_id" uuid NOT NULL,
	"purchase_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"received_qty" numeric(12, 3),
	"invoice_qty" numeric(12, 3),
	"variance_qty" numeric(12, 3),
	"variance_computed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decantation_tank_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"station_id" uuid NOT NULL,
	"decantation_id" uuid NOT NULL,
	"tank_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"before_dip" numeric(12, 3) NOT NULL,
	"before_dip_at" timestamp,
	"observed_density" numeric(7, 2),
	"observed_temp_c" numeric(5, 2),
	"ro_density" numeric(7, 2),
	"after_dip" numeric(12, 3),
	"after_dip_at" timestamp,
	"sales_during" numeric(12, 3) DEFAULT '0' NOT NULL,
	"received_qty" numeric(12, 3),
	"measured_by" varchar(20),
	"measurement_ref_id" uuid,
	"measured_at" timestamp,
	"status" varchar(30) DEFAULT 'PENDING_MEASUREMENT' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decantations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"station_id" uuid NOT NULL,
	"business_day_id" uuid NOT NULL,
	"document_number" varchar(100) NOT NULL,
	"tanker_number" varchar(50) NOT NULL,
	"driver_name" varchar(100),
	"unload_started_at" timestamp,
	"unload_ended_at" timestamp,
	"chambers_checked" boolean DEFAULT false NOT NULL,
	"status" varchar(30) DEFAULT 'PENDING_MEASUREMENT' NOT NULL,
	"flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" varchar(500),
	"recorded_by" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "density_readings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"station_id" uuid NOT NULL,
	"business_date" varchar(10) NOT NULL,
	"product_id" uuid NOT NULL,
	"kind" varchar(20) NOT NULL,
	"sampled_from" varchar(10),
	"tank_id" uuid,
	"nozzle_id" uuid,
	"entry_method" varchar(20) NOT NULL,
	"observed_density" numeric(7, 2),
	"observed_temp_c" numeric(5, 2),
	"density_15" numeric(7, 2) NOT NULL,
	"decantation_tank_line_id" uuid,
	"flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"recorded_by" uuid,
	"recorded_at" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "purchases" ALTER COLUMN "business_day_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_items" ADD COLUMN "invoice_density" numeric(7, 2);--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "station_id" uuid;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "entry_date" varchar(10);--> statement-breakpoint
ALTER TABLE "decantation_chambers" ADD CONSTRAINT "decantation_chambers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decantation_chambers" ADD CONSTRAINT "decantation_chambers_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decantation_chambers" ADD CONSTRAINT "decantation_chambers_decantation_id_decantations_id_fk" FOREIGN KEY ("decantation_id") REFERENCES "public"."decantations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decantation_chambers" ADD CONSTRAINT "decantation_chambers_tank_line_id_decantation_tank_lines_id_fk" FOREIGN KEY ("tank_line_id") REFERENCES "public"."decantation_tank_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decantation_purchases" ADD CONSTRAINT "decantation_purchases_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decantation_purchases" ADD CONSTRAINT "decantation_purchases_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decantation_purchases" ADD CONSTRAINT "decantation_purchases_decantation_id_decantations_id_fk" FOREIGN KEY ("decantation_id") REFERENCES "public"."decantations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decantation_purchases" ADD CONSTRAINT "decantation_purchases_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decantation_purchases" ADD CONSTRAINT "decantation_purchases_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decantation_tank_lines" ADD CONSTRAINT "decantation_tank_lines_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decantation_tank_lines" ADD CONSTRAINT "decantation_tank_lines_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decantation_tank_lines" ADD CONSTRAINT "decantation_tank_lines_decantation_id_decantations_id_fk" FOREIGN KEY ("decantation_id") REFERENCES "public"."decantations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decantation_tank_lines" ADD CONSTRAINT "decantation_tank_lines_tank_id_tanks_id_fk" FOREIGN KEY ("tank_id") REFERENCES "public"."tanks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decantation_tank_lines" ADD CONSTRAINT "decantation_tank_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decantations" ADD CONSTRAINT "decantations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decantations" ADD CONSTRAINT "decantations_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decantations" ADD CONSTRAINT "decantations_business_day_id_business_days_id_fk" FOREIGN KEY ("business_day_id") REFERENCES "public"."business_days"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decantations" ADD CONSTRAINT "decantations_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "density_readings" ADD CONSTRAINT "density_readings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "density_readings" ADD CONSTRAINT "density_readings_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "density_readings" ADD CONSTRAINT "density_readings_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "density_readings" ADD CONSTRAINT "density_readings_tank_id_tanks_id_fk" FOREIGN KEY ("tank_id") REFERENCES "public"."tanks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "density_readings" ADD CONSTRAINT "density_readings_nozzle_id_nozzles_id_fk" FOREIGN KEY ("nozzle_id") REFERENCES "public"."nozzles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "density_readings" ADD CONSTRAINT "density_readings_decantation_tank_line_id_decantation_tank_lines_id_fk" FOREIGN KEY ("decantation_tank_line_id") REFERENCES "public"."decantation_tank_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "density_readings" ADD CONSTRAINT "density_readings_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "decantation_chambers_decantation_chamber_uniq" ON "decantation_chambers" USING btree ("decantation_id","chamber_no");--> statement-breakpoint
CREATE UNIQUE INDEX "decantation_purchases_decantation_product_uniq" ON "decantation_purchases" USING btree ("decantation_id","product_id");--> statement-breakpoint
CREATE INDEX "decantation_purchases_purchase_idx" ON "decantation_purchases" USING btree ("purchase_id");--> statement-breakpoint
CREATE INDEX "decantation_tank_lines_decantation_idx" ON "decantation_tank_lines" USING btree ("decantation_id");--> statement-breakpoint
CREATE INDEX "decantation_tank_lines_org_station_tank_status_idx" ON "decantation_tank_lines" USING btree ("organization_id","station_id","tank_id","status");--> statement-breakpoint
CREATE INDEX "decantations_org_station_day_idx" ON "decantations" USING btree ("organization_id","station_id","business_day_id");--> statement-breakpoint
CREATE INDEX "decantations_station_status_idx" ON "decantations" USING btree ("station_id","status");--> statement-breakpoint
CREATE INDEX "density_readings_org_station_product_recorded_idx" ON "density_readings" USING btree ("organization_id","station_id","product_id","recorded_at");--> statement-breakpoint
CREATE INDEX "density_readings_org_station_date_idx" ON "density_readings" USING btree ("organization_id","station_id","business_date");--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "purchases_org_station_entry_date_idx" ON "purchases" USING btree ("organization_id","station_id","entry_date");--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_has_anchor" CHECK ("purchases"."business_day_id" IS NOT NULL OR "purchases"."entry_date" IS NOT NULL);