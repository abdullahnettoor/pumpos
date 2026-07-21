-- =====================================================================
-- 0001 — Auth bootstrap + Row-Level Security (consolidated)
--
-- Applies row-level security to every table produced by 0000_baseline. The
-- tenant discriminator is `auth.jwt() -> 'user_metadata' ->> 'organization_id'`
-- (a uuid string), populated by the `handle_new_user()` trigger below at
-- signup and refreshed on every JWT.
--
-- Scoping patterns:
--   (a) Direct — table has its own organization_id column
--   (b) Via users — table joins to `users` on user_id
--   (c) Via shifts — table joins to `shifts` on shift_id (shift_id NOT NULL)
--   (d) Via business_days — financial/inventory tables anchored to a day
--   (e) Via other parent — e.g. sale_items → sales, purchase_items → purchases
--
-- Idempotent: safe to re-run. Every ENABLE, FUNCTION, TRIGGER, and POLICY is
-- guarded with IF EXISTS / OR REPLACE / DROP-then-CREATE.
-- =====================================================================

-- =====================================================================
-- 1. Auth compatibility shim (no-op on Supabase; needed for dev/self-host)
-- =====================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth') THEN
    CREATE SCHEMA auth;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'auth' AND tablename = 'users') THEN
    CREATE TABLE auth.users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email varchar(255),
      raw_user_meta_data jsonb,
      raw_app_meta_data jsonb
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'jwt' AND pronamespace = 'auth'::regnamespace) THEN
    CREATE FUNCTION auth.jwt() RETURNS jsonb AS '
      SELECT COALESCE(current_setting(''request.jwt.claims'', true), ''{}'')::jsonb;
    ' LANGUAGE sql STABLE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated;
  END IF;
END
$$;

-- =====================================================================
-- 2. New-user provisioning (signup → organization + owner user row)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_existing_user_id uuid;
  v_new_org_id uuid;
  v_new_user_id uuid;
  v_org_name text;
  v_full_name text;
  v_default_role text;
