-- DERIVED from packages/db/migrations/0004_backfill_stock_variance_scope.sql by
-- `npm run db:sync-supabase -w @pump/db`. Edit the source, never this copy.

-- Backfill stock_variances.organization_id / station_id from the owning
-- business day, so the next migration can make both columns NOT NULL.
UPDATE "stock_variances" sv
SET "organization_id" = bd."organization_id",
    "station_id" = bd."station_id"
FROM "business_days" bd
WHERE bd."id" = sv."business_day_id"
  AND (sv."organization_id" IS NULL OR sv."station_id" IS NULL);
