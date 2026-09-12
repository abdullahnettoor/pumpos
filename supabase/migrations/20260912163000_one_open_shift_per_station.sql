CREATE UNIQUE INDEX "shifts_station_open_uniq" ON "shifts" USING btree ("organization_id","station_id") WHERE "shifts"."status" = 'OPEN';