BEGIN
  IF NEW.email IS NOT NULL THEN
    SELECT id INTO v_existing_user_id FROM public.users WHERE email = NEW.email;
  END IF;

  IF v_existing_user_id IS NOT NULL THEN
    -- Invitation flow: attach auth identity to the pre-created user
    UPDATE public.users
    SET
      auth_user_id = NEW.id,
      status = 'ACTIVE',
      full_name = COALESCE(NEW.raw_user_meta_data->>'full_name', full_name),
      role = COALESCE(role, NEW.raw_user_meta_data->>'role', 'Staff'),
      updated_at = now()
    WHERE id = v_existing_user_id;
  ELSE
    -- Self-signup (owner) flow: create organization + owner user
    v_org_name := COALESCE(NEW.raw_user_meta_data->>'organization_name', NEW.raw_user_meta_data->>'company_name', SPLIT_PART(NEW.email, '@', 1) || '''s Station');

    INSERT INTO public.organizations (id, name, subscription_plan, subscription_status, created_at, updated_at)
    VALUES (gen_random_uuid(), v_org_name, 'Core', 'Active', now(), now())
    RETURNING id INTO v_new_org_id;

    v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', SPLIT_PART(NEW.email, '@', 1));
    v_default_role := COALESCE(NEW.raw_user_meta_data->>'role', 'Owner');

    v_new_user_id := gen_random_uuid();
    INSERT INTO public.users (id, organization_id, auth_user_id, full_name, email, role, status, created_at, updated_at)
    VALUES (v_new_user_id, v_new_org_id, NEW.id, v_full_name, NEW.email, v_default_role, 'ACTIVE', now(), now());
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================================
-- 3. Enable RLS on every business table (41)
-- =====================================================================
ALTER TABLE "organizations"                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stations"                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users"                         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_station_assignments"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tanks"                         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dispenser_units"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "nozzles"                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_terminals"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "products"                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "business_days"                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE "shift_templates"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "shifts"                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "shift_staff_assignments"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "shift_terminal_links"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "nozzle_readings"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "shift_summaries"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customers"                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customer_vehicles"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customer_discount_rules"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customer_transactions"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "suppliers"                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "supplier_transactions"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "financial_accounts"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ledger_entries"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sales"                         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sale_items"                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_movements"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_variances"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "expense_categories"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "expenses"                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "collections"                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "purchases"                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "purchase_items"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoices"                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "document_sequences"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dssr_snapshots"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "events"                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "idempotency_keys"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fuel_prices"                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attendant_handovers"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "handover_terminal_entries"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "income_categories"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "other_income"                  ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- 4. Tenant policies
-- =====================================================================

-- ----- (a) Tables with a direct organization_id column -----

DROP POLICY IF EXISTS organizations_tenant_policy ON "organizations";
CREATE POLICY organizations_tenant_policy ON "organizations" FOR ALL TO authenticated
  USING (id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid)
  WITH CHECK (id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid);

DROP POLICY IF EXISTS stations_tenant_policy ON "stations";
CREATE POLICY stations_tenant_policy ON "stations" FOR ALL TO authenticated
  USING (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid)
  WITH CHECK (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid);

DROP POLICY IF EXISTS users_tenant_policy ON "users";
CREATE POLICY users_tenant_policy ON "users" FOR ALL TO authenticated
  USING (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid)
  WITH CHECK (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid);

DROP POLICY IF EXISTS tanks_tenant_policy ON "tanks";
CREATE POLICY tanks_tenant_policy ON "tanks" FOR ALL TO authenticated
  USING (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid)
  WITH CHECK (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid);

DROP POLICY IF EXISTS dispenser_units_tenant_policy ON "dispenser_units";
CREATE POLICY dispenser_units_tenant_policy ON "dispenser_units" FOR ALL TO authenticated
  USING (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid)
  WITH CHECK (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid);

DROP POLICY IF EXISTS nozzles_tenant_policy ON "nozzles";
CREATE POLICY nozzles_tenant_policy ON "nozzles" FOR ALL TO authenticated
  USING (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid)
  WITH CHECK (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid);

DROP POLICY IF EXISTS payment_terminals_tenant_policy ON "payment_terminals";
CREATE POLICY payment_terminals_tenant_policy ON "payment_terminals" FOR ALL TO authenticated
  USING (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid)
  WITH CHECK (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid);

DROP POLICY IF EXISTS products_tenant_policy ON "products";
CREATE POLICY products_tenant_policy ON "products" FOR ALL TO authenticated
  USING (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid)
  WITH CHECK (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid);

DROP POLICY IF EXISTS business_days_tenant_policy ON "business_days";
CREATE POLICY business_days_tenant_policy ON "business_days" FOR ALL TO authenticated
  USING (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid)
  WITH CHECK (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid);

DROP POLICY IF EXISTS shift_templates_tenant_policy ON "shift_templates";
CREATE POLICY shift_templates_tenant_policy ON "shift_templates" FOR ALL TO authenticated
  USING (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid)
  WITH CHECK (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid);

DROP POLICY IF EXISTS shifts_tenant_policy ON "shifts";
CREATE POLICY shifts_tenant_policy ON "shifts" FOR ALL TO authenticated
  USING (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid)
  WITH CHECK (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid);

DROP POLICY IF EXISTS customers_tenant_policy ON "customers";
CREATE POLICY customers_tenant_policy ON "customers" FOR ALL TO authenticated
  USING (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid)
  WITH CHECK (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid);

DROP POLICY IF EXISTS customer_vehicles_tenant_policy ON "customer_vehicles";
CREATE POLICY customer_vehicles_tenant_policy ON "customer_vehicles" FOR ALL TO authenticated
  USING (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid)
  WITH CHECK (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid);

DROP POLICY IF EXISTS customer_discount_rules_tenant_policy ON "customer_discount_rules";
CREATE POLICY customer_discount_rules_tenant_policy ON "customer_discount_rules" FOR ALL TO authenticated
  USING (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid)
  WITH CHECK (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid);

DROP POLICY IF EXISTS suppliers_tenant_policy ON "suppliers";
CREATE POLICY suppliers_tenant_policy ON "suppliers" FOR ALL TO authenticated
  USING (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid)
  WITH CHECK (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid);

DROP POLICY IF EXISTS expense_categories_tenant_policy ON "expense_categories";
CREATE POLICY expense_categories_tenant_policy ON "expense_categories" FOR ALL TO authenticated
  USING (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid)
  WITH CHECK (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid);

DROP POLICY IF EXISTS dssr_snapshots_tenant_policy ON "dssr_snapshots";
CREATE POLICY dssr_snapshots_tenant_policy ON "dssr_snapshots" FOR ALL TO authenticated
  USING (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid)
  WITH CHECK (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid);

DROP POLICY IF EXISTS events_tenant_policy ON "events";
CREATE POLICY events_tenant_policy ON "events" FOR ALL TO authenticated
  USING (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid)
  WITH CHECK (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid);

DROP POLICY IF EXISTS fuel_prices_tenant_policy ON "fuel_prices";
CREATE POLICY fuel_prices_tenant_policy ON "fuel_prices" FOR ALL TO authenticated
  USING (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid)
  WITH CHECK (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid);

DROP POLICY IF EXISTS attendant_handovers_tenant_policy ON "attendant_handovers";
CREATE POLICY attendant_handovers_tenant_policy ON "attendant_handovers" FOR ALL TO authenticated
  USING (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid)
  WITH CHECK (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid);

-- --- (a) New tables added between 0002 and 0021, previously without RLS ---

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

-- ----- (b) Tables scoped through their parent users row -----

DROP POLICY IF EXISTS user_station_assignments_tenant_policy ON "user_station_assignments";
CREATE POLICY user_station_assignments_tenant_policy ON "user_station_assignments" FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "users"
    WHERE "users".id = "user_station_assignments".user_id
      AND "users".organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid
  ));

-- ----- (c) Tables scoped through their parent shift (shift_id NOT NULL) -----

DROP POLICY IF EXISTS shift_staff_assignments_tenant_policy ON "shift_staff_assignments";
CREATE POLICY shift_staff_assignments_tenant_policy ON "shift_staff_assignments" FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "shifts"
    WHERE "shifts".id = "shift_staff_assignments".shift_id
      AND "shifts".organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid
  ));

DROP POLICY IF EXISTS shift_terminal_links_tenant_policy ON "shift_terminal_links";
CREATE POLICY shift_terminal_links_tenant_policy ON "shift_terminal_links" FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "shifts"
    WHERE "shifts".id = "shift_terminal_links".shift_id
      AND "shifts".organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid
  ));

DROP POLICY IF EXISTS nozzle_readings_tenant_policy ON "nozzle_readings";
CREATE POLICY nozzle_readings_tenant_policy ON "nozzle_readings" FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "shifts"
    WHERE "shifts".id = "nozzle_readings".shift_id
      AND "shifts".organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid
  ));

DROP POLICY IF EXISTS shift_summaries_tenant_policy ON "shift_summaries";
CREATE POLICY shift_summaries_tenant_policy ON "shift_summaries" FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "shifts"
    WHERE "shifts".id = "shift_summaries".shift_id
      AND "shifts".organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid
  ));

-- ----- (d) Financial/inventory tables scoped through business_days -----

DROP POLICY IF EXISTS customer_transactions_tenant_policy ON "customer_transactions";
CREATE POLICY customer_transactions_tenant_policy ON "customer_transactions" FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "business_days"
    WHERE "business_days".id = "customer_transactions".business_day_id
      AND "business_days".organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid
  ));

DROP POLICY IF EXISTS supplier_transactions_tenant_policy ON "supplier_transactions";
CREATE POLICY supplier_transactions_tenant_policy ON "supplier_transactions" FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "business_days"
    WHERE "business_days".id = "supplier_transactions".business_day_id
      AND "business_days".organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid
  ));

DROP POLICY IF EXISTS sales_tenant_policy ON "sales";
CREATE POLICY sales_tenant_policy ON "sales" FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "business_days"
    WHERE "business_days".id = "sales".business_day_id
      AND "business_days".organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid
  ));

DROP POLICY IF EXISTS stock_movements_tenant_policy ON "stock_movements";
CREATE POLICY stock_movements_tenant_policy ON "stock_movements" FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "business_days"
    WHERE "business_days".id = "stock_movements".business_day_id
      AND "business_days".organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid
  ));

DROP POLICY IF EXISTS stock_variances_tenant_policy ON "stock_variances";
CREATE POLICY stock_variances_tenant_policy ON "stock_variances" FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "business_days"
    WHERE "business_days".id = "stock_variances".business_day_id
      AND "business_days".organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid
  ));

DROP POLICY IF EXISTS expenses_tenant_policy ON "expenses";
CREATE POLICY expenses_tenant_policy ON "expenses" FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "business_days"
    WHERE "business_days".id = "expenses".business_day_id
      AND "business_days".organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid
  ));

DROP POLICY IF EXISTS collections_tenant_policy ON "collections";
CREATE POLICY collections_tenant_policy ON "collections" FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "business_days"
    WHERE "business_days".id = "collections".business_day_id
      AND "business_days".organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid
  ));

DROP POLICY IF EXISTS purchases_tenant_policy ON "purchases";
CREATE POLICY purchases_tenant_policy ON "purchases" FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "business_days"
    WHERE "business_days".id = "purchases".business_day_id
      AND "business_days".organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid
  ));

-- ----- (e) Tables scoped through their non-business_day parent -----

DROP POLICY IF EXISTS sale_items_tenant_policy ON "sale_items";
CREATE POLICY sale_items_tenant_policy ON "sale_items" FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "sales"
    JOIN "business_days" ON "business_days".id = "sales".business_day_id
    WHERE "sales".id = "sale_items".sale_id
      AND "business_days".organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid
  ));

DROP POLICY IF EXISTS purchase_items_tenant_policy ON "purchase_items";
CREATE POLICY purchase_items_tenant_policy ON "purchase_items" FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "purchases"
    JOIN "business_days" ON "business_days".id = "purchases".business_day_id
    WHERE "purchases".id = "purchase_items".purchase_id
      AND "business_days".organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid
  ));
