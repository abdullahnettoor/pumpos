-- 0020: Composite index to fully support station-wide ledger range scans and
-- the per-period opening-balance aggregate (Σ signed WHERE entry_date < from).
--
-- ledger_entries already has (account_id, entry_date) [0018] which backs the
-- per-account statement opening. stationMovements filters (org, station) and
-- then scans entry_date; the existing (organization_id, station_id) index left
-- entry_date as a residual filter. Adding entry_date makes both the in-range
-- fetch AND the pre-range opening SUM index-supported for a station.
CREATE INDEX IF NOT EXISTS "ledger_entries_org_station_date_idx"
  ON "ledger_entries" ("organization_id", "station_id", "entry_date");
