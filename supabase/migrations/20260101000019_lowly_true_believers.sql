-- DERIVED from packages/db/migrations/0019_lowly_true_believers.sql by
-- `npm run db:sync-supabase -w @pump/db`. Edit the source, never this copy.

ALTER TABLE "purchases" DROP CONSTRAINT "purchases_shift_id_shifts_id_fk";
--> statement-breakpoint
ALTER TABLE "purchases" DROP COLUMN "shift_id";