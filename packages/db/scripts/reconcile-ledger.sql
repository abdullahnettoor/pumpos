-- =====================================================================
-- reconcile-ledger.sql — Rewrite the supabase_migrations ledger so it
-- reflects the new consolidated baseline instead of the archived 22 files.
--
-- Prerequisites:
--   1. The live schema is already what 0000_baseline.sql + 0001_rls.sql
--      describe (yes — every archived migration has already been applied).
--   2. You have run scripts/fix-rls.sql first (adds RLS to the 7 tables that
--      never got policies — bringing the DB up to what 0001_rls.sql specifies).
--
-- Effect: DELETE the 22 old rows and INSERT two new ones. Zero schema change.
-- After this runs, `supabase db push --linked` (and any future `db push`) will
-- see the new files as already-applied and produce no diff.
--
-- Run once with:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f packages/db/scripts/reconcile-ledger.sql
--
-- Safety: wrap in a transaction so a partial failure rolls back cleanly.
-- =====================================================================

BEGIN;

-- Ensure the ledger schema/table exists (Supabase creates it lazily on first push).
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
  version    text PRIMARY KEY,
  statements text[],
  name       text
);

-- Show what will be removed (for the operator's benefit).
SELECT 'Before reconcile — existing rows:' AS info, count(*) AS row_count
FROM supabase_migrations.schema_migrations;

-- Wipe the 22 old rows.
DELETE FROM supabase_migrations.schema_migrations
WHERE version IN (
  '0000', '0001', '0002', '0003', '0004', '0005', '0006', '0007',
  '0008', '0009', '0010', '0011', '0012', '0013', '0014', '0016',
  '0017', '0018', '0019', '0020', '0021'
)
   OR name LIKE '0000_fine_white_queen%'
   OR name LIKE '0001_custom_auth_and_rls%'
   OR name LIKE '0002_%'
   OR name LIKE '0003_%'
   OR name LIKE '0004_%'
   OR name LIKE '0005_%'
   OR name LIKE '0006_%'
   OR name LIKE '0007_%'
   OR name LIKE '0008_%'
   OR name LIKE '0009_%'
   OR name LIKE '0010_%'
   OR name LIKE '0011_%'
   OR name LIKE '0012_%'
   OR name LIKE '0013_%'
   OR name LIKE '0014_%'
   OR name LIKE '0016_%'
   OR name LIKE '0017_%'
   OR name LIKE '0018_%'
   OR name LIKE '0019_%'
   OR name LIKE '0020_%'
   OR name LIKE '0021_%';

-- Insert the two new consolidated baselines. `statements` is left NULL —
-- the Supabase CLI only compares `version`, so this is enough to mark them
-- as applied without duplicating the SQL body.
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES
  ('20260719000000', '0000_baseline', ARRAY[]::text[]),
  ('20260719000001', '0001_rls',      ARRAY[]::text[])
ON CONFLICT (version) DO NOTHING;

-- Show final state.
SELECT 'After reconcile — remaining rows:' AS info, count(*) AS row_count
FROM supabase_migrations.schema_migrations;

SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;

COMMIT;
