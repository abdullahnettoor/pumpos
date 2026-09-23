-- =====================================================================
-- 0001 — Auth bootstrap, provisioning triggers, Row-Level Security
--
-- Custom migration (`drizzle-kit generate --custom`): everything the
-- declarative schema in src/schema.ts cannot express. It holds the CURRENT
-- definition of each object, not a replay of how it got here; the history
-- lives in git (pre-re-baseline chain, #271).
--
-- Written for a fresh database. The old chain is not upgradable to this one:
-- recreate, don't migrate.
--
-- Tenant discriminator: public.current_organization_id(), which resolves the
-- caller's organization from public.users via auth.uid(). The API connects as
-- the owner role and bypasses RLS; these policies guard direct PostgREST
-- access with the publishable (anon) key or a user JWT.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Supabase compatibility shim
--    No-op on Supabase, where these already exist. On a plain Postgres
--    (CI, local) it provides just enough of `auth` for this file to apply.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role;
  END IF;
EXCEPTION WHEN duplicate_object OR unique_violation THEN
  -- Roles are cluster-wide; a concurrent migration may have created them.
  NULL;
END
$$;

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
      raw_app_meta_data jsonb,
      invited_at timestamptz
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'jwt' AND pronamespace = 'auth'::regnamespace) THEN
    CREATE FUNCTION auth.jwt() RETURNS jsonb AS '
      SELECT COALESCE(current_setting(''request.jwt.claims'', true), ''{}'')::jsonb;
    ' LANGUAGE sql STABLE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'uid' AND pronamespace = 'auth'::regnamespace) THEN
    CREATE FUNCTION auth.uid() RETURNS uuid AS '
      SELECT NULLIF(COALESCE(current_setting(''request.jwt.claims'', true), ''{}'')::jsonb ->> ''sub'', '''')::uuid;
    ' LANGUAGE sql STABLE;
  END IF;
END
$$;

-- ---------------------------------------------------------------------
-- 2. Tenant resolver
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_organization_id()
RETURNS uuid AS $$
  SELECT organization_id
  FROM public.users
  WHERE auth_user_id = auth.uid()
    AND status = 'ACTIVE'
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.current_organization_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_organization_id() TO authenticated;

-- ---------------------------------------------------------------------
-- 3. New-user provisioning (auth.users → organization + Owner row)
--
-- A new auth user either links to an existing profile row by email, or,
-- only with an owner intent the end user cannot self-supply, bootstraps
-- a new organization and its Owner. Anything else does nothing.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_existing_user_id uuid;
  v_new_org_id uuid;
  v_new_user_id uuid;
  v_org_name text;
  v_full_name text;
  v_owner_intent boolean;
BEGIN
  IF NEW.email IS NOT NULL THEN
    SELECT id INTO v_existing_user_id FROM public.users WHERE email = NEW.email;
  END IF;

  -- Owner bootstrap requires authority the end user cannot self-supply:
  -- either server-set app metadata (admin createUser) or a server-issued
  -- invite (invited_at is set only by the admin invite flow).
  v_owner_intent :=
    COALESCE(NEW.raw_app_meta_data->>'signup_intent', '') = 'owner'
    OR (
      NEW.invited_at IS NOT NULL
      AND COALESCE(NEW.raw_user_meta_data->>'signup_intent', '') = 'owner'
    );

  IF v_existing_user_id IS NOT NULL THEN
    UPDATE public.users
    SET
      auth_user_id = NEW.id,
      status = 'ACTIVE',
      full_name = COALESCE(NEW.raw_user_meta_data->>'full_name', full_name),
      role = COALESCE(role, 'Staff'),
      updated_at = now()
    WHERE id = v_existing_user_id;

  ELSIF v_owner_intent THEN
    v_org_name := COALESCE(NEW.raw_user_meta_data->>'organization_name', NEW.raw_app_meta_data->>'organization_name', SPLIT_PART(NEW.email, '@', 1) || '''s Station');

    INSERT INTO public.organizations (id, name, subscription_plan, subscription_status, created_at, updated_at)
    VALUES (gen_random_uuid(), v_org_name, 'CORE', 'ACTIVE', now(), now())
    RETURNING id INTO v_new_org_id;

    v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', SPLIT_PART(NEW.email, '@', 1));

    v_new_user_id := gen_random_uuid();
    INSERT INTO public.users (id, organization_id, auth_user_id, full_name, email, role, status, created_at, updated_at)
    VALUES (v_new_user_id, v_new_org_id, NEW.id, v_full_name, NEW.email, 'Owner', 'ACTIVE', now(), now());
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- An invite sets invited_at (and admin updates set app metadata) on an
-- existing auth user, so provisioning must also run on those updates.
DROP TRIGGER IF EXISTS on_auth_user_invited ON auth.users;
CREATE TRIGGER on_auth_user_invited
  AFTER UPDATE OF invited_at, raw_app_meta_data ON auth.users
  FOR EACH ROW
  WHEN (
    (OLD.invited_at IS DISTINCT FROM NEW.invited_at AND NEW.invited_at IS NOT NULL)
    OR OLD.raw_app_meta_data IS DISTINCT FROM NEW.raw_app_meta_data
  )
  EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------
-- 4. Enable RLS on every table in public.
--    A table with RLS enabled and no policy (income_categories,
--    other_income, the two access tables below) is deny-all to tenant
--    roles, which is the intended default.
-- ---------------------------------------------------------------------
ALTER TABLE "attendant_handovers"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "business_days"                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "collections"                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customer_discount_rules"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customer_transactions"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customer_vehicles"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customers"                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dispenser_units"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "document_sequences"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dssr_snapshots"                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE "events"                         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "expense_categories"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "expenses"                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "financial_accounts"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fuel_prices"                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "handover_terminal_entries"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "idempotency_keys"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "income_categories"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoices"                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ledger_entries"                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE "nozzle_readings"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "nozzles"                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organization_capability_grants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organization_limit_overrides"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organizations"                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "other_income"                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_terminals"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "products"                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "purchase_items"                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE "purchases"                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sale_items"                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sales"                          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "shift_staff_assignments"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "shift_summaries"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "shift_templates"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "shift_terminal_links"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "shifts"                         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stations"                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_movements"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_variances"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "supplier_transactions"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "suppliers"                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tanks"                          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_station_assignments"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users"                          ENABLE ROW LEVEL SECURITY;

-- Commercial history is platform-only: no tenant policy, forced RLS, and
-- table grants revoked outright. Tenants only ever see the effective
-- Access Document the server computes.
ALTER TABLE "organization_capability_grants" FORCE ROW LEVEL SECURITY;
ALTER TABLE "organization_limit_overrides"   FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.organization_capability_grants FROM authenticated, anon;
REVOKE ALL ON TABLE public.organization_limit_overrides FROM authenticated, anon;

-- ---------------------------------------------------------------------
-- 5. Tenant policies
-- ---------------------------------------------------------------------

-- (a) Identity tables: read-only to tenants; writes go through the server.
CREATE POLICY organizations_tenant_select_policy ON "organizations" FOR SELECT TO authenticated
  USING (id = public.current_organization_id());

CREATE POLICY users_tenant_select_policy ON "users" FOR SELECT TO authenticated
  USING (organization_id = public.current_organization_id());

CREATE POLICY user_station_assignments_tenant_select_policy ON "user_station_assignments" FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "users"
    WHERE "users".id = "user_station_assignments".user_id
      AND "users".organization_id = public.current_organization_id()
  ));

