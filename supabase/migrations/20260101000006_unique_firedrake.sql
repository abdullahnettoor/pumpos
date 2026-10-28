-- DERIVED from packages/db/migrations/0006_unique_firedrake.sql by
-- `npm run db:sync-supabase -w @pump/db`. Edit the source, never this copy.

CREATE INDEX "collections_org_customer_entry_date_idx" ON "collections" USING btree ("organization_id","customer_id","entry_date");--> statement-breakpoint
CREATE INDEX "customer_txn_customer_business_day_created_idx" ON "customer_transactions" USING btree ("customer_id","business_day_id","created_at");--> statement-breakpoint
CREATE INDEX "supplier_transactions_org_supplier_entry_date_idx" ON "supplier_transactions" USING btree ("organization_id","supplier_id","entry_date");