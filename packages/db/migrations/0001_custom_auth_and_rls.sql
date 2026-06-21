-- Conditionally create auth schema and users table if they do not exist (for vanilla local Postgres compatibility)
-- Wrapped in a DO block to prevent permission checks on remote Supabase instances where schema 'auth' already exists
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

--> statement-breakpoint
-- Trigger function to handle user creation sync
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
  -- 1. Check if user already exists by email in public.users (only if email is provided)
  IF NEW.email IS NOT NULL THEN
    SELECT id INTO v_existing_user_id FROM public.users WHERE email = NEW.email;
  END IF;

  IF v_existing_user_id IS NOT NULL THEN
    -- User exists (Invitation Flow)
    -- Update the existing user with the auth_user_id and activate them
    UPDATE public.users
    SET 
      auth_user_id = NEW.id,
      status = 'ACTIVE',
      full_name = COALESCE(NEW.raw_user_meta_data->>'full_name', full_name),
      updated_at = now()
    WHERE id = v_existing_user_id;
  ELSE
    -- User does not exist (Self-Signup / Owner Flow)
    -- Resolve organization name
    v_org_name := COALESCE(NEW.raw_user_meta_data->>'organization_name', NEW.raw_user_meta_data->>'company_name', SPLIT_PART(NEW.email, '@', 1) || '''s Station');
    
    -- Create a new organization
    INSERT INTO public.organizations (id, name, subscription_plan, subscription_status, created_at, updated_at)
    VALUES (gen_random_uuid(), v_org_name, 'Core', 'Active', now(), now())
    RETURNING id INTO v_new_org_id;

    -- Resolve full name
    v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', SPLIT_PART(NEW.email, '@', 1));

    -- Create new user
    v_new_user_id := gen_random_uuid();
    INSERT INTO public.users (id, organization_id, auth_user_id, full_name, email, status, created_at, updated_at)
    VALUES (v_new_user_id, v_new_org_id, NEW.id, v_full_name, NEW.email, 'ACTIVE', now(), now());

    -- Resolve default role (Owner for self-signup)
    v_default_role := COALESCE(NEW.raw_user_meta_data->>'role', 'Owner');

    -- Insert role assignment
    INSERT INTO public.user_roles (id, user_id, role, created_at)
    VALUES (gen_random_uuid(), v_new_user_id, v_default_role, now());
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop trigger if it exists and recreate it
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

--> statement-breakpoint
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "stations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "user_roles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "user_station_assignments" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tanks" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "dispenser_units" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "nozzles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "shift_templates" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "shifts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "shift_staff_assignments" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "nozzle_readings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "customers" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "customer_transactions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "suppliers" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "supplier_transactions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "sales" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "sale_items" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "stock_movements" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "stock_variances" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "expense_categories" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "expenses" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "collections" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "purchases" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "dssr_snapshots" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "business_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "sync_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "fuel_prices" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "attendant_handovers" ENABLE ROW LEVEL SECURITY;

--> statement-breakpoint
CREATE POLICY organizations_tenant_policy ON "organizations"
  FOR ALL TO authenticated
  USING (id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid);

--> statement-breakpoint
CREATE POLICY stations_tenant_policy ON "stations"
  FOR ALL TO authenticated
  USING (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid)
  WITH CHECK (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid);

--> statement-breakpoint
CREATE POLICY users_tenant_policy ON "users"
  FOR ALL TO authenticated
  USING (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid)
  WITH CHECK (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid);

--> statement-breakpoint
CREATE POLICY tanks_tenant_policy ON "tanks"
  FOR ALL TO authenticated
  USING (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid)
  WITH CHECK (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid);

--> statement-breakpoint
CREATE POLICY dispenser_units_tenant_policy ON "dispenser_units"
  FOR ALL TO authenticated
  USING (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid)
  WITH CHECK (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid);

--> statement-breakpoint
CREATE POLICY nozzles_tenant_policy ON "nozzles"
  FOR ALL TO authenticated
  USING (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid)
  WITH CHECK (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid);

--> statement-breakpoint
CREATE POLICY products_tenant_policy ON "products"
  FOR ALL TO authenticated
  USING (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid)
  WITH CHECK (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid);

--> statement-breakpoint
CREATE POLICY shift_templates_tenant_policy ON "shift_templates"
  FOR ALL TO authenticated
  USING (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid)
  WITH CHECK (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid);

--> statement-breakpoint
CREATE POLICY shifts_tenant_policy ON "shifts"
  FOR ALL TO authenticated
  USING (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid)
  WITH CHECK (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid);

--> statement-breakpoint
CREATE POLICY customers_tenant_policy ON "customers"
  FOR ALL TO authenticated
  USING (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid)
  WITH CHECK (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid);

--> statement-breakpoint
CREATE POLICY suppliers_tenant_policy ON "suppliers"
  FOR ALL TO authenticated
  USING (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid)
  WITH CHECK (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid);

--> statement-breakpoint
CREATE POLICY expense_categories_tenant_policy ON "expense_categories"
  FOR ALL TO authenticated
  USING (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid)
  WITH CHECK (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid);

--> statement-breakpoint
CREATE POLICY audit_logs_tenant_policy ON "audit_logs"
  FOR ALL TO authenticated
  USING (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid)
  WITH CHECK (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid);

--> statement-breakpoint
CREATE POLICY business_events_tenant_policy ON "business_events"
  FOR ALL TO authenticated
  USING (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid)
  WITH CHECK (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid);

--> statement-breakpoint
CREATE POLICY fuel_prices_tenant_policy ON "fuel_prices"
  FOR ALL TO authenticated
  USING (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid)
  WITH CHECK (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid);

--> statement-breakpoint
CREATE POLICY attendant_handovers_tenant_policy ON "attendant_handovers"
  FOR ALL TO authenticated
  USING (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid)
  WITH CHECK (organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid);

--> statement-breakpoint
CREATE POLICY user_roles_tenant_policy ON "user_roles"
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "users" 
    WHERE "users".id = "user_roles".user_id 
    AND "users".organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid
  ));

--> statement-breakpoint
CREATE POLICY user_station_assignments_tenant_policy ON "user_station_assignments"
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "users" 
    WHERE "users".id = "user_station_assignments".user_id 
    AND "users".organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid
  ));

--> statement-breakpoint
CREATE POLICY shift_staff_assignments_tenant_policy ON "shift_staff_assignments"
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "shifts" 
    WHERE "shifts".id = "shift_staff_assignments".shift_id 
    AND "shifts".organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid
  ));

--> statement-breakpoint
CREATE POLICY nozzle_readings_tenant_policy ON "nozzle_readings"
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "shifts" 
    WHERE "shifts".id = "nozzle_readings".shift_id 
    AND "shifts".organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid
  ));

--> statement-breakpoint
CREATE POLICY customer_transactions_tenant_policy ON "customer_transactions"
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "shifts" 
    WHERE "shifts".id = "customer_transactions".shift_id 
    AND "shifts".organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid
  ));

--> statement-breakpoint
CREATE POLICY supplier_transactions_tenant_policy ON "supplier_transactions"
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "shifts" 
    WHERE "shifts".id = "supplier_transactions".shift_id 
    AND "shifts".organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid
  ));

--> statement-breakpoint
CREATE POLICY sales_tenant_policy ON "sales"
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "shifts" 
    WHERE "shifts".id = "sales".shift_id 
    AND "shifts".organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid
  ));

--> statement-breakpoint
CREATE POLICY sale_items_tenant_policy ON "sale_items"
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "sales" 
    JOIN "shifts" ON "shifts".id = "sales".shift_id
    WHERE "sales".id = "sale_items".sale_id 
    AND "shifts".organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid
  ));

--> statement-breakpoint
CREATE POLICY stock_movements_tenant_policy ON "stock_movements"
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "shifts" 
    WHERE "shifts".id = "stock_movements".shift_id 
    AND "shifts".organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid
  ));

--> statement-breakpoint
CREATE POLICY stock_variances_tenant_policy ON "stock_variances"
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "shifts" 
    WHERE "shifts".id = "stock_variances".shift_id 
    AND "shifts".organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid
  ));

--> statement-breakpoint
CREATE POLICY expenses_tenant_policy ON "expenses"
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "shifts" 
    WHERE "shifts".id = "expenses".shift_id 
    AND "shifts".organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid
  ));

--> statement-breakpoint
CREATE POLICY collections_tenant_policy ON "collections"
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "shifts" 
    WHERE "shifts".id = "collections".shift_id 
    AND "shifts".organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid
  ));

--> statement-breakpoint
CREATE POLICY purchases_tenant_policy ON "purchases"
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "shifts" 
    WHERE "shifts".id = "purchases".shift_id 
    AND "shifts".organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid
  ));

--> statement-breakpoint
CREATE POLICY dssr_snapshots_tenant_policy ON "dssr_snapshots"
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "shifts" 
    WHERE "shifts".id = "dssr_snapshots".shift_id 
    AND "shifts".organization_id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid
  ));

--> statement-breakpoint
CREATE POLICY sync_events_tenant_policy ON "sync_events"
  FOR ALL TO authenticated
  USING (((payload ->> 'organization_id')::uuid) = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid);

--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS expense_categories_org_name_idx ON "expense_categories" ("organization_id", "name");