-- (b) Direct: the table carries its own organization_id.
CREATE POLICY stations_tenant_policy ON "stations" FOR ALL TO authenticated
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());

CREATE POLICY tanks_tenant_policy ON "tanks" FOR ALL TO authenticated
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());

CREATE POLICY dispenser_units_tenant_policy ON "dispenser_units" FOR ALL TO authenticated
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());

CREATE POLICY nozzles_tenant_policy ON "nozzles" FOR ALL TO authenticated
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());

CREATE POLICY payment_terminals_tenant_policy ON "payment_terminals" FOR ALL TO authenticated
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());

CREATE POLICY products_tenant_policy ON "products" FOR ALL TO authenticated
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());

CREATE POLICY business_days_tenant_policy ON "business_days" FOR ALL TO authenticated
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());

CREATE POLICY shift_templates_tenant_policy ON "shift_templates" FOR ALL TO authenticated
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());

CREATE POLICY shifts_tenant_policy ON "shifts" FOR ALL TO authenticated
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());

CREATE POLICY customers_tenant_policy ON "customers" FOR ALL TO authenticated
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());

CREATE POLICY customer_vehicles_tenant_policy ON "customer_vehicles" FOR ALL TO authenticated
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());

CREATE POLICY customer_discount_rules_tenant_policy ON "customer_discount_rules" FOR ALL TO authenticated
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());

CREATE POLICY suppliers_tenant_policy ON "suppliers" FOR ALL TO authenticated
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());

CREATE POLICY expense_categories_tenant_policy ON "expense_categories" FOR ALL TO authenticated
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());

