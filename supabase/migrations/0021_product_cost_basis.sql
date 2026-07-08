-- 0021: Product cost basis (FB1) — rolling weighted-average landed cost per
-- unit, used to compute COGS and margin. Pre-tax for GST items (input tax is
-- creditable), tax-inclusive for fuel/VAT (VAT is baked into the landed price).
-- Recomputed on each purchase; seeded from opening cost at onboarding.
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "cost_basis" numeric(14, 4) DEFAULT '0';
