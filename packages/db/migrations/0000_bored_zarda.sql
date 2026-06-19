CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"station_id" uuid,
	"entity_type" varchar(100) NOT NULL,
	"entity_id" uuid NOT NULL,
	"action" varchar(50) NOT NULL,
	"before_data" jsonb,
	"after_data" jsonb,
	"performed_by" uuid NOT NULL,
	"performed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"organization_id" uuid NOT NULL,
	"station_id" uuid,
	"entity_type" varchar(100) NOT NULL,
	"entity_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"occurred_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_number" varchar(100) NOT NULL,
	"shift_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"payment_method" varchar(50) NOT NULL,
	"notes" varchar(500),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shift_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"transaction_type" varchar(50) NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"reference_type" varchar(50),
	"reference_id" uuid,
	"notes" varchar(500),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"station_id" uuid,
	"customer_type" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"phone" varchar(50),
	"credit_limit" numeric(12, 2),
	"fleet_code" varchar(100),
	"metadata" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dispenser_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"station_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"code" varchar(50) NOT NULL,
	"status" varchar(50) DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_sequences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"document_type" varchar(50) NOT NULL,
	"current_number" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dssr_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shift_id" uuid NOT NULL,
	"snapshot_data" jsonb NOT NULL,
	"generated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expense_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shift_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"description" varchar(255),
	"parent_expense_id" uuid,
	"adjustment_reason" varchar(255),
	"status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nozzle_readings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shift_id" uuid NOT NULL,
	"nozzle_id" uuid NOT NULL,
	"opening_reading" numeric(15, 3) NOT NULL,
	"closing_reading" numeric(15, 3) NOT NULL,
	"volume_sold" numeric(12, 3) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nozzles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"station_id" uuid NOT NULL,
	"du_id" uuid NOT NULL,
	"tank_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"current_reading" numeric(15, 3) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"subscription_plan" varchar(50) DEFAULT 'Core' NOT NULL,
	"subscription_status" varchar(50) DEFAULT 'Active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"code" varchar(100) NOT NULL,
	"product_type" varchar(50) NOT NULL,
	"stock_tracked" boolean DEFAULT true NOT NULL,
	"is_taxable" boolean DEFAULT true NOT NULL,
	"unit" varchar(50) NOT NULL,
	"tax_config" jsonb DEFAULT '{"gst_rate":18,"hsn_code":""}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_number" varchar(100) NOT NULL,
	"shift_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"invoice_number" varchar(100),
	"amount" numeric(12, 2) NOT NULL,
	"notes" varchar(500),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sale_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"unit_price" numeric(12, 2) NOT NULL,
	"tax_amount" numeric(12, 2) NOT NULL,
	"line_total" numeric(12, 2) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_number" varchar(100) NOT NULL,
	"shift_id" uuid NOT NULL,
	"sale_type" varchar(50) NOT NULL,
	"customer_id" uuid,
	"subtotal_amount" numeric(12, 2) NOT NULL,
	"tax_amount" numeric(12, 2) NOT NULL,
	"total_amount" numeric(12, 2) NOT NULL,
	"notes" varchar(500),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shift_staff_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shift_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"du_id" uuid NOT NULL,
	"assigned_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shift_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"start_time" varchar(10) NOT NULL,
	"end_time" varchar(10) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"station_id" uuid NOT NULL,
	"shift_template_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'OPEN' NOT NULL,
	"opened_by" uuid NOT NULL,
	"opened_at" timestamp DEFAULT now() NOT NULL,
	"closed_by" uuid,
	"closed_at" timestamp,
	"locked_at" timestamp,
	"opening_cash" numeric(12, 2) NOT NULL,
	"closing_cash" numeric(12, 2),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"code" varchar(50) NOT NULL,
	"address" varchar(500),
	"phone" varchar(50),
	"settings" jsonb DEFAULT '{"shift_grace_minutes":15,"shift_lock_grace_days":3,"offline_warning_days":3,"offline_critical_days":7}'::jsonb NOT NULL,
	"onboarding_status" varchar(50) DEFAULT 'NOT_STARTED' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shift_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"movement_type" varchar(50) NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"reference_type" varchar(50),
	"reference_id" uuid,
	"notes" varchar(500),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_variances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shift_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"expected_quantity" numeric(12, 3) NOT NULL,
	"actual_quantity" numeric(12, 3) NOT NULL,
	"variance_quantity" numeric(12, 3) NOT NULL,
	"reason" varchar(255),
	"approved_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shift_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"transaction_type" varchar(50) NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"reference_type" varchar(50),
	"reference_id" uuid,
	"notes" varchar(500),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"station_id" uuid,
	"name" varchar(255) NOT NULL,
	"phone" varchar(50),
	"metadata" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_events" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"entity_type" varchar(100) NOT NULL,
	"entity_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"synced_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "tanks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"station_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"product_id" uuid NOT NULL,
	"capacity" numeric(12, 2) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role" varchar(50) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_station_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"station_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"auth_user_id" uuid,
	"full_name" varchar(255) NOT NULL,
	"email" varchar(255),
	"phone" varchar(50),
	"status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_events" ADD CONSTRAINT "business_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_events" ADD CONSTRAINT "business_events_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_transactions" ADD CONSTRAINT "customer_transactions_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_transactions" ADD CONSTRAINT "customer_transactions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispenser_units" ADD CONSTRAINT "dispenser_units_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispenser_units" ADD CONSTRAINT "dispenser_units_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_sequences" ADD CONSTRAINT "document_sequences_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dssr_snapshots" ADD CONSTRAINT "dssr_snapshots_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_expense_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."expense_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nozzle_readings" ADD CONSTRAINT "nozzle_readings_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nozzle_readings" ADD CONSTRAINT "nozzle_readings_nozzle_id_nozzles_id_fk" FOREIGN KEY ("nozzle_id") REFERENCES "public"."nozzles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nozzles" ADD CONSTRAINT "nozzles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nozzles" ADD CONSTRAINT "nozzles_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nozzles" ADD CONSTRAINT "nozzles_du_id_dispenser_units_id_fk" FOREIGN KEY ("du_id") REFERENCES "public"."dispenser_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nozzles" ADD CONSTRAINT "nozzles_tank_id_tanks_id_fk" FOREIGN KEY ("tank_id") REFERENCES "public"."tanks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_staff_assignments" ADD CONSTRAINT "shift_staff_assignments_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_staff_assignments" ADD CONSTRAINT "shift_staff_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_staff_assignments" ADD CONSTRAINT "shift_staff_assignments_du_id_dispenser_units_id_fk" FOREIGN KEY ("du_id") REFERENCES "public"."dispenser_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_templates" ADD CONSTRAINT "shift_templates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_shift_template_id_shift_templates_id_fk" FOREIGN KEY ("shift_template_id") REFERENCES "public"."shift_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_opened_by_users_id_fk" FOREIGN KEY ("opened_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stations" ADD CONSTRAINT "stations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_variances" ADD CONSTRAINT "stock_variances_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_variances" ADD CONSTRAINT "stock_variances_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_variances" ADD CONSTRAINT "stock_variances_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_transactions" ADD CONSTRAINT "supplier_transactions_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_transactions" ADD CONSTRAINT "supplier_transactions_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tanks" ADD CONSTRAINT "tanks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tanks" ADD CONSTRAINT "tanks_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_station_assignments" ADD CONSTRAINT "user_station_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_station_assignments" ADD CONSTRAINT "user_station_assignments_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
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

--> statement-breakpoint
-- Drop trigger if it exists and recreate it
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

--> statement-breakpoint
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

--> statement-breakpoint
-- 1. Enable RLS on all tables
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
-- 2. Define Policy Helper variable / JWT claims checks
-- Organization matching for organizations table
CREATE POLICY organizations_tenant_policy ON "organizations"
  FOR ALL TO authenticated
  USING (id = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid);

--> statement-breakpoint
-- Direct Tenancy Tables Policy Generator
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
-- 3. Indirect Tenancy Tables Policies (Linked through Shifts or Users)
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
-- 4. Sync Events Table (JSON Payload check)
CREATE POLICY sync_events_tenant_policy ON "sync_events"
  FOR ALL TO authenticated
  USING (((payload ->> 'organization_id')::uuid) = (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid);

--> statement-breakpoint
-- Add unique index for expense_categories only (excluding suppliers)
CREATE UNIQUE INDEX IF NOT EXISTS expense_categories_org_name_idx ON "expense_categories" ("organization_id", "name");