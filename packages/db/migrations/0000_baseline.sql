CREATE TABLE "attendant_handovers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"station_id" uuid NOT NULL,
	"shift_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"du_id" uuid NOT NULL,
	"cash_handed_over" numeric(12, 2) DEFAULT '0' NOT NULL,
	"card_handed_over" numeric(12, 2) DEFAULT '0' NOT NULL,
	"upi_handed_over" numeric(12, 2) DEFAULT '0' NOT NULL,
	"credit_handed_over" numeric(12, 2) DEFAULT '0' NOT NULL,
	"testing_volume" numeric(10, 3) DEFAULT '0' NOT NULL,
	"expected_sales" numeric(12, 2) DEFAULT '0' NOT NULL,
	"variance_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"station_id" uuid NOT NULL,
	"business_date" varchar(10) NOT NULL,
	"status" varchar(20) DEFAULT 'OPEN' NOT NULL,
	"opened_by" uuid NOT NULL,
	"opened_at" timestamp DEFAULT now() NOT NULL,
	"closed_by" uuid,
	"closed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_number" varchar(100) NOT NULL,
	"shift_id" uuid,
	"business_day_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"vehicle_id" uuid,
	"amount" numeric(12, 2) NOT NULL,
	"payment_method" varchar(50) NOT NULL,
	"notes" varchar(500),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_discount_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"product_id" uuid,
	"rule_type" varchar(50) NOT NULL,
	"value" numeric(10, 4) NOT NULL,
	"threshold_litres" numeric(12, 2),
	"valid_from" timestamp NOT NULL,
	"valid_until" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shift_id" uuid,
	"business_day_id" uuid NOT NULL,
	"customer_id" uuid,
	"vehicle_id" uuid,
	"product_id" uuid,
	"attendant_id" uuid,
	"du_id" uuid,
	"transaction_type" varchar(50) NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"quantity" numeric(12, 3),
	"unit_price" numeric(12, 2),
	"reference_type" varchar(50),
	"reference_id" uuid,
	"notes" varchar(500),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"registration_number" varchar(50) NOT NULL,
	"vehicle_type" varchar(50) NOT NULL,
	"default_product_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
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
	"is_prepaid" boolean DEFAULT false NOT NULL,
	"prepaid_balance" numeric(14, 2) DEFAULT '0' NOT NULL,
	"settlement_cycle" varchar(20) DEFAULT 'OPEN' NOT NULL,
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
	"organization_id" uuid NOT NULL,
	"doc_type" varchar(30) DEFAULT 'INVOICE' NOT NULL,
	"scope" varchar(40) DEFAULT '' NOT NULL,
	"financial_year" varchar(9) DEFAULT '' NOT NULL,
	"last_number" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "document_sequences_organization_id_doc_type_scope_financial_year_pk" PRIMARY KEY("organization_id","doc_type","scope","financial_year")
);
--> statement-breakpoint
CREATE TABLE "dssr_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"station_id" uuid NOT NULL,
	"business_date" varchar(10) NOT NULL,
	"snapshot_data" jsonb NOT NULL,
	"generated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"organization_id" uuid NOT NULL,
	"station_id" uuid,
	"business_day_id" uuid,
	"aggregate_type" varchar(100) NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"occurred_at" timestamp NOT NULL,
	"recorded_at" timestamp DEFAULT now() NOT NULL,
	"actor_id" uuid,
	"correlation_id" uuid,
	"causation_id" uuid,
	"payload" jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "events_event_id_unique" UNIQUE("event_id")
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
	"shift_id" uuid,
	"business_day_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"paid_from" varchar(20) DEFAULT 'SHIFT_CASH' NOT NULL,
	"affects_drawer" boolean DEFAULT true NOT NULL,
	"description" varchar(255),
	"parent_expense_id" uuid,
	"adjustment_reason" varchar(255),
	"status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"station_id" uuid,
	"account_type" varchar(20) NOT NULL,
	"name" varchar(150) NOT NULL,
	"opening_balance" numeric(14, 2) DEFAULT '0' NOT NULL,
	"opening_date" varchar(10),
	"metadata" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fuel_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"station_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"effective_from" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "handover_terminal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"station_id" uuid NOT NULL,
	"handover_id" uuid NOT NULL,
	"shift_id" uuid NOT NULL,
	"terminal_id" uuid NOT NULL,
	"du_id" uuid,
	"card_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"upi_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"batch_ref" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"idempotency_key" varchar(255) NOT NULL,
	"request_path" varchar(255),
	"response_status" integer,
	"response_body" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_keys_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"station_id" uuid,
	"sale_id" uuid,
	"invoice_number" varchar(50) NOT NULL,
	"financial_year" varchar(9) NOT NULL,
	"issued_date" varchar(10) NOT NULL,
	"buyer_customer_id" uuid,
	"buyer_name" varchar(255),
	"buyer_gstin" varchar(20),
	"buyer_state_code" varchar(2),
	"inter_state" boolean DEFAULT false NOT NULL,
	"taxable_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"cgst_total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"sgst_total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"igst_total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"vat_total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"cess_total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"round_off" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"snapshot_data" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"station_id" uuid,
	"account_id" uuid NOT NULL,
	"direction" varchar(3) NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"entry_date" varchar(10) NOT NULL,
	"source_type" varchar(30) NOT NULL,
	"source_id" uuid,
	"transfer_id" uuid,
	"business_day_id" uuid,
	"shift_id" uuid,
	"reconciled" boolean DEFAULT false NOT NULL,
	"notes" varchar(500),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nozzle_readings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shift_id" uuid NOT NULL,
	"nozzle_id" uuid NOT NULL,
	"opening_reading" numeric(15, 3) NOT NULL,
	"closing_reading" numeric(15, 3) NOT NULL,
	"volume_sold" numeric(12, 3) NOT NULL,
	"testing_volume" numeric(12, 3) DEFAULT '0' NOT NULL,
	"unit_price" numeric(10, 2),
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
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_terminals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"station_id" uuid NOT NULL,
	"label" varchar(100) NOT NULL,
	"provider" varchar(100),
	"terminal_code" varchar(100),
	"supports_card" boolean DEFAULT true NOT NULL,
	"supports_upi" boolean DEFAULT true NOT NULL,
	"clearing_account_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
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
	"inventory_type" varchar(20) DEFAULT 'ITEM' NOT NULL,
	"stock_tracked" boolean DEFAULT true NOT NULL,
	"is_taxable" boolean DEFAULT true NOT NULL,
	"tax_category" varchar(20) DEFAULT 'GST' NOT NULL,
	"unit" varchar(50) NOT NULL,
	"brand" varchar(150),
	"category" varchar(100),
	"selling_price" numeric(12, 2),
	"cost_basis" numeric(14, 4) DEFAULT '0',
	"tax_config" jsonb DEFAULT '{"gst_rate":18,"hsn_code":""}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"unit_price" numeric(12, 4) NOT NULL,
	"tax_category" varchar(20) DEFAULT 'GST' NOT NULL,
	"gst_rate" numeric(5, 2),
	"vat_rate" numeric(5, 2),
	"cess_rate" numeric(5, 2),
	"hsn_code" varchar(50),
	"taxable_amount" numeric(12, 2) NOT NULL,
	"cgst" numeric(12, 2) DEFAULT '0' NOT NULL,
	"sgst" numeric(12, 2) DEFAULT '0' NOT NULL,
	"igst" numeric(12, 2) DEFAULT '0' NOT NULL,
	"vat" numeric(12, 2) DEFAULT '0' NOT NULL,
	"cess" numeric(12, 2) DEFAULT '0' NOT NULL,
	"line_total" numeric(12, 2) NOT NULL,
	"tank_allocations" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_number" varchar(100) NOT NULL,
	"shift_id" uuid,
	"business_day_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"invoice_number" varchar(100),
	"amount" numeric(12, 2) NOT NULL,
	"taxable_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"cgst_total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"sgst_total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"igst_total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"vat_total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"cess_total" numeric(12, 2) DEFAULT '0' NOT NULL,
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
	"discount_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"tax_amount" numeric(12, 2) NOT NULL,
	"line_total" numeric(12, 2) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_number" varchar(100) NOT NULL,
	"shift_id" uuid NOT NULL,
	"business_day_id" uuid NOT NULL,
	"sale_type" varchar(50) NOT NULL,
	"capture_mechanism" varchar(20) DEFAULT 'POS' NOT NULL,
	"payment_method" varchar(20) DEFAULT 'Cash' NOT NULL,
	"customer_id" uuid,
	"vehicle_id" uuid,
	"attendant_id" uuid,
	"subtotal_amount" numeric(12, 2) NOT NULL,
	"tax_amount" numeric(12, 2) NOT NULL,
	"total_amount" numeric(12, 2) NOT NULL,
	"non_cash_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"buyer_details" jsonb,
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
CREATE TABLE "shift_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shift_id" uuid NOT NULL,
	"snapshot_data" jsonb NOT NULL,
	"generated_at" timestamp DEFAULT now() NOT NULL
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
CREATE TABLE "shift_terminal_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shift_id" uuid NOT NULL,
	"terminal_id" uuid NOT NULL,
	"du_id" uuid,
	"assigned_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"station_id" uuid NOT NULL,
	"business_day_id" uuid NOT NULL,
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
	"shift_id" uuid,
	"business_day_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"tank_id" uuid,
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
	"shift_id" uuid,
	"business_day_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"tank_id" uuid,
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
	"shift_id" uuid,
	"business_day_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"transaction_type" varchar(50) NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"paid_from" varchar(20) DEFAULT 'BANK' NOT NULL,
	"affects_drawer" boolean DEFAULT false NOT NULL,
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
	"role" varchar(50) DEFAULT 'Staff' NOT NULL,
	"status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "income_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"tax_config" jsonb,
	"is_system" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "other_income" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shift_id" uuid,
	"business_day_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"received_into" varchar(20) DEFAULT 'SHIFT_CASH' NOT NULL,
	"affects_drawer" boolean DEFAULT true NOT NULL,
	"payer" varchar(255),
	"reference_type" varchar(50),
	"reference_id" uuid,
	"description" varchar(500),
	"status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attendant_handovers" ADD CONSTRAINT "attendant_handovers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendant_handovers" ADD CONSTRAINT "attendant_handovers_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendant_handovers" ADD CONSTRAINT "attendant_handovers_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendant_handovers" ADD CONSTRAINT "attendant_handovers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendant_handovers" ADD CONSTRAINT "attendant_handovers_du_id_dispenser_units_id_fk" FOREIGN KEY ("du_id") REFERENCES "public"."dispenser_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_days" ADD CONSTRAINT "business_days_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_days" ADD CONSTRAINT "business_days_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_days" ADD CONSTRAINT "business_days_opened_by_users_id_fk" FOREIGN KEY ("opened_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_days" ADD CONSTRAINT "business_days_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_business_day_id_business_days_id_fk" FOREIGN KEY ("business_day_id") REFERENCES "public"."business_days"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_vehicle_id_customer_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."customer_vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_discount_rules" ADD CONSTRAINT "customer_discount_rules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_discount_rules" ADD CONSTRAINT "customer_discount_rules_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_discount_rules" ADD CONSTRAINT "customer_discount_rules_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_transactions" ADD CONSTRAINT "customer_transactions_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_transactions" ADD CONSTRAINT "customer_transactions_business_day_id_business_days_id_fk" FOREIGN KEY ("business_day_id") REFERENCES "public"."business_days"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_transactions" ADD CONSTRAINT "customer_transactions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_transactions" ADD CONSTRAINT "customer_transactions_vehicle_id_customer_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."customer_vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_transactions" ADD CONSTRAINT "customer_transactions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_transactions" ADD CONSTRAINT "customer_transactions_attendant_id_users_id_fk" FOREIGN KEY ("attendant_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_transactions" ADD CONSTRAINT "customer_transactions_du_id_dispenser_units_id_fk" FOREIGN KEY ("du_id") REFERENCES "public"."dispenser_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_vehicles" ADD CONSTRAINT "customer_vehicles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_vehicles" ADD CONSTRAINT "customer_vehicles_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_vehicles" ADD CONSTRAINT "customer_vehicles_default_product_id_products_id_fk" FOREIGN KEY ("default_product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispenser_units" ADD CONSTRAINT "dispenser_units_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispenser_units" ADD CONSTRAINT "dispenser_units_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_sequences" ADD CONSTRAINT "document_sequences_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dssr_snapshots" ADD CONSTRAINT "dssr_snapshots_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dssr_snapshots" ADD CONSTRAINT "dssr_snapshots_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_business_day_id_business_days_id_fk" FOREIGN KEY ("business_day_id") REFERENCES "public"."business_days"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_business_day_id_business_days_id_fk" FOREIGN KEY ("business_day_id") REFERENCES "public"."business_days"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_expense_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."expense_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fuel_prices" ADD CONSTRAINT "fuel_prices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fuel_prices" ADD CONSTRAINT "fuel_prices_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fuel_prices" ADD CONSTRAINT "fuel_prices_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handover_terminal_entries" ADD CONSTRAINT "handover_terminal_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handover_terminal_entries" ADD CONSTRAINT "handover_terminal_entries_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handover_terminal_entries" ADD CONSTRAINT "handover_terminal_entries_handover_id_attendant_handovers_id_fk" FOREIGN KEY ("handover_id") REFERENCES "public"."attendant_handovers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handover_terminal_entries" ADD CONSTRAINT "handover_terminal_entries_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handover_terminal_entries" ADD CONSTRAINT "handover_terminal_entries_terminal_id_payment_terminals_id_fk" FOREIGN KEY ("terminal_id") REFERENCES "public"."payment_terminals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handover_terminal_entries" ADD CONSTRAINT "handover_terminal_entries_du_id_dispenser_units_id_fk" FOREIGN KEY ("du_id") REFERENCES "public"."dispenser_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_buyer_customer_id_customers_id_fk" FOREIGN KEY ("buyer_customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_account_id_financial_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_business_day_id_business_days_id_fk" FOREIGN KEY ("business_day_id") REFERENCES "public"."business_days"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nozzle_readings" ADD CONSTRAINT "nozzle_readings_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nozzle_readings" ADD CONSTRAINT "nozzle_readings_nozzle_id_nozzles_id_fk" FOREIGN KEY ("nozzle_id") REFERENCES "public"."nozzles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nozzles" ADD CONSTRAINT "nozzles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nozzles" ADD CONSTRAINT "nozzles_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nozzles" ADD CONSTRAINT "nozzles_du_id_dispenser_units_id_fk" FOREIGN KEY ("du_id") REFERENCES "public"."dispenser_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nozzles" ADD CONSTRAINT "nozzles_tank_id_tanks_id_fk" FOREIGN KEY ("tank_id") REFERENCES "public"."tanks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_terminals" ADD CONSTRAINT "payment_terminals_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_terminals" ADD CONSTRAINT "payment_terminals_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_business_day_id_business_days_id_fk" FOREIGN KEY ("business_day_id") REFERENCES "public"."business_days"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_business_day_id_business_days_id_fk" FOREIGN KEY ("business_day_id") REFERENCES "public"."business_days"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_vehicle_id_customer_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."customer_vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_attendant_id_users_id_fk" FOREIGN KEY ("attendant_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_staff_assignments" ADD CONSTRAINT "shift_staff_assignments_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_staff_assignments" ADD CONSTRAINT "shift_staff_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_staff_assignments" ADD CONSTRAINT "shift_staff_assignments_du_id_dispenser_units_id_fk" FOREIGN KEY ("du_id") REFERENCES "public"."dispenser_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_summaries" ADD CONSTRAINT "shift_summaries_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_templates" ADD CONSTRAINT "shift_templates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_terminal_links" ADD CONSTRAINT "shift_terminal_links_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_terminal_links" ADD CONSTRAINT "shift_terminal_links_terminal_id_payment_terminals_id_fk" FOREIGN KEY ("terminal_id") REFERENCES "public"."payment_terminals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_terminal_links" ADD CONSTRAINT "shift_terminal_links_du_id_dispenser_units_id_fk" FOREIGN KEY ("du_id") REFERENCES "public"."dispenser_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_business_day_id_business_days_id_fk" FOREIGN KEY ("business_day_id") REFERENCES "public"."business_days"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_shift_template_id_shift_templates_id_fk" FOREIGN KEY ("shift_template_id") REFERENCES "public"."shift_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_opened_by_users_id_fk" FOREIGN KEY ("opened_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stations" ADD CONSTRAINT "stations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_business_day_id_business_days_id_fk" FOREIGN KEY ("business_day_id") REFERENCES "public"."business_days"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_tank_id_tanks_id_fk" FOREIGN KEY ("tank_id") REFERENCES "public"."tanks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_variances" ADD CONSTRAINT "stock_variances_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_variances" ADD CONSTRAINT "stock_variances_business_day_id_business_days_id_fk" FOREIGN KEY ("business_day_id") REFERENCES "public"."business_days"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_variances" ADD CONSTRAINT "stock_variances_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_variances" ADD CONSTRAINT "stock_variances_tank_id_tanks_id_fk" FOREIGN KEY ("tank_id") REFERENCES "public"."tanks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_variances" ADD CONSTRAINT "stock_variances_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_transactions" ADD CONSTRAINT "supplier_transactions_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_transactions" ADD CONSTRAINT "supplier_transactions_business_day_id_business_days_id_fk" FOREIGN KEY ("business_day_id") REFERENCES "public"."business_days"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_transactions" ADD CONSTRAINT "supplier_transactions_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tanks" ADD CONSTRAINT "tanks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tanks" ADD CONSTRAINT "tanks_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_station_assignments" ADD CONSTRAINT "user_station_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_station_assignments" ADD CONSTRAINT "user_station_assignments_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "income_categories" ADD CONSTRAINT "income_categories_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "other_income" ADD CONSTRAINT "other_income_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "other_income" ADD CONSTRAINT "other_income_business_day_id_business_days_id_fk" FOREIGN KEY ("business_day_id") REFERENCES "public"."business_days"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "other_income" ADD CONSTRAINT "other_income_category_id_income_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."income_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "business_days_org_station_date_uniq" ON "business_days" USING btree ("organization_id","station_id","business_date");--> statement-breakpoint
CREATE INDEX "customer_txn_shift_attendant_idx" ON "customer_transactions" USING btree ("shift_id","attendant_id");--> statement-breakpoint
CREATE INDEX "customer_txn_shift_du_idx" ON "customer_transactions" USING btree ("shift_id","du_id");--> statement-breakpoint
CREATE UNIQUE INDEX "expense_categories_org_name_idx" ON "expense_categories" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "financial_accounts_org_station_idx" ON "financial_accounts" USING btree ("organization_id","station_id");--> statement-breakpoint
CREATE INDEX "handover_terminal_entries_handover_idx" ON "handover_terminal_entries" USING btree ("handover_id");--> statement-breakpoint
CREATE INDEX "handover_terminal_entries_shift_idx" ON "handover_terminal_entries" USING btree ("shift_id");--> statement-breakpoint
CREATE INDEX "idempotency_keys_org_idx" ON "idempotency_keys" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_org_number_uniq" ON "invoices" USING btree ("organization_id","invoice_number");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_sale_uniq" ON "invoices" USING btree ("sale_id") WHERE "sale_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "invoices_org_fy_idx" ON "invoices" USING btree ("organization_id","financial_year");--> statement-breakpoint
CREATE INDEX "invoices_station_idx" ON "invoices" USING btree ("station_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_account_date_idx" ON "ledger_entries" USING btree ("account_id","entry_date");--> statement-breakpoint
CREATE INDEX "ledger_entries_org_station_idx" ON "ledger_entries" USING btree ("organization_id","station_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_org_station_date_idx" ON "ledger_entries" USING btree ("organization_id","station_id","entry_date");--> statement-breakpoint
CREATE INDEX "ledger_entries_source_idx" ON "ledger_entries" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_transfer_idx" ON "ledger_entries" USING btree ("transfer_id");--> statement-breakpoint
CREATE INDEX "purchase_items_purchase_id_idx" ON "purchase_items" USING btree ("purchase_id");--> statement-breakpoint
CREATE INDEX "purchase_items_product_id_idx" ON "purchase_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "sales_shift_attendant_idx" ON "sales" USING btree ("shift_id","attendant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "income_categories_org_name_idx" ON "income_categories" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "other_income_business_day_idx" ON "other_income" USING btree ("business_day_id");--> statement-breakpoint
CREATE INDEX "other_income_shift_idx" ON "other_income" USING btree ("shift_id");--> statement-breakpoint
CREATE INDEX "other_income_category_idx" ON "other_income" USING btree ("category_id");--> statement-breakpoint