import { pgTable, uuid, varchar, timestamp, boolean, integer, numeric, jsonb, primaryKey } from 'drizzle-orm/pg-core';

// ----------------------------------------------------
// CORE DOMAIN
// ----------------------------------------------------

export const organizations = pgTable('organizations', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  subscriptionPlan: varchar('subscription_plan', { length: 50 }).default('Core').notNull(),
  subscriptionStatus: varchar('subscription_status', { length: 50 }).default('Active').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const stations = pgTable('stations', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  code: varchar('code', { length: 50 }).notNull(),
  address: varchar('address', { length: 500 }),
  phone: varchar('phone', { length: 50 }),
  settings: jsonb('settings').default({
    shift_grace_minutes: 15,
    shift_lock_grace_days: 3,
    offline_warning_days: 3,
    offline_critical_days: 7,
  }).notNull(),
  onboardingStatus: varchar('onboarding_status', { length: 50 }).default('NOT_STARTED').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const documentSequences = pgTable('document_sequences', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  documentType: varchar('document_type', { length: 50 }).notNull(), // 'SALE', 'PURCHASE', 'COLLECTION'
  currentNumber: integer('current_number').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  authUserId: uuid('auth_user_id'), // Supabase auth link
  fullName: varchar('full_name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }),
  phone: varchar('phone', { length: 50 }),
  role: varchar('role', { length: 50 }).default('Staff').notNull(), // 'Owner', 'Manager', 'Accountant', 'Staff'
  status: varchar('status', { length: 20 }).default('ACTIVE').notNull(), // 'ACTIVE', 'INACTIVE'
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const userStationAssignments = pgTable('user_station_assignments', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  stationId: uuid('station_id').references(() => stations.id).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ----------------------------------------------------
// INFRASTRUCTURE DOMAIN
// ----------------------------------------------------

export const tanks = pgTable('tanks', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  stationId: uuid('station_id').references(() => stations.id).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  productId: uuid('product_id').notNull(), // references products table defined below
  capacity: numeric('capacity', { precision: 12, scale: 2 }).notNull(), // Liters
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const dispenserUnits = pgTable('dispenser_units', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  stationId: uuid('station_id').references(() => stations.id).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  code: varchar('code', { length: 50 }).notNull(),
  status: varchar('status', { length: 50 }).default('ACTIVE').notNull(), // 'ACTIVE', 'MAINTENANCE', 'INACTIVE'
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const nozzles = pgTable('nozzles', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  stationId: uuid('station_id').references(() => stations.id).notNull(),
  duId: uuid('du_id').references(() => dispenserUnits.id).notNull(),
  tankId: uuid('tank_id').references(() => tanks.id).notNull(),
  productId: uuid('product_id').notNull(), // references products table defined below
  name: varchar('name', { length: 100 }).notNull(),
  currentReading: numeric('current_reading', { precision: 15, scale: 3 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ----------------------------------------------------
// PRODUCT DOMAIN
// ----------------------------------------------------

export const products = pgTable('products', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  code: varchar('code', { length: 100 }).notNull(),
  productType: varchar('product_type', { length: 50 }).notNull(), // 'FUEL', 'LUBRICANT', 'ACCESSORY', 'SERVICE'
  stockTracked: boolean('stock_tracked').default(true).notNull(),
  isTaxable: boolean('is_taxable').default(true).notNull(),
  unit: varchar('unit', { length: 50 }).notNull(),
  taxConfig: jsonb('tax_config').default({ gst_rate: 18, hsn_code: '' }).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ----------------------------------------------------
// SHIFT DOMAIN
// ----------------------------------------------------

export const shiftTemplates = pgTable('shift_templates', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  startTime: varchar('start_time', { length: 10 }).notNull(), // HH:MM
  endTime: varchar('end_time', { length: 10 }).notNull(), // HH:MM
  isActive: boolean('is_active').default(true).notNull(),
});

export const shifts = pgTable('shifts', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  stationId: uuid('station_id').references(() => stations.id).notNull(),
  shiftTemplateId: uuid('shift_template_id').references(() => shiftTemplates.id).notNull(),
  status: varchar('status', { length: 20 }).default('OPEN').notNull(), // 'OPEN', 'CLOSED', 'LOCKED'
  openedBy: uuid('opened_by').references(() => users.id).notNull(),
  openedAt: timestamp('opened_at').defaultNow().notNull(),
  closedBy: uuid('closed_by').references(() => users.id),
  closedAt: timestamp('closed_at'),
  lockedAt: timestamp('locked_at'),
  openingCash: numeric('opening_cash', { precision: 12, scale: 2 }).notNull(),
  closingCash: numeric('closing_cash', { precision: 12, scale: 2 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const shiftStaffAssignments = pgTable('shift_staff_assignments', {
  id: uuid('id').defaultRandom().primaryKey(),
  shiftId: uuid('shift_id').references(() => shifts.id).notNull(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  duId: uuid('du_id').references(() => dispenserUnits.id).notNull(),
  assignedAt: timestamp('assigned_at').defaultNow().notNull(),
});

export const nozzleReadings = pgTable('nozzle_readings', {
  id: uuid('id').defaultRandom().primaryKey(),
  shiftId: uuid('shift_id').references(() => shifts.id).notNull(),
  nozzleId: uuid('nozzle_id').references(() => nozzles.id).notNull(),
  openingReading: numeric('opening_reading', { precision: 15, scale: 3 }).notNull(),
  closingReading: numeric('closing_reading', { precision: 15, scale: 3 }).notNull(),
  volumeSold: numeric('volume_sold', { precision: 12, scale: 3 }).notNull(),
  unitPrice: numeric('unit_price', { precision: 10, scale: 2 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ----------------------------------------------------
// CRM & SUPPLIER DOMAINS
// ----------------------------------------------------

export const customers = pgTable('customers', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  stationId: uuid('station_id').references(() => stations.id),
  customerType: varchar('customer_type', { length: 50 }).notNull(), // 'Regular', 'Credit', 'Fleet'
  name: varchar('name', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 50 }),
  creditLimit: numeric('credit_limit', { precision: 12, scale: 2 }),
  fleetCode: varchar('fleet_code', { length: 100 }),
  isPrepaid: boolean('is_prepaid').default(false).notNull(),
  prepaidBalance: numeric('prepaid_balance', { precision: 14, scale: 2 }).default('0').notNull(),
  metadata: jsonb('metadata'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const customerVehicles = pgTable('customer_vehicles', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  customerId: uuid('customer_id').references(() => customers.id).notNull(),
  registrationNumber: varchar('registration_number', { length: 50 }).notNull(),
  vehicleType: varchar('vehicle_type', { length: 50 }).notNull(), // 'Car', 'Truck', 'Bus', 'Two-wheeler', etc.
  defaultProductId: uuid('default_product_id').references(() => products.id),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const customerDiscountRules = pgTable('customer_discount_rules', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  customerId: uuid('customer_id').references(() => customers.id).notNull(),
  productId: uuid('product_id').references(() => products.id),
  ruleType: varchar('rule_type', { length: 50 }).notNull(), // 'FLAT_PER_LITRE', 'PERCENT', 'TIERED_THRESHOLD'
  value: numeric('value', { precision: 10, scale: 4 }).notNull(),
  thresholdLitres: numeric('threshold_litres', { precision: 12, scale: 2 }),
  validFrom: timestamp('valid_from').notNull(),
  validUntil: timestamp('valid_until'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const customerTransactions = pgTable('customer_transactions', {
  id: uuid('id').defaultRandom().primaryKey(),
  shiftId: uuid('shift_id').references(() => shifts.id).notNull(),
  customerId: uuid('customer_id').references(() => customers.id).notNull(),
  vehicleId: uuid('vehicle_id').references(() => customerVehicles.id),
  transactionType: varchar('transaction_type', { length: 50 }).notNull(), // 'Credit Sale', 'Collection', 'Adjustment'
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  referenceType: varchar('reference_type', { length: 50 }),
  referenceId: uuid('reference_id'),
  notes: varchar('notes', { length: 500 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const suppliers = pgTable('suppliers', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  stationId: uuid('station_id').references(() => stations.id),
  name: varchar('name', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 50 }),
  metadata: jsonb('metadata'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const supplierTransactions = pgTable('supplier_transactions', {
  id: uuid('id').defaultRandom().primaryKey(),
  shiftId: uuid('shift_id').references(() => shifts.id).notNull(),
  supplierId: uuid('supplier_id').references(() => suppliers.id).notNull(),
  transactionType: varchar('transaction_type', { length: 50 }).notNull(), // 'Purchase', 'Payment', 'Adjustment'
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  referenceType: varchar('reference_type', { length: 50 }),
  referenceId: uuid('reference_id'),
  notes: varchar('notes', { length: 500 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ----------------------------------------------------
// TRANSACTION & INVENTORY DOMAINS
// ----------------------------------------------------

export const sales = pgTable('sales', {
  id: uuid('id').defaultRandom().primaryKey(),
  documentNumber: varchar('document_number', { length: 100 }).notNull(),
  shiftId: uuid('shift_id').references(() => shifts.id).notNull(),
  saleType: varchar('sale_type', { length: 50 }).notNull(), // 'Fuel', 'Product', 'Mixed', 'Credit'
  customerId: uuid('customer_id').references(() => customers.id),
  vehicleId: uuid('vehicle_id').references(() => customerVehicles.id),
  subtotalAmount: numeric('subtotal_amount', { precision: 12, scale: 2 }).notNull(),
  taxAmount: numeric('tax_amount', { precision: 12, scale: 2 }).notNull(),
  totalAmount: numeric('total_amount', { precision: 12, scale: 2 }).notNull(),
  notes: varchar('notes', { length: 500 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const saleItems = pgTable('sale_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  saleId: uuid('sale_id').references(() => sales.id).notNull(),
  productId: uuid('product_id').references(() => products.id).notNull(),
  quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull(),
  unitPrice: numeric('unit_price', { precision: 12, scale: 2 }).notNull(),
  discountAmount: numeric('discount_amount', { precision: 12, scale: 2 }).default('0').notNull(),
  taxAmount: numeric('tax_amount', { precision: 12, scale: 2 }).notNull(),
  lineTotal: numeric('line_total', { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const stockMovements = pgTable('stock_movements', {
  id: uuid('id').defaultRandom().primaryKey(),
  shiftId: uuid('shift_id').references(() => shifts.id).notNull(),
  productId: uuid('product_id').references(() => products.id).notNull(),
  tankId: uuid('tank_id').references(() => tanks.id),
  movementType: varchar('movement_type', { length: 50 }).notNull(), // 'Purchase', 'Sale', 'Adjustment', 'Decantation', 'Variance'
  quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull(),
  referenceType: varchar('reference_type', { length: 50 }),
  referenceId: uuid('reference_id'),
  notes: varchar('notes', { length: 500 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const stockVariances = pgTable('stock_variances', {
  id: uuid('id').defaultRandom().primaryKey(),
  shiftId: uuid('shift_id').references(() => shifts.id).notNull(),
  productId: uuid('product_id').references(() => products.id).notNull(),
  tankId: uuid('tank_id').references(() => tanks.id),
  expectedQuantity: numeric('expected_quantity', { precision: 12, scale: 3 }).notNull(),
  actualQuantity: numeric('actual_quantity', { precision: 12, scale: 3 }).notNull(),
  varianceQuantity: numeric('variance_quantity', { precision: 12, scale: 3 }).notNull(),
  reason: varchar('reason', { length: 255 }),
  approvedBy: uuid('approved_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ----------------------------------------------------
// FINANCE DOMAIN
// ----------------------------------------------------

export const expenseCategories = pgTable('expense_categories', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  isSystem: boolean('is_system').default(false).notNull(),
});

export const expenses = pgTable('expenses', {
  id: uuid('id').defaultRandom().primaryKey(),
  shiftId: uuid('shift_id').references(() => shifts.id).notNull(),
  categoryId: uuid('category_id').references(() => expenseCategories.id).notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  description: varchar('description', { length: 255 }),
  parentExpenseId: uuid('parent_expense_id'),
  adjustmentReason: varchar('adjustment_reason', { length: 255 }),
  status: varchar('status', { length: 20 }).default('ACTIVE').notNull(), // 'ACTIVE', 'ADJUSTMENT', 'VOIDED'
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const collections = pgTable('collections', {
  id: uuid('id').defaultRandom().primaryKey(),
  documentNumber: varchar('document_number', { length: 100 }).notNull(),
  shiftId: uuid('shift_id').references(() => shifts.id).notNull(),
  customerId: uuid('customer_id').references(() => customers.id).notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  paymentMethod: varchar('payment_method', { length: 50 }).notNull(),
  notes: varchar('notes', { length: 500 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const purchases = pgTable('purchases', {
  id: uuid('id').defaultRandom().primaryKey(),
  documentNumber: varchar('document_number', { length: 100 }).notNull(),
  shiftId: uuid('shift_id').references(() => shifts.id).notNull(),
  supplierId: uuid('supplier_id').references(() => suppliers.id).notNull(),
  invoiceNumber: varchar('invoice_number', { length: 100 }),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  notes: varchar('notes', { length: 500 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ----------------------------------------------------
// REPORTING, AUDIT & SYNC DOMAINS
// ----------------------------------------------------

export const shiftSummaries = pgTable('shift_summaries', {
  id: uuid('id').defaultRandom().primaryKey(),
  shiftId: uuid('shift_id').references(() => shifts.id).notNull(),
  snapshotData: jsonb('snapshot_data').notNull(),
  generatedAt: timestamp('generated_at').defaultNow().notNull(),
});

export const dssrSnapshots = pgTable('dssr_snapshots', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  stationId: uuid('station_id').references(() => stations.id).notNull(),
  businessDate: varchar('business_date', { length: 10 }).notNull(), // YYYY-MM-DD
  snapshotData: jsonb('snapshot_data').notNull(),
  generatedAt: timestamp('generated_at').defaultNow().notNull(),
});

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  stationId: uuid('station_id').references(() => stations.id),
  entityType: varchar('entity_type', { length: 100 }).notNull(),
  entityId: uuid('entity_id').notNull(),
  action: varchar('action', { length: 50 }).notNull(),
  beforeData: jsonb('before_data'),
  afterData: jsonb('after_data'),
  performedBy: uuid('performed_by').references(() => users.id).notNull(),
  performedAt: timestamp('performed_at').defaultNow().notNull(),
});

export const businessEvents = pgTable('business_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventId: uuid('event_id').notNull(),
  eventType: varchar('event_type', { length: 100 }).notNull(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  stationId: uuid('station_id').references(() => stations.id),
  entityType: varchar('entity_type', { length: 100 }).notNull(),
  entityId: uuid('entity_id').notNull(),
  payload: jsonb('payload').notNull(),
  occurredAt: timestamp('occurred_at').defaultNow().notNull(),
});

export const syncEvents = pgTable('sync_events', {
  eventId: uuid('event_id').primaryKey(),
  eventType: varchar('event_type', { length: 100 }).notNull(),
  entityType: varchar('entity_type', { length: 100 }).notNull(),
  entityId: uuid('entity_id').notNull(),
  payload: jsonb('payload').notNull(),
  status: varchar('status', { length: 20 }).default('PENDING').notNull(), // 'PENDING', 'PROCESSING', 'SYNCED', 'FAILED'
  retryCount: integer('retry_count').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  syncedAt: timestamp('synced_at'),
});

export const fuelPrices = pgTable('fuel_prices', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  stationId: uuid('station_id').references(() => stations.id).notNull(),
  productId: uuid('product_id').references(() => products.id).notNull(),
  price: numeric('price', { precision: 10, scale: 2 }).notNull(),
  effectiveFrom: timestamp('effective_from').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const attendantHandovers = pgTable('attendant_handovers', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  stationId: uuid('station_id').references(() => stations.id).notNull(),
  shiftId: uuid('shift_id').references(() => shifts.id).notNull(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  duId: uuid('du_id').references(() => dispenserUnits.id).notNull(),
  cashHandedOver: numeric('cash_handed_over', { precision: 12, scale: 2 }).default('0').notNull(),
  cardHandedOver: numeric('card_handed_over', { precision: 12, scale: 2 }).default('0').notNull(),
  upiHandedOver: numeric('upi_handed_over', { precision: 12, scale: 2 }).default('0').notNull(),
  creditHandedOver: numeric('credit_handed_over', { precision: 12, scale: 2 }).default('0').notNull(),
  testingVolume: numeric('testing_volume', { precision: 10, scale: 3 }).default('0').notNull(),
  expectedSales: numeric('expected_sales', { precision: 12, scale: 2 }).default('0').notNull(),
  varianceAmount: numeric('variance_amount', { precision: 12, scale: 2 }).default('0').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
