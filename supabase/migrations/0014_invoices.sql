-- GST tax invoices (Phase T4).
--
-- A B2B sale (merchandise/lubes → GST) can be issued as a formal tax invoice
-- with a gapless, per-financial-year, per-supplier-GSTIN numbering series
-- (legal requirement). The invoice snapshots the buyer/supplier identity + the
-- CGST/SGST (intra-state) or IGST (inter-state) split + priced line items at
-- issue time so a reprint is always byte-identical (immutable).
--
-- Columns hold only what GST reporting queries/aggregates (tax totals, buyer
-- GSTIN, FY, issued date, inter-state). Supplier identity, place of supply and
-- the priced lines live in `snapshot_data` (rarely queried → JSONB).
--
-- `document_sequences` is a small, GENERIC gapless numbering store (keyed by
-- doc_type + scope) — the focused replacement for the dropped table. It stores
-- only the LAST number per counter, not every issued number.

DROP TABLE IF EXISTS "invoice_sequences";
DROP TABLE IF EXISTS "invoices";

CREATE TABLE IF NOT EXISTS "invoices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "station_id" uuid REFERENCES "stations"("id"),
  "sale_id" uuid REFERENCES "sales"("id"),
  "invoice_number" varchar(50) NOT NULL,
  "financial_year" varchar(9) NOT NULL,
  "issued_date" varchar(10) NOT NULL,
  "buyer_customer_id" uuid REFERENCES "customers"("id"),
  "buyer_name" varchar(255),
  "buyer_gstin" varchar(20),
  "buyer_state_code" varchar(2),
  "inter_state" boolean NOT NULL DEFAULT false,
  "taxable_amount" numeric(12,2) NOT NULL DEFAULT 0,
  "cgst_total" numeric(12,2) NOT NULL DEFAULT 0,
  "sgst_total" numeric(12,2) NOT NULL DEFAULT 0,
  "igst_total" numeric(12,2) NOT NULL DEFAULT 0,
  "vat_total" numeric(12,2) NOT NULL DEFAULT 0,
  "cess_total" numeric(12,2) NOT NULL DEFAULT 0,
  "round_off" numeric(12,2) NOT NULL DEFAULT 0,
  "total_amount" numeric(12,2) NOT NULL DEFAULT 0,
  "snapshot_data" jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "invoices_org_number_uniq" UNIQUE ("organization_id", "invoice_number")
);

-- One invoice per sale (idempotent issue).
CREATE UNIQUE INDEX IF NOT EXISTS "invoices_sale_uniq" ON "invoices" ("sale_id") WHERE "sale_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "invoices_org_fy_idx" ON "invoices" ("organization_id", "financial_year");
CREATE INDEX IF NOT EXISTS "invoices_station_idx" ON "invoices" ("station_id");

-- Generic gapless numbering store: (org, doc_type, scope, FY) → last_number.
-- scope is the sub-series key (e.g. supplier GSTIN for invoices); '' when N/A.
CREATE TABLE IF NOT EXISTS "document_sequences" (
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "doc_type" varchar(30) NOT NULL DEFAULT 'INVOICE',
  "scope" varchar(40) NOT NULL DEFAULT '',
  "financial_year" varchar(9) NOT NULL DEFAULT '',
  "last_number" integer NOT NULL DEFAULT 0,
  PRIMARY KEY ("organization_id", "doc_type", "scope", "financial_year")
);
