-- Merchandise sale: non-cash (card/UPI) portion (Phase T4b, Option B).
--
-- Walk-in merchandise is recorded as a single cash sale (complete stock + GST),
-- but part of it may have been paid by card/UPI on a terminal. This column holds
-- that non-cash portion of a cash-recorded sale so reconciliation can subtract it
-- from the attendant's expected drawer cash (the card/UPI money is on the terminal
-- rail). The sale's paymentMethod stays 'Cash'; this is the cash-vs-non-cash split.

ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "non_cash_amount" numeric(12,2) NOT NULL DEFAULT 0;
