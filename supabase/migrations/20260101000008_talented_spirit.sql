-- DERIVED from packages/db/migrations/0008_talented_spirit.sql by
-- `npm run db:sync-supabase -w @pump/db`. Edit the source, never this copy.

CREATE INDEX "dssr_snapshots_org_station_date_idx" ON "dssr_snapshots" USING btree ("organization_id","station_id","business_date");--> statement-breakpoint
CREATE INDEX "shift_summaries_shift_idx" ON "shift_summaries" USING btree ("shift_id");--> statement-breakpoint
CREATE INDEX "shifts_business_day_idx" ON "shifts" USING btree ("business_day_id");