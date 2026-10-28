-- DERIVED from packages/db/migrations/0010_lazy_tattoo.sql by
-- `npm run db:sync-supabase -w @pump/db`. Edit the source, never this copy.

CREATE INDEX "stock_variances_org_station_day_idx" ON "stock_variances" USING btree ("organization_id","station_id","business_day_id");