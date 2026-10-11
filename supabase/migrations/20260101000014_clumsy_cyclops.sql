-- DERIVED from packages/db/migrations/0014_clumsy_cyclops.sql by
-- `npm run db:sync-supabase -w @pump/db`. Edit the source, never this copy.

ALTER TABLE "purchases" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "purchases" ALTER COLUMN "station_id" SET NOT NULL;