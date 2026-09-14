-- =====================================================================
-- Authoritative RLS tenancy
--
-- Replaces the user-editable `auth.jwt() -> 'user_metadata' ->> 'organization_id'`
-- tenant discriminator with an authoritative lookup of public.users by
-- auth.uid(). A user who edits their own Supabase user metadata and refreshes
-- their token gains nothing: tenancy now derives from the server-controlled
-- users row.
--
-- Also:
--   * users / user_station_assignments / organizations become SELECT-only for
--     `authenticated` (privileged changes flow through the backend, which
--     connects as the table owner and is not subject to these policies).
--   * handle_new_user() no longer trusts caller-supplied signup metadata
--     alone: the owner-bootstrap branch requires server-set app metadata or a
--     server-issued invite (invited_at), and the created role is pinned to
--     'Owner'.
--
-- Deployed-schema compatible and idempotent: safe to re-run.
-- =====================================================================

-- ----- 0. Dev-shim compatibility (no-op on Supabase) -----
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'uid' AND pronamespace = 'auth'::regnamespace) THEN
    CREATE FUNCTION auth.uid() RETURNS uuid AS '
      SELECT NULLIF(COALESCE(current_setting(''request.jwt.claims'', true), ''{}'')::jsonb ->> ''sub'', '''')::uuid;
    ' LANGUAGE sql STABLE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'invited_at'
  ) THEN
    BEGIN
      ALTER TABLE auth.users ADD COLUMN invited_at timestamptz;
    EXCEPTION WHEN insufficient_privilege THEN
      NULL; -- managed Supabase already has the column
    END;
  END IF;
END
$$;

-- ----- 1. Authoritative tenancy helper -----
-- SECURITY DEFINER so the lookup is not itself blocked by the users policy.
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

-- ----- 2. Gated new-user provisioning -----
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
    VALUES (gen_random_uuid(), v_org_name, 'Core', 'Active', now(), now())
    RETURNING id INTO v_new_org_id;

    v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', SPLIT_PART(NEW.email, '@', 1));

    v_new_user_id := gen_random_uuid();
    INSERT INTO public.users (id, organization_id, auth_user_id, full_name, email, role, status, created_at, updated_at)
    VALUES (v_new_user_id, v_new_org_id, NEW.id, v_full_name, NEW.email, 'Owner', 'ACTIVE', now(), now());
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ----- 3. Server-managed tables: SELECT-only for authenticated -----

DROP POLICY IF EXISTS organizations_tenant_policy ON "organizations";
DROP POLICY IF EXISTS organizations_tenant_select_policy ON "organizations";
CREATE POLICY organizations_tenant_select_policy ON "organizations" FOR SELECT TO authenticated
  USING (id = public.current_organization_id());

DROP POLICY IF EXISTS users_tenant_policy ON "users";
DROP POLICY IF EXISTS users_tenant_select_policy ON "users";
CREATE POLICY users_tenant_select_policy ON "users" FOR SELECT TO authenticated
  USING (organization_id = public.current_organization_id());

DROP POLICY IF EXISTS user_station_assignments_tenant_policy ON "user_station_assignments";
DROP POLICY IF EXISTS user_station_assignments_tenant_select_policy ON "user_station_assignments";
CREATE POLICY user_station_assignments_tenant_select_policy ON "user_station_assignments" FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "users"
    WHERE "users".id = "user_station_assignments".user_id
      AND "users".organization_id = public.current_organization_id()
  ));

-- ----- 4. Tenant policies re-created on the authoritative helper -----

DROP POLICY IF EXISTS stations_tenant_policy ON "stations";
CREATE POLICY stations_tenant_policy ON "stations" FOR ALL TO authenticated
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());
DROP POLICY IF EXISTS tanks_tenant_policy ON "tanks";
CREATE POLICY tanks_tenant_policy ON "tanks" FOR ALL TO authenticated
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());

DROP POLICY IF EXISTS dispenser_units_tenant_policy ON "dispenser_units";
CREATE POLICY dispenser_units_tenant_policy ON "dispenser_units" FOR ALL TO authenticated
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());

DROP POLICY IF EXISTS nozzles_tenant_policy ON "nozzles";
CREATE POLICY nozzles_tenant_policy ON "nozzles" FOR ALL TO authenticated
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());

DROP POLICY IF EXISTS payment_terminals_tenant_policy ON "payment_terminals";
CREATE POLICY payment_terminals_tenant_policy ON "payment_terminals" FOR ALL TO authenticated
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());

DROP POLICY IF EXISTS products_tenant_policy ON "products";
CREATE POLICY products_tenant_policy ON "products" FOR ALL TO authenticated
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());

DROP POLICY IF EXISTS business_days_tenant_policy ON "business_days";
CREATE POLICY business_days_tenant_policy ON "business_days" FOR ALL TO authenticated
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());

DROP POLICY IF EXISTS shift_templates_tenant_policy ON "shift_templates";
CREATE POLICY shift_templates_tenant_policy ON "shift_templates" FOR ALL TO authenticated
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());

DROP POLICY IF EXISTS shifts_tenant_policy ON "shifts";
CREATE POLICY shifts_tenant_policy ON "shifts" FOR ALL TO authenticated
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());

DROP POLICY IF EXISTS customers_tenant_policy ON "customers";
CREATE POLICY customers_tenant_policy ON "customers" FOR ALL TO authenticated
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());

DROP POLICY IF EXISTS customer_vehicles_tenant_policy ON "customer_vehicles";
CREATE POLICY customer_vehicles_tenant_policy ON "customer_vehicles" FOR ALL TO authenticated
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());

DROP POLICY IF EXISTS customer_discount_rules_tenant_policy ON "customer_discount_rules";
CREATE POLICY customer_discount_rules_tenant_policy ON "customer_discount_rules" FOR ALL TO authenticated
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());

DROP POLICY IF EXISTS suppliers_tenant_policy ON "suppliers";
CREATE POLICY suppliers_tenant_policy ON "suppliers" FOR ALL TO authenticated
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());

DROP POLICY IF EXISTS expense_categories_tenant_policy ON "expense_categories";
CREATE POLICY expense_categories_tenant_policy ON "expense_categories" FOR ALL TO authenticated
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());

DROP POLICY IF EXISTS dssr_snapshots_tenant_policy ON "dssr_snapshots";
CREATE POLICY dssr_snapshots_tenant_policy ON "dssr_snapshots" FOR ALL TO authenticated
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());

DROP POLICY IF EXISTS events_tenant_policy ON "events";
CREATE POLICY events_tenant_policy ON "events" FOR ALL TO authenticated
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());

DROP POLICY IF EXISTS fuel_prices_tenant_policy ON "fuel_prices";
CREATE POLICY fuel_prices_tenant_policy ON "fuel_prices" FOR ALL TO authenticated
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());

DROP POLICY IF EXISTS attendant_handovers_tenant_policy ON "attendant_handovers";
CREATE POLICY attendant_handovers_tenant_policy ON "attendant_handovers" FOR ALL TO authenticated
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());

-- --- (a) New tables added between 0002 and 0021, previously without RLS ---

DROP POLICY IF EXISTS financial_accounts_tenant_policy ON "financial_accounts";
CREATE POLICY financial_accounts_tenant_policy ON "financial_accounts" FOR ALL TO authenticated
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());

DROP POLICY IF EXISTS ledger_entries_tenant_policy ON "ledger_entries";
CREATE POLICY ledger_entries_tenant_policy ON "ledger_entries" FOR ALL TO authenticated
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());

DROP POLICY IF EXISTS idempotency_keys_tenant_policy ON "idempotency_keys";
CREATE POLICY idempotency_keys_tenant_policy ON "idempotency_keys" FOR ALL TO authenticated
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());

DROP POLICY IF EXISTS invoices_tenant_policy ON "invoices";
CREATE POLICY invoices_tenant_policy ON "invoices" FOR ALL TO authenticated
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());

DROP POLICY IF EXISTS document_sequences_tenant_policy ON "document_sequences";
CREATE POLICY document_sequences_tenant_policy ON "document_sequences" FOR ALL TO authenticated
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());

DROP POLICY IF EXISTS handover_terminal_entries_tenant_policy ON "handover_terminal_entries";
CREATE POLICY handover_terminal_entries_tenant_policy ON "handover_terminal_entries" FOR ALL TO authenticated
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());

-- ----- (c) Tables scoped through their parent shift (shift_id NOT NULL) -----

DROP POLICY IF EXISTS shift_staff_assignments_tenant_policy ON "shift_staff_assignments";
CREATE POLICY shift_staff_assignments_tenant_policy ON "shift_staff_assignments" FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "shifts"
    WHERE "shifts".id = "shift_staff_assignments".shift_id
      AND "shifts".organization_id = public.current_organization_id()
  ));

DROP POLICY IF EXISTS shift_terminal_links_tenant_policy ON "shift_terminal_links";
CREATE POLICY shift_terminal_links_tenant_policy ON "shift_terminal_links" FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "shifts"
    WHERE "shifts".id = "shift_terminal_links".shift_id
      AND "shifts".organization_id = public.current_organization_id()
  ));

DROP POLICY IF EXISTS nozzle_readings_tenant_policy ON "nozzle_readings";
CREATE POLICY nozzle_readings_tenant_policy ON "nozzle_readings" FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "shifts"
    WHERE "shifts".id = "nozzle_readings".shift_id
      AND "shifts".organization_id = public.current_organization_id()
  ));

DROP POLICY IF EXISTS shift_summaries_tenant_policy ON "shift_summaries";
CREATE POLICY shift_summaries_tenant_policy ON "shift_summaries" FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "shifts"
    WHERE "shifts".id = "shift_summaries".shift_id
      AND "shifts".organization_id = public.current_organization_id()
  ));

-- ----- (d) Financial/inventory tables scoped through business_days -----

DROP POLICY IF EXISTS customer_transactions_tenant_policy ON "customer_transactions";
CREATE POLICY customer_transactions_tenant_policy ON "customer_transactions" FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "business_days"
    WHERE "business_days".id = "customer_transactions".business_day_id
      AND "business_days".organization_id = public.current_organization_id()
  ));

DROP POLICY IF EXISTS supplier_transactions_tenant_policy ON "supplier_transactions";
CREATE POLICY supplier_transactions_tenant_policy ON "supplier_transactions" FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "business_days"
    WHERE "business_days".id = "supplier_transactions".business_day_id
      AND "business_days".organization_id = public.current_organization_id()
  ));

DROP POLICY IF EXISTS sales_tenant_policy ON "sales";
CREATE POLICY sales_tenant_policy ON "sales" FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "business_days"
    WHERE "business_days".id = "sales".business_day_id
      AND "business_days".organization_id = public.current_organization_id()
  ));

DROP POLICY IF EXISTS stock_movements_tenant_policy ON "stock_movements";
CREATE POLICY stock_movements_tenant_policy ON "stock_movements" FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "business_days"
    WHERE "business_days".id = "stock_movements".business_day_id
      AND "business_days".organization_id = public.current_organization_id()
  ));

DROP POLICY IF EXISTS stock_variances_tenant_policy ON "stock_variances";
CREATE POLICY stock_variances_tenant_policy ON "stock_variances" FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "business_days"
    WHERE "business_days".id = "stock_variances".business_day_id
      AND "business_days".organization_id = public.current_organization_id()
  ));

DROP POLICY IF EXISTS expenses_tenant_policy ON "expenses";
CREATE POLICY expenses_tenant_policy ON "expenses" FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "business_days"
    WHERE "business_days".id = "expenses".business_day_id
      AND "business_days".organization_id = public.current_organization_id()
  ));

DROP POLICY IF EXISTS collections_tenant_policy ON "collections";
CREATE POLICY collections_tenant_policy ON "collections" FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "business_days"
    WHERE "business_days".id = "collections".business_day_id
      AND "business_days".organization_id = public.current_organization_id()
  ));

DROP POLICY IF EXISTS purchases_tenant_policy ON "purchases";
CREATE POLICY purchases_tenant_policy ON "purchases" FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "business_days"
    WHERE "business_days".id = "purchases".business_day_id
      AND "business_days".organization_id = public.current_organization_id()
  ));

-- ----- (e) Tables scoped through their non-business_day parent -----

DROP POLICY IF EXISTS sale_items_tenant_policy ON "sale_items";
CREATE POLICY sale_items_tenant_policy ON "sale_items" FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "sales"
    JOIN "business_days" ON "business_days".id = "sales".business_day_id
    WHERE "sales".id = "sale_items".sale_id
      AND "business_days".organization_id = public.current_organization_id()
  ));

DROP POLICY IF EXISTS purchase_items_tenant_policy ON "purchase_items";
CREATE POLICY purchase_items_tenant_policy ON "purchase_items" FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "purchases"
    JOIN "business_days" ON "business_days".id = "purchases".business_day_id
    WHERE "purchases".id = "purchase_items".purchase_id
      AND "business_days".organization_id = public.current_organization_id()
  ));
