ALTER TABLE "stock_movements" ADD COLUMN "tank_id" uuid;--> statement-breakpoint
ALTER TABLE "stock_variances" ADD COLUMN "tank_id" uuid;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_tank_id_tanks_id_fk" FOREIGN KEY ("tank_id") REFERENCES "public"."tanks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_variances" ADD CONSTRAINT "stock_variances_tank_id_tanks_id_fk" FOREIGN KEY ("tank_id") REFERENCES "public"."tanks"("id") ON DELETE no action ON UPDATE no action;