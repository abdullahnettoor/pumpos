-- =====================================================================
-- fix-rls.sql — Additive RLS backfill for the 7 tables that were created
-- between migrations 0002 and 0021 without row-level security.
--
-- Safe to run against the live database:
--   * Adds ENABLE ROW LEVEL SECURITY (no data change)
--   * Creates tenant-isolation policies (no data change)
--   * Uses DROP POLICY IF EXISTS to be idempotent
--
-- Run once with:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f packages/db/scripts/fix-rls.sql
--
-- Pattern matches existing 0001: policies grant access only when
-- auth.jwt() -> 'user_metadata' ->> 'organization_id' matches.
-- =====================================================================

-- 1. Enable RLS
ALTER TABLE "financial_accounts"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ledger_entries"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "idempotency_keys"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoices"                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "document_sequences"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "handover_terminal_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "purchase_items"            ENABLE ROW LEVEL SECURITY;

-- 2. Policies for tables with direct organization_id
DROP POLICY IF EXISTS financial_accounts_tenant_policy ON "financial_accounts";
CREATE POLICY financial_accounts_tenant_policy ON "financial_accounts" FOR ALL TO authenticated
  USING (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid)
  WITH CHECK (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid);

DROP POLICY IF EXISTS ledger_entries_tenant_policy ON "ledger_entries";
CREATE POLICY ledger_entries_tenant_policy ON "ledger_entries" FOR ALL TO authenticated
  USING (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid)
  WITH CHECK (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid);

DROP POLICY IF EXISTS idempotency_keys_tenant_policy ON "idempotency_keys";
CREATE POLICY idempotency_keys_tenant_policy ON "idempotency_keys" FOR ALL TO authenticated
  USING (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid)
  WITH CHECK (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid);

DROP POLICY IF EXISTS invoices_tenant_policy ON "invoices";
CREATE POLICY invoices_tenant_policy ON "invoices" FOR ALL TO authenticated
  USING (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid)
  WITH CHECK (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid);

DROP POLICY IF EXISTS document_sequences_tenant_policy ON "document_sequences";
CREATE POLICY document_sequences_tenant_policy ON "document_sequences" FOR ALL TO authenticated
  USING (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid)
  WITH CHECK (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid);

DROP POLICY IF EXISTS handover_terminal_entries_tenant_policy ON "handover_terminal_entries";
CREATE POLICY handover_terminal_entries_tenant_policy ON "handover_terminal_entries" FOR ALL TO authenticated
  USING (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid)
  WITH CHECK (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid);

-- 3. Policy for the one indirect table (purchase_items → purchases → business_days)
DROP POLICY IF EXISTS purchase_items_tenant_policy ON "purchase_items";
CREATE POLICY purchase_items_tenant_policy ON "purchase_items" FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "purchases"
    JOIN "business_days" ON "business_days".id = "purchases".business_day_id
    WHERE "purchases".id = "purchase_items".purchase_id
      AND "business_days".organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid
  ));
