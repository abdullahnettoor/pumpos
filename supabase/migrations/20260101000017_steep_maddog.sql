-- DERIVED from packages/db/migrations/0017_steep_maddog.sql by
-- `npm run db:sync-supabase -w @pump/db`. Edit the source, never this copy.

ALTER TABLE "expense_categories" ADD COLUMN "nature" varchar(10) DEFAULT 'INDIRECT' NOT NULL;--> statement-breakpoint
ALTER TABLE "income_categories" ADD COLUMN "nature" varchar(10) DEFAULT 'INDIRECT' NOT NULL;