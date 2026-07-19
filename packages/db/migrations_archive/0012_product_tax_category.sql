-- Product tax category: 'FUEL_VAT' | 'GST' | 'EXEMPT' | 'NON_TAXABLE'.
-- Fuel is VAT (outside GST); lubricants/merchandise are GST. is_taxable is kept
-- as a derived legacy flag. tax_config JSONB gains optional vat_rate / cess.
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "tax_category" varchar(20) DEFAULT 'GST' NOT NULL;
UPDATE "products" SET "tax_category" = 'FUEL_VAT' WHERE "product_type" = 'FUEL';
