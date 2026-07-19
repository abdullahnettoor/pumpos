-- Per-terminal card/UPI breakdown captured within an attendant handover.
-- The parent handover's card/upi aggregates are the sum of these rows when present.
CREATE TABLE IF NOT EXISTS "handover_terminal_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "station_id" uuid NOT NULL REFERENCES "stations"("id"),
  "handover_id" uuid NOT NULL REFERENCES "attendant_handovers"("id") ON DELETE CASCADE,
  "shift_id" uuid NOT NULL REFERENCES "shifts"("id"),
  "terminal_id" uuid NOT NULL REFERENCES "payment_terminals"("id"),
  "du_id" uuid REFERENCES "dispenser_units"("id"),
  "card_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
  "upi_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
  "batch_ref" varchar(100),
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "handover_terminal_entries_handover_idx" ON "handover_terminal_entries" ("handover_id");
CREATE INDEX IF NOT EXISTS "handover_terminal_entries_shift_idx" ON "handover_terminal_entries" ("shift_id");
