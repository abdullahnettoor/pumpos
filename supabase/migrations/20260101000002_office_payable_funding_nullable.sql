-- DERIVED from packages/db/migrations/0002_office_payable_funding_nullable.sql by
-- `npm run db:sync-supabase -w @pump/db`. Edit the source, never this copy.

ALTER TABLE "supplier_transactions" ALTER COLUMN "funding_account_id" DROP NOT NULL;