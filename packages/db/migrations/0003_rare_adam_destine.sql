-- Preflight: list stations with more than one OPEN shift.
-- Deployment intentionally fails loudly if duplicates exist. Resolve them by
-- closing shifts through the app so summaries and events are produced, never by raw UPDATE.
-- SELECT organization_id, station_id, COUNT(*) FROM shifts
-- WHERE status = 'OPEN' GROUP BY 1,2 HAVING COUNT(*) > 1;
CREATE UNIQUE INDEX IF NOT EXISTS "shifts_station_open_uniq" ON "shifts" USING btree ("organization_id","station_id") WHERE "shifts"."status" = 'OPEN';
