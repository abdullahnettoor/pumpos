-- One business day per station per calendar date. Backs ensure-by-date business
-- day resolution (no "open business day" ceremony) and prevents duplicate-day
-- races. A UNIQUE index also serves the (org, station, date) lookup, so no
-- separate non-unique index is needed.
CREATE UNIQUE INDEX IF NOT EXISTS "business_days_org_station_date_uniq"
  ON "business_days" ("organization_id", "station_id", "business_date");
