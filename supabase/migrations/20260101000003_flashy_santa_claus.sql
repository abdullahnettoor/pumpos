-- DERIVED from packages/db/migrations/0003_flashy_santa_claus.sql by
-- `npm run db:sync-supabase -w @pump/db`. Edit the source, never this copy.

ALTER TABLE "stock_variances" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "stock_variances" ADD COLUMN "station_id" uuid;--> statement-breakpoint
ALTER TABLE "stock_variances" ADD CONSTRAINT "stock_variances_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_variances" ADD CONSTRAINT "stock_variances_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;