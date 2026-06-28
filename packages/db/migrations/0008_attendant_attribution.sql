-- Attendant attribution: tie merchandise sales and fuel-on-credit sales to the
-- operator (attendant) who made them, so each attendant's handover reconciliation
-- can account for non-fuel cash/card/UPI and credit chits, not just fuel readings.
-- Nullable / additive: existing rows and back-office (non-shift) entries stay null.
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "attendant_id" uuid REFERENCES "users"("id");
ALTER TABLE "customer_transactions" ADD COLUMN IF NOT EXISTS "attendant_id" uuid REFERENCES "users"("id");

-- Attribution lookups are per-shift, filtered by attendant.
CREATE INDEX IF NOT EXISTS "sales_shift_attendant_idx" ON "sales" ("shift_id", "attendant_id");
CREATE INDEX IF NOT EXISTS "customer_txn_shift_attendant_idx" ON "customer_transactions" ("shift_id", "attendant_id");
