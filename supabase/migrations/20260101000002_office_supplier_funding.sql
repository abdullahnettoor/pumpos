-- DERIVED from packages/db/migrations/0002_office_supplier_funding.sql by
-- `npm run db:sync-supabase -w @pump/db`. Edit the source, never this copy.

ALTER TABLE "supplier_transactions" ALTER COLUMN "funding_account_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_transactions" ADD CONSTRAINT "supplier_transactions_payment_has_funding" CHECK ("supplier_transactions"."transaction_type" <> 'Payment' OR "supplier_transactions"."funding_account_id" IS NOT NULL);