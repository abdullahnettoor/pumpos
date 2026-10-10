-- DERIVED from packages/db/migrations/0011_moaning_nemesis.sql by
-- `npm run db:sync-supabase -w @pump/db`. Edit the source, never this copy.

CREATE INDEX "stock_movements_business_day_tank_idx" ON "stock_movements" USING btree ("business_day_id","tank_id");