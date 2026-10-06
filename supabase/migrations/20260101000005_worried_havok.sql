-- DERIVED from packages/db/migrations/0005_worried_havok.sql by
-- `npm run db:sync-supabase -w @pump/db`. Edit the source, never this copy.

ALTER TABLE "stock_variances" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_variances" ALTER COLUMN "station_id" SET NOT NULL;