-- 1. Enable RLS on all tables
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_station_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tanks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dispenser_units" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "nozzles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "shift_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "shifts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "shift_staff_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "nozzle_readings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customer_transactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "suppliers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "supplier_transactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sales" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sale_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_movements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_variances" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "expense_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "expenses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "collections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "purchases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dssr_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "business_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sync_events" ENABLE ROW LEVEL SECURITY;

-- 2. Define Policy Helper variable / JWT claims checks
-- Organization matching for organizations table
CREATE POLICY organizations_tenant_policy ON "organizations"
  FOR ALL TO authenticated
  USING (id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid);

-- Direct Tenancy Tables Policy Generator
CREATE POLICY stations_tenant_policy ON "stations"
  FOR ALL TO authenticated
  USING (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid)
  WITH CHECK (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid);

CREATE POLICY users_tenant_policy ON "users"
  FOR ALL TO authenticated
  USING (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid)
  WITH CHECK (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid);

CREATE POLICY tanks_tenant_policy ON "tanks"
  FOR ALL TO authenticated
  USING (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid)
  WITH CHECK (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid);

CREATE POLICY dispenser_units_tenant_policy ON "dispenser_units"
  FOR ALL TO authenticated
  USING (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid)
  WITH CHECK (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid);

CREATE POLICY nozzles_tenant_policy ON "nozzles"
  FOR ALL TO authenticated
  USING (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid)
  WITH CHECK (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid);

CREATE POLICY products_tenant_policy ON "products"
  FOR ALL TO authenticated
  USING (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid)
  WITH CHECK (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid);

CREATE POLICY shift_templates_tenant_policy ON "shift_templates"
  FOR ALL TO authenticated
  USING (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid)
  WITH CHECK (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid);

CREATE POLICY shifts_tenant_policy ON "shifts"
  FOR ALL TO authenticated
  USING (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid)
  WITH CHECK (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid);

CREATE POLICY customers_tenant_policy ON "customers"
  FOR ALL TO authenticated
  USING (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid)
  WITH CHECK (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid);

CREATE POLICY suppliers_tenant_policy ON "suppliers"
  FOR ALL TO authenticated
  USING (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid)
  WITH CHECK (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid);

CREATE POLICY expense_categories_tenant_policy ON "expense_categories"
  FOR ALL TO authenticated
  USING (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid)
  WITH CHECK (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid);

CREATE POLICY audit_logs_tenant_policy ON "audit_logs"
  FOR ALL TO authenticated
  USING (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid)
  WITH CHECK (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid);

CREATE POLICY business_events_tenant_policy ON "business_events"
  FOR ALL TO authenticated
  USING (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid)
  WITH CHECK (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid);


-- 3. Indirect Tenancy Tables Policies (Linked through Shifts or Users)
CREATE POLICY user_roles_tenant_policy ON "user_roles"
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "users" 
    WHERE "users".id = "user_roles".user_id 
    AND "users".organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid
  ));

CREATE POLICY user_station_assignments_tenant_policy ON "user_station_assignments"
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "users" 
    WHERE "users".id = "user_station_assignments".user_id 
    AND "users".organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid
  ));

CREATE POLICY shift_staff_assignments_tenant_policy ON "shift_staff_assignments"
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "shifts" 
    WHERE "shifts".id = "shift_staff_assignments".shift_id 
    AND "shifts".organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid
  ));

CREATE POLICY nozzle_readings_tenant_policy ON "nozzle_readings"
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "shifts" 
    WHERE "shifts".id = "nozzle_readings".shift_id 
    AND "shifts".organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid
  ));

CREATE POLICY customer_transactions_tenant_policy ON "customer_transactions"
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "shifts" 
    WHERE "shifts".id = "customer_transactions".shift_id 
    AND "shifts".organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid
  ));

CREATE POLICY supplier_transactions_tenant_policy ON "supplier_transactions"
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "shifts" 
    WHERE "shifts".id = "supplier_transactions".shift_id 
    AND "shifts".organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid
  ));

CREATE POLICY sales_tenant_policy ON "sales"
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "shifts" 
    WHERE "shifts".id = "sales".shift_id 
    AND "shifts".organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid
  ));

CREATE POLICY sale_items_tenant_policy ON "sale_items"
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "sales"
    JOIN "shifts" ON "shifts".id = "sales".shift_id
    WHERE "sales".id = "sale_items".sale_id
    AND "shifts".organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid
  ));

CREATE POLICY stock_movements_tenant_policy ON "stock_movements"
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "shifts" 
    WHERE "shifts".id = "stock_movements".shift_id 
    AND "shifts".organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid
  ));

CREATE POLICY stock_variances_tenant_policy ON "stock_variances"
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "shifts" 
    WHERE "shifts".id = "stock_variances".shift_id 
    AND "shifts".organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid
  ));

CREATE POLICY expenses_tenant_policy ON "expenses"
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "shifts" 
    WHERE "shifts".id = "expenses".shift_id 
    AND "shifts".organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid
  ));

CREATE POLICY collections_tenant_policy ON "collections"
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "shifts" 
    WHERE "shifts".id = "collections".shift_id 
    AND "shifts".organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid
  ));

CREATE POLICY purchases_tenant_policy ON "purchases"
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "shifts" 
    WHERE "shifts".id = "purchases".shift_id 
    AND "shifts".organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid
  ));

CREATE POLICY dssr_snapshots_tenant_policy ON "dssr_snapshots"
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "shifts" 
    WHERE "shifts".id = "dssr_snapshots".shift_id 
    AND "shifts".organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid
  ));


-- 4. Sync Events Table (JSON Payload check)
CREATE POLICY sync_events_tenant_policy ON "sync_events"
  FOR ALL TO authenticated
  USING (((payload ->> 'organization_id')::uuid) = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid);
