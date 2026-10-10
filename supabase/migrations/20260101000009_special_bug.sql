-- DERIVED from packages/db/migrations/0009_special_bug.sql by
-- `npm run db:sync-supabase -w @pump/db`. Edit the source, never this copy.

CREATE INDEX "sales_business_day_idx" ON "sales" USING btree ("business_day_id");