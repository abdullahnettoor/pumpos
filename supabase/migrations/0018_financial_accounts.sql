-- Phase F, Layer A (FA1): financial accounts + money ledger.
--
-- financial_accounts: a money store (drawer / petty cash / bank / card-UPI
-- clearing / owner). station_id NULL = organization-shared (future).
-- ledger_entries: single-entry signed money ledger. Balance = opening + Σin − Σout.
-- A transfer is two linked rows sharing transfer_id (out of A, in to B).

CREATE TABLE IF NOT EXISTS "financial_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "station_id" uuid REFERENCES "stations"("id"),
  "account_type" varchar(20) NOT NULL,
  "name" varchar(150) NOT NULL,
  "opening_balance" numeric(14,2) DEFAULT '0' NOT NULL,
  "opening_date" varchar(10),
  "metadata" jsonb,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "ledger_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "station_id" uuid REFERENCES "stations"("id"),
  "account_id" uuid NOT NULL REFERENCES "financial_accounts"("id"),
  "direction" varchar(3) NOT NULL,
  "amount" numeric(14,2) NOT NULL,
  "entry_date" varchar(10) NOT NULL,
  "source_type" varchar(30) NOT NULL,
  "source_id" uuid,
  "transfer_id" uuid,
  "business_day_id" uuid REFERENCES "business_days"("id"),
  "shift_id" uuid REFERENCES "shifts"("id"),
  "reconciled" boolean DEFAULT false NOT NULL,
  "notes" varchar(500),
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "financial_accounts_org_station_idx" ON "financial_accounts" ("organization_id", "station_id");
CREATE INDEX IF NOT EXISTS "ledger_entries_account_date_idx" ON "ledger_entries" ("account_id", "entry_date");
CREATE INDEX IF NOT EXISTS "ledger_entries_org_station_idx" ON "ledger_entries" ("organization_id", "station_id");
CREATE INDEX IF NOT EXISTS "ledger_entries_transfer_idx" ON "ledger_entries" ("transfer_id");
CREATE INDEX IF NOT EXISTS "ledger_entries_source_idx" ON "ledger_entries" ("source_type", "source_id");
