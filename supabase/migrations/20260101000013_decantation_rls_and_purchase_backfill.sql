-- DERIVED from packages/db/migrations/0013_decantation_rls_and_purchase_backfill.sql by
-- `npm run db:sync-supabase -w @pump/db`. Edit the source, never this copy.

-- Decantation & Density schema, part 2 (ADR 0007, ADR 0012).
-- 1. Backfill purchases.organization_id / station_id from the owning business
--    day so the next migration can make both NOT NULL (0003/0004/0005 pattern).
UPDATE "purchases" p
SET "organization_id" = bd."organization_id",
    "station_id" = bd."station_id"
FROM "business_days" bd
WHERE bd."id" = p."business_day_id"
  AND (p."organization_id" IS NULL OR p."station_id" IS NULL);

-- 2. purchases / purchase_items RLS now keys on organization_id directly
--    (business_day_id is nullable for Fuel Purchases).
DROP POLICY IF EXISTS purchases_tenant_policy ON "purchases";
CREATE POLICY purchases_tenant_policy ON "purchases" FOR ALL TO authenticated
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());

DROP POLICY IF EXISTS purchase_items_tenant_policy ON "purchase_items";
CREATE POLICY purchase_items_tenant_policy ON "purchase_items" FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "purchases"
    WHERE "purchases".id = "purchase_items".purchase_id
      AND "purchases".organization_id = public.current_organization_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "purchases"
    WHERE "purchases".id = "purchase_items".purchase_id
      AND "purchases".organization_id = public.current_organization_id()
  ));

-- 3. New Decantation & Density tables: RLS + tenant policy.

ALTER TABLE "decantations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY decantations_tenant_policy ON "decantations" FOR ALL TO authenticated
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());

ALTER TABLE "decantation_tank_lines" ENABLE ROW LEVEL SECURITY;
CREATE POLICY decantation_tank_lines_tenant_policy ON "decantation_tank_lines" FOR ALL TO authenticated
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());

ALTER TABLE "decantation_chambers" ENABLE ROW LEVEL SECURITY;
CREATE POLICY decantation_chambers_tenant_policy ON "decantation_chambers" FOR ALL TO authenticated
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());

ALTER TABLE "decantation_purchases" ENABLE ROW LEVEL SECURITY;
CREATE POLICY decantation_purchases_tenant_policy ON "decantation_purchases" FOR ALL TO authenticated
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());

ALTER TABLE "density_readings" ENABLE ROW LEVEL SECURITY;
CREATE POLICY density_readings_tenant_policy ON "density_readings" FOR ALL TO authenticated
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());
