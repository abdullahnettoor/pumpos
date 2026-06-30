-- Multi-line purchases with per-line GST/VAT.
--
-- A purchase becomes a supplier tax invoice with N line items. Each line carries
-- its own product, pre-tax rate, and computed tax breakup (CGST/SGST intra-state,
-- IGST inter-state, VAT for fuel, cess). Header tax totals are denormalised onto
-- `purchases` for fast invoice/ITC reporting; `amount` remains the grand total
-- (the supplier payable, tax inclusive). Inventory is updated per line via
-- stock_movements (fuel lines may still split across tanks).

ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "taxable_amount" numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "cgst_total" numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "sgst_total" numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "igst_total" numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "vat_total" numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "cess_total" numeric(12,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "purchase_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "purchase_id" uuid NOT NULL REFERENCES "purchases"("id"),
  "product_id" uuid NOT NULL REFERENCES "products"("id"),
  "quantity" numeric(12,3) NOT NULL,
  "unit_price" numeric(12,4) NOT NULL,
  "tax_category" varchar(20) NOT NULL DEFAULT 'GST',
  "gst_rate" numeric(5,2),
  "vat_rate" numeric(5,2),
  "cess_rate" numeric(5,2),
  "hsn_code" varchar(50),
  "taxable_amount" numeric(12,2) NOT NULL,
  "cgst" numeric(12,2) NOT NULL DEFAULT 0,
  "sgst" numeric(12,2) NOT NULL DEFAULT 0,
  "igst" numeric(12,2) NOT NULL DEFAULT 0,
  "vat" numeric(12,2) NOT NULL DEFAULT 0,
  "cess" numeric(12,2) NOT NULL DEFAULT 0,
  "line_total" numeric(12,2) NOT NULL,
  "tank_allocations" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "purchase_items_purchase_id_idx" ON "purchase_items" ("purchase_id");
CREATE INDEX IF NOT EXISTS "purchase_items_product_id_idx" ON "purchase_items" ("product_id");
