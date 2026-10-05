-- DERIVED from packages/db/migrations/0002_common_wildside.sql by
-- `npm run db:sync-supabase -w @pump/db`. Edit the source, never this copy.

ALTER TABLE "organizations" ADD COLUMN "is_demo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "demo_expires_at" timestamp with time zone;