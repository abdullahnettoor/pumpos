-- Phase F consolidation: link payment terminals to their MERCHANT_CLEARING
-- account (the acquirer/settlement bucket). Many terminals of the same acquirer
-- (e.g. 4 Paytm machines) settle into one clearing account.

ALTER TABLE "payment_terminals" ADD COLUMN IF NOT EXISTS "clearing_account_id" uuid REFERENCES "financial_accounts"("id");
