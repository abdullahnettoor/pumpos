-- DERIVED from packages/db/migrations/0007_daily_red_ghost.sql by
-- `npm run db:sync-supabase -w @pump/db`. Edit the source, never this copy.

CREATE INDEX "business_days_org_business_date_idx" ON "business_days" USING btree ("organization_id","business_date","id");