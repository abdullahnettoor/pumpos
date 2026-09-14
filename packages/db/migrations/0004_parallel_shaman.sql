DELETE FROM "attendant_handovers" AS older
USING "attendant_handovers" AS newer
WHERE older."organization_id" = newer."organization_id"
  AND older."station_id" = newer."station_id"
  AND older."shift_id" = newer."shift_id"
  AND older."user_id" = newer."user_id"
  AND older."du_id" = newer."du_id"
  AND (older."created_at", older."id") < (newer."created_at", newer."id");
--> statement-breakpoint
CREATE UNIQUE INDEX "attendant_handovers_org_station_shift_user_du_uniq" ON "attendant_handovers" USING btree ("organization_id","station_id","shift_id","user_id","du_id");
