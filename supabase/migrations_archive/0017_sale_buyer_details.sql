-- Ad-hoc buyer details for walk-in bills (Phase T4c).
--
-- When a merchandise sale is billed to a customer who is NOT saved in the
-- customer registry, and the operator does not choose to save them as a
-- returning customer, their bill-to details are stored here as JSON:
--   { "name": string, "phone": string|null, "gstin": string|null, "stateCode": string|null }
-- Invoices read the bill-to from this column when customer_id is null.
-- When the operator opts to save the buyer, a customers row is created/deduped
-- instead and customer_id is set (this column stays null).

ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "buyer_details" jsonb;
