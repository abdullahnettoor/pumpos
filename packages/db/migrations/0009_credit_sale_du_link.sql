-- Fuel-on-credit moves into the DU handover: each credit fuel sale is dispensed
-- from a specific dispensing unit, so the handover for that (attendant, DU) can
-- derive its own credit-chit total. Nullable / additive: merchandise credit and
-- back-office credit entries keep du_id null.
ALTER TABLE "customer_transactions" ADD COLUMN IF NOT EXISTS "du_id" uuid REFERENCES "dispenser_units"("id");

CREATE INDEX IF NOT EXISTS "customer_txn_shift_du_idx" ON "customer_transactions" ("shift_id", "du_id");
