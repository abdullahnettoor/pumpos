ALTER TABLE "purchases" DROP CONSTRAINT "purchases_shift_id_shifts_id_fk";
--> statement-breakpoint
ALTER TABLE "purchases" DROP COLUMN "shift_id";