CREATE POLICY dssr_snapshots_tenant_policy ON "dssr_snapshots" FOR ALL TO authenticated
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());

CREATE POLICY events_tenant_policy ON "events" FOR ALL TO authenticated
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());

CREATE POLICY fuel_prices_tenant_policy ON "fuel_prices" FOR ALL TO authenticated
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());

CREATE POLICY attendant_handovers_tenant_policy ON "attendant_handovers" FOR ALL TO authenticated
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());

CREATE POLICY financial_accounts_tenant_policy ON "financial_accounts" FOR ALL TO authenticated
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());

CREATE POLICY ledger_entries_tenant_policy ON "ledger_entries" FOR ALL TO authenticated
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());

CREATE POLICY idempotency_keys_tenant_policy ON "idempotency_keys" FOR ALL TO authenticated
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());

CREATE POLICY invoices_tenant_policy ON "invoices" FOR ALL TO authenticated
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());

CREATE POLICY document_sequences_tenant_policy ON "document_sequences" FOR ALL TO authenticated
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());

CREATE POLICY handover_terminal_entries_tenant_policy ON "handover_terminal_entries" FOR ALL TO authenticated
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());

-- (c) Via shifts: rows anchored to a shift.
CREATE POLICY shift_staff_assignments_tenant_policy ON "shift_staff_assignments" FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "shifts"
    WHERE "shifts".id = "shift_staff_assignments".shift_id
      AND "shifts".organization_id = public.current_organization_id()
  ));

CREATE POLICY shift_terminal_links_tenant_policy ON "shift_terminal_links" FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "shifts"
    WHERE "shifts".id = "shift_terminal_links".shift_id
      AND "shifts".organization_id = public.current_organization_id()
  ));

CREATE POLICY nozzle_readings_tenant_policy ON "nozzle_readings" FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "shifts"
    WHERE "shifts".id = "nozzle_readings".shift_id
      AND "shifts".organization_id = public.current_organization_id()
  ));

CREATE POLICY shift_summaries_tenant_policy ON "shift_summaries" FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "shifts"
    WHERE "shifts".id = "shift_summaries".shift_id
      AND "shifts".organization_id = public.current_organization_id()
  ));

-- (d) Via business_days: financial and inventory rows anchored to a day.
CREATE POLICY customer_transactions_tenant_policy ON "customer_transactions" FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "business_days"
    WHERE "business_days".id = "customer_transactions".business_day_id
      AND "business_days".organization_id = public.current_organization_id()
  ));

CREATE POLICY supplier_transactions_tenant_policy ON "supplier_transactions" FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "business_days"
    WHERE "business_days".id = "supplier_transactions".business_day_id
      AND "business_days".organization_id = public.current_organization_id()
  ));

CREATE POLICY sales_tenant_policy ON "sales" FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "business_days"
    WHERE "business_days".id = "sales".business_day_id
      AND "business_days".organization_id = public.current_organization_id()
  ));

CREATE POLICY stock_movements_tenant_policy ON "stock_movements" FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "business_days"
    WHERE "business_days".id = "stock_movements".business_day_id
      AND "business_days".organization_id = public.current_organization_id()
  ));

CREATE POLICY stock_variances_tenant_policy ON "stock_variances" FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "business_days"
    WHERE "business_days".id = "stock_variances".business_day_id
      AND "business_days".organization_id = public.current_organization_id()
  ));

CREATE POLICY expenses_tenant_policy ON "expenses" FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "business_days"
    WHERE "business_days".id = "expenses".business_day_id
      AND "business_days".organization_id = public.current_organization_id()
  ));

CREATE POLICY collections_tenant_policy ON "collections" FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "business_days"
    WHERE "business_days".id = "collections".business_day_id
      AND "business_days".organization_id = public.current_organization_id()
  ));

CREATE POLICY purchases_tenant_policy ON "purchases" FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "business_days"
    WHERE "business_days".id = "purchases".business_day_id
      AND "business_days".organization_id = public.current_organization_id()
  ));

-- (e) Via another parent row.
CREATE POLICY sale_items_tenant_policy ON "sale_items" FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "sales"
    JOIN "business_days" ON "business_days".id = "sales".business_day_id
    WHERE "sales".id = "sale_items".sale_id
      AND "business_days".organization_id = public.current_organization_id()
  ));

CREATE POLICY purchase_items_tenant_policy ON "purchase_items" FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "purchases"
    JOIN "business_days" ON "business_days".id = "purchases".business_day_id
    WHERE "purchases".id = "purchase_items".purchase_id
      AND "business_days".organization_id = public.current_organization_id()
  ));
