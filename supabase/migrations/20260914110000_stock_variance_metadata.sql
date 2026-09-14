-- Mid-shift Tank Dips record measurement + variance but skip book-stock
-- reconciliation (in-flight fuel sales are not yet booked). Flag such
-- variances so reports can interpret them correctly.
ALTER TABLE stock_variances ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb NOT NULL;
