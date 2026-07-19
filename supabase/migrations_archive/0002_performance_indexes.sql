-- 0003: Performance indexes on hot lookup columns
-- Idempotent: uses IF NOT EXISTS. Not CONCURRENTLY because drizzle wraps in tx.
-- Tables are small at MVP; switch to CONCURRENTLY before prod backfill on large data.

-- Stations / org scoping
CREATE INDEX IF NOT EXISTS stations_org_idx ON stations(organization_id);
CREATE INDEX IF NOT EXISTS document_sequences_org_type_idx ON document_sequences(organization_id, document_type);

-- Users + assignments
CREATE INDEX IF NOT EXISTS users_org_status_idx ON users(organization_id, status);
CREATE INDEX IF NOT EXISTS users_auth_user_id_idx ON users(auth_user_id);
CREATE INDEX IF NOT EXISTS user_station_assignments_user_idx ON user_station_assignments(user_id);
CREATE INDEX IF NOT EXISTS user_station_assignments_station_idx ON user_station_assignments(station_id);

-- Infrastructure
CREATE INDEX IF NOT EXISTS tanks_station_idx ON tanks(station_id);
CREATE INDEX IF NOT EXISTS tanks_product_idx ON tanks(product_id);
CREATE INDEX IF NOT EXISTS dispenser_units_station_status_idx ON dispenser_units(station_id, status);
CREATE INDEX IF NOT EXISTS nozzles_station_idx ON nozzles(station_id);
CREATE INDEX IF NOT EXISTS nozzles_du_idx ON nozzles(du_id);
CREATE INDEX IF NOT EXISTS nozzles_tank_idx ON nozzles(tank_id);
CREATE INDEX IF NOT EXISTS nozzles_product_idx ON nozzles(product_id);

-- Products
CREATE INDEX IF NOT EXISTS products_org_type_idx ON products(organization_id, product_type);

-- Shifts
CREATE INDEX IF NOT EXISTS shifts_station_status_idx ON shifts(station_id, status);
CREATE INDEX IF NOT EXISTS shifts_station_status_closed_idx ON shifts(station_id, status, closed_at DESC);
CREATE INDEX IF NOT EXISTS shifts_org_idx ON shifts(organization_id);
CREATE INDEX IF NOT EXISTS shifts_template_idx ON shifts(shift_template_id);
CREATE INDEX IF NOT EXISTS shift_templates_org_active_idx ON shift_templates(organization_id, is_active);
CREATE INDEX IF NOT EXISTS shift_staff_assignments_shift_idx ON shift_staff_assignments(shift_id);
CREATE INDEX IF NOT EXISTS shift_staff_assignments_user_idx ON shift_staff_assignments(user_id);
CREATE INDEX IF NOT EXISTS nozzle_readings_shift_idx ON nozzle_readings(shift_id);
CREATE INDEX IF NOT EXISTS nozzle_readings_nozzle_idx ON nozzle_readings(nozzle_id);
CREATE INDEX IF NOT EXISTS attendant_handovers_shift_idx ON attendant_handovers(shift_id);

-- CRM / suppliers
CREATE INDEX IF NOT EXISTS customers_org_active_idx ON customers(organization_id, is_active);
CREATE INDEX IF NOT EXISTS customers_station_idx ON customers(station_id);
CREATE INDEX IF NOT EXISTS customer_transactions_shift_idx ON customer_transactions(shift_id);
CREATE INDEX IF NOT EXISTS customer_transactions_customer_idx ON customer_transactions(customer_id);
CREATE INDEX IF NOT EXISTS suppliers_org_active_idx ON suppliers(organization_id, is_active);
CREATE INDEX IF NOT EXISTS suppliers_station_idx ON suppliers(station_id);
CREATE INDEX IF NOT EXISTS supplier_transactions_shift_idx ON supplier_transactions(shift_id);
CREATE INDEX IF NOT EXISTS supplier_transactions_supplier_idx ON supplier_transactions(supplier_id);

-- Transactions / inventory
CREATE INDEX IF NOT EXISTS sales_shift_idx ON sales(shift_id);
CREATE INDEX IF NOT EXISTS sales_customer_idx ON sales(customer_id);
CREATE INDEX IF NOT EXISTS sale_items_sale_idx ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS sale_items_product_idx ON sale_items(product_id);
CREATE INDEX IF NOT EXISTS stock_movements_shift_idx ON stock_movements(shift_id);
CREATE INDEX IF NOT EXISTS stock_movements_product_created_idx ON stock_movements(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS stock_movements_tank_idx ON stock_movements(tank_id);
CREATE INDEX IF NOT EXISTS stock_variances_shift_idx ON stock_variances(shift_id);
CREATE INDEX IF NOT EXISTS stock_variances_product_idx ON stock_variances(product_id);

-- Finance
CREATE INDEX IF NOT EXISTS expenses_shift_idx ON expenses(shift_id);
CREATE INDEX IF NOT EXISTS expenses_category_idx ON expenses(category_id);
CREATE INDEX IF NOT EXISTS collections_shift_idx ON collections(shift_id);
CREATE INDEX IF NOT EXISTS collections_customer_idx ON collections(customer_id);
CREATE INDEX IF NOT EXISTS purchases_shift_idx ON purchases(shift_id);
CREATE INDEX IF NOT EXISTS purchases_supplier_idx ON purchases(supplier_id);

-- Reporting / audit / events
CREATE INDEX IF NOT EXISTS dssr_snapshots_shift_idx ON dssr_snapshots(shift_id);
CREATE INDEX IF NOT EXISTS audit_logs_org_performed_idx ON audit_logs(organization_id, performed_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS business_events_org_occurred_idx ON business_events(organization_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS business_events_entity_idx ON business_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS sync_events_status_idx ON sync_events(status);

-- Pricing (latest-per-product lookups)
CREATE INDEX IF NOT EXISTS fuel_prices_station_product_effective_idx
  ON fuel_prices(station_id, product_id, effective_from DESC);
