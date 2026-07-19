-- Merchandise product refinements: manufacturer/brand (same kind across companies),
-- an optional finer category label, and an optional selling price (MRP) used to
-- prefill merchandise sales. All nullable / additive.
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "brand" varchar(150);
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "category" varchar(100);
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "selling_price" numeric(12, 2);
