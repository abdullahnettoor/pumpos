import { pgTable, uuid, varchar, timestamp, boolean, integer, numeric, jsonb, primaryKey, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ----------------------------------------------------
// CORE DOMAIN
// ----------------------------------------------------

export const organizations = pgTable('organizations', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  subscriptionPlan: varchar('subscription_plan', { length: 50 }).default('Core').notNull(),
  subscriptionStatus: varchar('subscription_status', { length: 50 }).default('Active').notNull(),
  metadata: jsonb('metadata').default({}).notNull(),
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

// Payment terminal (card/UPI) machines. Captured at onboarding and linked to
// dispenser units at shift open so card/UPI takings reconcile per terminal.
export const paymentTerminals = pgTable('payment_terminals', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  stationId: uuid('station_id').references(() => stations.id).notNull(),
  label: varchar('label', { length: 100 }).notNull(),
  provider: varchar('provider', { length: 100 }), // bank / aggregator
  terminalCode: varchar('terminal_code', { length: 100 }), // device TID
  supportsCard: boolean('supports_card').default(true).notNull(),
  supportsUpi: boolean('supports_upi').default(true).notNull(),
  // The MERCHANT_CLEARING account this terminal settles into (Phase F). Many
  // terminals of the same acquirer (e.g. 4 Paytm machines) share one account.
  clearingAccountId: uuid('clearing_account_id'),
  isActive: boolean('is_active').default(true).notNull(),
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
  // Which inventory engine governs this product: 'BULK' (fuel tanks), 'ITEM'
  // (packaged merchandise), or 'NONE' (services / non-stocked).
  inventoryType: varchar('inventory_type', { length: 20 }).default('ITEM').notNull(),
  stockTracked: boolean('stock_tracked').default(true).notNull(),
  isTaxable: boolean('is_taxable').default(true).notNull(),
  // Tax treatment: 'FUEL_VAT' | 'GST' | 'EXEMPT' | 'NON_TAXABLE'. Fuel is VAT
  // (outside GST); lubricants/merchandise are GST. is_taxable kept (derived).
  taxCategory: varchar('tax_category', { length: 20 }).default('GST').notNull(),
  unit: varchar('unit', { length: 50 }).notNull(),
  // Optional merchandise refinements: manufacturer/brand, finer category label,
  // and a selling price (MRP) used to prefill merchandise sales.
  brand: varchar('brand', { length: 150 }),
  category: varchar('category', { length: 100 }),
  sellingPrice: numeric('selling_price', { precision: 12, scale: 2 }),
  // Rolling weighted-average landed cost per unit (pre-tax for GST items where
  // input tax is creditable; tax-inclusive for fuel/VAT). Recomputed on each
  // purchase; seeded from opening cost at onboarding. Drives COGS / margin.
  costBasis: numeric('cost_basis', { precision: 14, scale: 4 }).default('0'),
  taxConfig: jsonb('tax_config').default({ gst_rate: 18, hsn_code: '' }).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ----------------------------------------------------
// STATION OPERATIONS DOMAIN (Business Day + Shift)
// ----------------------------------------------------

// The accounting / reporting period anchor. Financial events attach to a
// business day; operational (drawer) events additionally attach to a shift.
export const businessDays = pgTable('business_days', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  stationId: uuid('station_id').references(() => stations.id).notNull(),
  businessDate: varchar('business_date', { length: 10 }).notNull(), // YYYY-MM-DD
  status: varchar('status', { length: 20 }).default('OPEN').notNull(), // 'OPEN' | 'CLOSED'
  openedBy: uuid('opened_by').references(() => users.id).notNull(),
  openedAt: timestamp('opened_at').defaultNow().notNull(),
  closedBy: uuid('closed_by').references(() => users.id),
  closedAt: timestamp('closed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  orgStationDateUniq: uniqueIndex('business_days_org_station_date_uniq').on(t.organizationId, t.stationId, t.businessDate),
}));

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
  businessDayId: uuid('business_day_id').references(() => businessDays.id).notNull(),
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

// Links payment terminals to a shift (optionally to a specific DU) at open.
export const shiftTerminalLinks = pgTable('shift_terminal_links', {
  id: uuid('id').defaultRandom().primaryKey(),
  shiftId: uuid('shift_id').references(() => shifts.id).notNull(),
  terminalId: uuid('terminal_id').references(() => paymentTerminals.id).notNull(),
  duId: uuid('du_id').references(() => dispenserUnits.id),
  assignedAt: timestamp('assigned_at').defaultNow().notNull(),
});

export const nozzleReadings = pgTable('nozzle_readings', {
  id: uuid('id').defaultRandom().primaryKey(),
  shiftId: uuid('shift_id').references(() => shifts.id).notNull(),
  nozzleId: uuid('nozzle_id').references(() => nozzles.id).notNull(),
  openingReading: numeric('opening_reading', { precision: 15, scale: 3 }).notNull(),
  closingReading: numeric('closing_reading', { precision: 15, scale: 3 }).notNull(),
  volumeSold: numeric('volume_sold', { precision: 12, scale: 3 }).notNull(),
  testingVolume: numeric('testing_volume', { precision: 12, scale: 3 }).default('0').notNull(),
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
  // How the customer's receivable is settled: 'OPEN' = running account collected
  // over time; 'EOD' = expected to be cleared by end of the business day (common
  // for regular walk-in-on-account customers). Informational for reminders/reports.
  settlementCycle: varchar('settlement_cycle', { length: 20 }).default('OPEN').notNull(),
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
  // Nullable: customer-ledger entries (credit sales, collections) are anchored
  // to the business day; a shift link exists only for drawer-affecting cash.
  shiftId: uuid('shift_id').references(() => shifts.id),
  businessDayId: uuid('business_day_id').references(() => businessDays.id).notNull(),
  // Nullable: an OMC fleet-card sale ('OMC Sale') may be anonymous (paid via the
  // Oil Company's card, settled to the CMS account — not a station receivable),
  // so it can be recorded without a customer. Credit sales always carry one.
  customerId: uuid('customer_id').references(() => customers.id),
  vehicleId: uuid('vehicle_id').references(() => customerVehicles.id),
  productId: uuid('product_id').references(() => products.id),
  // Operator who recorded the credit sale (attendant accountability). Set when
  // entered within a shift; null for back-office/business-day credit entries.
  attendantId: uuid('attendant_id').references(() => users.id),
  // Dispensing unit the fuel-on-credit was dispensed from. Set when the credit
  // sale is declared within a DU handover, so each handover derives its own
  // credit-chit total. Null for merchandise credit / back-office entries.
  duId: uuid('du_id').references(() => dispenserUnits.id),
  transactionType: varchar('transaction_type', { length: 50 }).notNull(), // 'Credit Sale', 'Collection', 'Adjustment'
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  quantity: numeric('quantity', { precision: 12, scale: 3 }),
  unitPrice: numeric('unit_price', { precision: 12, scale: 2 }),
  referenceType: varchar('reference_type', { length: 50 }),
  referenceId: uuid('reference_id'),
  notes: varchar('notes', { length: 500 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  shiftAttendantIdx: index('customer_txn_shift_attendant_idx').on(t.shiftId, t.attendantId),
  shiftDuIdx: index('customer_txn_shift_du_idx').on(t.shiftId, t.duId),
}));

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
  // Nullable: a supplier payment from the drawer links to a shift; bank/office
  // payments do not. Always anchored to a business day.
  shiftId: uuid('shift_id').references(() => shifts.id),
  businessDayId: uuid('business_day_id').references(() => businessDays.id).notNull(),
  supplierId: uuid('supplier_id').references(() => suppliers.id).notNull(),
  transactionType: varchar('transaction_type', { length: 50 }).notNull(), // 'Purchase', 'Payment', 'Adjustment'
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  paidFrom: varchar('paid_from', { length: 20 }).default('BANK').notNull(), // 'SHIFT_CASH' | 'BANK' | 'OWNER'
  affectsDrawer: boolean('affects_drawer').default(false).notNull(),
  referenceType: varchar('reference_type', { length: 50 }),
  referenceId: uuid('reference_id'),
  notes: varchar('notes', { length: 500 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ----------------------------------------------------
// FINANCIAL ACCOUNTS & MONEY LEDGER (Phase F, Layer A)
// ----------------------------------------------------

// A money store: where cash actually is (drawer, petty cash, bank, card/UPI
// clearing, owner). station_id NULL = organization-shared (future multi-station).
export const financialAccounts = pgTable('financial_accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  stationId: uuid('station_id').references(() => stations.id),
  // 'CASH_IN_HAND' | 'PETTY_CASH' | 'BANK' | 'MERCHANT_CLEARING' | 'OWNER'
  accountType: varchar('account_type', { length: 20 }).notNull(),
  name: varchar('name', { length: 150 }).notNull(),
  openingBalance: numeric('opening_balance', { precision: 14, scale: 2 }).default('0').notNull(),
  openingDate: varchar('opening_date', { length: 10 }), // YYYY-MM-DD
  // BANK: {bankName, accountNoMasked, ifsc}; MERCHANT_CLEARING: {terminalId, mdrPct, settlesToAccountId}
  metadata: jsonb('metadata'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  orgStationIdx: index('financial_accounts_org_station_idx').on(t.organizationId, t.stationId),
}));

// Single-entry, signed money ledger. Balance = opening + Σin − Σout. A transfer
// is two linked rows sharing transferId (out of A, in to B) that net to zero.
export const ledgerEntries = pgTable('ledger_entries', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  stationId: uuid('station_id').references(() => stations.id),
  accountId: uuid('account_id').references(() => financialAccounts.id).notNull(),
  direction: varchar('direction', { length: 3 }).notNull(), // 'in' | 'out'
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
  entryDate: varchar('entry_date', { length: 10 }).notNull(), // YYYY-MM-DD business date
  // 'OPENING'|'SALE_CASH'|'SALE_CARD'|'COLLECTION'|'EXPENSE'|'SUPPLIER_PAYMENT'
  // |'DEPOSIT'|'TRANSFER'|'SETTLEMENT'|'BANK_CHARGE'|'ADJUSTMENT'
  sourceType: varchar('source_type', { length: 30 }).notNull(),
  sourceId: uuid('source_id'), // originating row (sale/expense/collection/…)
  transferId: uuid('transfer_id'), // links the two rows of a transfer
  businessDayId: uuid('business_day_id').references(() => businessDays.id),
  shiftId: uuid('shift_id').references(() => shifts.id),
  reconciled: boolean('reconciled').default(false).notNull(),
  notes: varchar('notes', { length: 500 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  accountDateIdx: index('ledger_entries_account_date_idx').on(t.accountId, t.entryDate),
  orgStationIdx: index('ledger_entries_org_station_idx').on(t.organizationId, t.stationId),
  orgStationDateIdx: index('ledger_entries_org_station_date_idx').on(t.organizationId, t.stationId, t.entryDate),
  sourceIdx: index('ledger_entries_source_idx').on(t.sourceType, t.sourceId),
  transferIdx: index('ledger_entries_transfer_idx').on(t.transferId),
}));

// ----------------------------------------------------
// TRANSACTION & INVENTORY DOMAINS
// ----------------------------------------------------

export const sales = pgTable('sales', {
  id: uuid('id').defaultRandom().primaryKey(),
  documentNumber: varchar('document_number', { length: 100 }).notNull(),
  shiftId: uuid('shift_id').references(() => shifts.id).notNull(),
  businessDayId: uuid('business_day_id').references(() => businessDays.id).notNull(),
  saleType: varchar('sale_type', { length: 50 }).notNull(), // 'Fuel', 'Product', 'Mixed', 'Credit'
  // How the sale was captured: 'READING' (fuel, derived from nozzle readings)
  // or 'POS' (merchandise, entered transactionally).
  captureMechanism: varchar('capture_mechanism', { length: 20 }).default('POS').notNull(),
  // Settlement method for the sale; drives the cash portion of drawer reconciliation.
  paymentMethod: varchar('payment_method', { length: 20 }).default('Cash').notNull(), // 'Cash' | 'Card' | 'UPI' | 'Credit'
  customerId: uuid('customer_id').references(() => customers.id),
  vehicleId: uuid('vehicle_id').references(() => customerVehicles.id),
  // Operator who made the sale (attendant accountability). Set when entered
  // within a shift; folds into that attendant's handover reconciliation.
  attendantId: uuid('attendant_id').references(() => users.id),
  subtotalAmount: numeric('subtotal_amount', { precision: 12, scale: 2 }).notNull(),
  taxAmount: numeric('tax_amount', { precision: 12, scale: 2 }).notNull(),
  totalAmount: numeric('total_amount', { precision: 12, scale: 2 }).notNull(),
  // Portion of a cash-recorded sale that was actually paid by card/UPI (Option B):
  // subtracted from the attendant's expected drawer cash; that money is on the
  // terminal rail. Sale paymentMethod stays 'Cash'.
  nonCashAmount: numeric('non_cash_amount', { precision: 12, scale: 2 }).default('0').notNull(),
  // Ad-hoc (unsaved) buyer details for a walk-in bill: { name, phone, gstin, stateCode }.
  // Populated only when the sale is NOT linked to a saved customer; invoices read
  // the bill-to from here when customerId is null.
  buyerDetails: jsonb('buyer_details'),
  notes: varchar('notes', { length: 500 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  shiftAttendantIdx: index('sales_shift_attendant_idx').on(t.shiftId, t.attendantId),
}));

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
  // Nullable: sale movements occur within a shift; purchase/receipt movements
  // happen against a business day with no shift.
  shiftId: uuid('shift_id').references(() => shifts.id),
  businessDayId: uuid('business_day_id').references(() => businessDays.id).notNull(),
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
  // Nullable: a dip/physical count is a business-day reconciliation, not a
  // shift-bound event. shift_id is set only for shift-scoped variance capture.
  shiftId: uuid('shift_id').references(() => shifts.id),
  businessDayId: uuid('business_day_id').references(() => businessDays.id).notNull(),
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
}, (t) => ({
  orgNameUniq: uniqueIndex('expense_categories_org_name_idx').on(t.organizationId, t.name),
}));

export const expenses = pgTable('expenses', {
  id: uuid('id').defaultRandom().primaryKey(),
  // Nullable: only drawer-paid expenses link to a shift; rent/salary/bill
  // expenses paid from bank/office attach only to the business day.
  shiftId: uuid('shift_id').references(() => shifts.id),
  businessDayId: uuid('business_day_id').references(() => businessDays.id).notNull(),
  categoryId: uuid('category_id').references(() => expenseCategories.id).notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  paidFrom: varchar('paid_from', { length: 20 }).default('SHIFT_CASH').notNull(), // 'SHIFT_CASH' | 'BANK' | 'OWNER'
  affectsDrawer: boolean('affects_drawer').default(true).notNull(),
  description: varchar('description', { length: 255 }),
  parentExpenseId: uuid('parent_expense_id'),
  adjustmentReason: varchar('adjustment_reason', { length: 255 }),
  status: varchar('status', { length: 20 }).default('ACTIVE').notNull(), // 'ACTIVE', 'ADJUSTMENT', 'VOIDED'
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ----------------------------------------------------
// OTHER / INDIRECT INCOME (Phase FI)
// ----------------------------------------------------

// Income categories mirror expense categories, plus an optional per-category
// tax_config (GST treatment) so income tax handling is extensible without a
// schema change. Keep the seeded set minimal (Rental, Parking, Commission, …).
export const incomeCategories = pgTable('income_categories', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  // Optional GST/tax treatment, e.g. { gst_rate: 18, hsn_code: '996601', price_inclusive: true }.
  taxConfig: jsonb('tax_config'),
  isSystem: boolean('is_system').default(false).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
}, (t) => ({
  orgNameUniq: uniqueIndex('income_categories_org_name_idx').on(t.organizationId, t.name),
}));

// Non-operating / indirect income (tanker rental, truck parking, commission,
// scrap, interest, …). Mirrors `expenses`: business-day anchored, shift_id set
// only when the cash hits the drawer (received_into = SHIFT_CASH).
export const otherIncome = pgTable('other_income', {
  id: uuid('id').defaultRandom().primaryKey(),
  shiftId: uuid('shift_id').references(() => shifts.id),
  businessDayId: uuid('business_day_id').references(() => businessDays.id).notNull(),
  categoryId: uuid('category_id').references(() => incomeCategories.id).notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  receivedInto: varchar('received_into', { length: 20 }).default('SHIFT_CASH').notNull(), // 'SHIFT_CASH' | 'BANK' | 'OWNER'
  affectsDrawer: boolean('affects_drawer').default(true).notNull(),
  payer: varchar('payer', { length: 255 }),
  referenceType: varchar('reference_type', { length: 50 }),
  referenceId: uuid('reference_id'),
  description: varchar('description', { length: 500 }),
  status: varchar('status', { length: 20 }).default('ACTIVE').notNull(), // 'ACTIVE' | 'VOIDED'
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  bdIdx: index('other_income_business_day_idx').on(t.businessDayId),
  shiftIdx: index('other_income_shift_idx').on(t.shiftId),
  categoryIdx: index('other_income_category_idx').on(t.categoryId),
}));

export const collections = pgTable('collections', {
  id: uuid('id').defaultRandom().primaryKey(),
  documentNumber: varchar('document_number', { length: 100 }).notNull(),
  // Nullable: only cash collected at the counter touches the drawer/shift.
  // Bank/UPI/online collections are anchored to the business day only.
  shiftId: uuid('shift_id').references(() => shifts.id),
  businessDayId: uuid('business_day_id').references(() => businessDays.id).notNull(),
  customerId: uuid('customer_id').references(() => customers.id).notNull(),
  vehicleId: uuid('vehicle_id').references(() => customerVehicles.id),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  paymentMethod: varchar('payment_method', { length: 50 }).notNull(),
  notes: varchar('notes', { length: 500 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const purchases = pgTable('purchases', {
  id: uuid('id').defaultRandom().primaryKey(),
  documentNumber: varchar('document_number', { length: 100 }).notNull(),
  // Purchases are inventory + payable events anchored to a business day, NOT a
  // shift. shiftId is kept only for an optional drawer-paid linkage.
  shiftId: uuid('shift_id').references(() => shifts.id),
  businessDayId: uuid('business_day_id').references(() => businessDays.id).notNull(),
  supplierId: uuid('supplier_id').references(() => suppliers.id).notNull(),
  invoiceNumber: varchar('invoice_number', { length: 100 }),
  // `amount` is the grand total (tax inclusive) = the supplier payable.
  // The tax breakup below is denormalised from purchase_items for invoice/ITC reporting.
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  taxableAmount: numeric('taxable_amount', { precision: 12, scale: 2 }).default('0').notNull(),
  cgstTotal: numeric('cgst_total', { precision: 12, scale: 2 }).default('0').notNull(),
  sgstTotal: numeric('sgst_total', { precision: 12, scale: 2 }).default('0').notNull(),
  igstTotal: numeric('igst_total', { precision: 12, scale: 2 }).default('0').notNull(),
  vatTotal: numeric('vat_total', { precision: 12, scale: 2 }).default('0').notNull(),
  cessTotal: numeric('cess_total', { precision: 12, scale: 2 }).default('0').notNull(),
  notes: varchar('notes', { length: 500 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Line items of a purchase (supplier tax invoice). Each line updates inventory
// for its product and carries its own computed tax breakup. Fuel lines may split
// the received quantity across destination tanks via `tankAllocations`.
export const purchaseItems = pgTable('purchase_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  purchaseId: uuid('purchase_id').references(() => purchases.id).notNull(),
  productId: uuid('product_id').references(() => products.id).notNull(),
  quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull(),
  unitPrice: numeric('unit_price', { precision: 12, scale: 4 }).notNull(), // pre-tax rate
  taxCategory: varchar('tax_category', { length: 20 }).default('GST').notNull(),
  gstRate: numeric('gst_rate', { precision: 5, scale: 2 }),
  vatRate: numeric('vat_rate', { precision: 5, scale: 2 }),
  cessRate: numeric('cess_rate', { precision: 5, scale: 2 }),
  hsnCode: varchar('hsn_code', { length: 50 }),
  taxableAmount: numeric('taxable_amount', { precision: 12, scale: 2 }).notNull(),
  cgst: numeric('cgst', { precision: 12, scale: 2 }).default('0').notNull(),
  sgst: numeric('sgst', { precision: 12, scale: 2 }).default('0').notNull(),
  igst: numeric('igst', { precision: 12, scale: 2 }).default('0').notNull(),
  vat: numeric('vat', { precision: 12, scale: 2 }).default('0').notNull(),
  cess: numeric('cess', { precision: 12, scale: 2 }).default('0').notNull(),
  lineTotal: numeric('line_total', { precision: 12, scale: 2 }).notNull(),
  tankAllocations: jsonb('tank_allocations'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  purchaseIdIdx: index('purchase_items_purchase_id_idx').on(t.purchaseId),
  productIdIdx: index('purchase_items_product_id_idx').on(t.productId),
}));

// ----------------------------------------------------
// INVOICING DOMAIN (Phase T4)
// ----------------------------------------------------

// Outbound B2B GST tax invoices. Immutable snapshot of the buyer/supplier
// identity + CGST/SGST/IGST split + priced lines at issue time; numbered by a
// gapless per-FY-per-GSTIN series.
export const invoices = pgTable('invoices', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  stationId: uuid('station_id').references(() => stations.id),
  saleId: uuid('sale_id').references(() => sales.id),
  invoiceNumber: varchar('invoice_number', { length: 50 }).notNull(),
  financialYear: varchar('financial_year', { length: 9 }).notNull(), // '2026-27'
  issuedDate: varchar('issued_date', { length: 10 }).notNull(), // YYYY-MM-DD (business date)
  buyerCustomerId: uuid('buyer_customer_id').references(() => customers.id),
  buyerName: varchar('buyer_name', { length: 255 }),
  buyerGstin: varchar('buyer_gstin', { length: 20 }),
  buyerStateCode: varchar('buyer_state_code', { length: 2 }),
  interState: boolean('inter_state').default(false).notNull(),
  taxableAmount: numeric('taxable_amount', { precision: 12, scale: 2 }).default('0').notNull(),
  cgstTotal: numeric('cgst_total', { precision: 12, scale: 2 }).default('0').notNull(),
  sgstTotal: numeric('sgst_total', { precision: 12, scale: 2 }).default('0').notNull(),
  igstTotal: numeric('igst_total', { precision: 12, scale: 2 }).default('0').notNull(),
  vatTotal: numeric('vat_total', { precision: 12, scale: 2 }).default('0').notNull(),
  cessTotal: numeric('cess_total', { precision: 12, scale: 2 }).default('0').notNull(),
  roundOff: numeric('round_off', { precision: 12, scale: 2 }).default('0').notNull(),
  totalAmount: numeric('total_amount', { precision: 12, scale: 2 }).default('0').notNull(),
  snapshotData: jsonb('snapshot_data').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  orgNumberUniq: uniqueIndex('invoices_org_number_uniq').on(t.organizationId, t.invoiceNumber),
  saleUniq: uniqueIndex('invoices_sale_uniq').on(t.saleId).where(sql`"sale_id" IS NOT NULL`),
  orgFyIdx: index('invoices_org_fy_idx').on(t.organizationId, t.financialYear),
  stationIdx: index('invoices_station_idx').on(t.stationId),
}));

// Generic gapless document numbering store (per org + doc type + scope + FY).
// `scope` is the sub-series key (e.g. supplier GSTIN for invoices), '' if N/A.
// Stores only the last issued number per counter.
export const documentSequences = pgTable('document_sequences', {
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  docType: varchar('doc_type', { length: 30 }).default('INVOICE').notNull(),
  scope: varchar('scope', { length: 40 }).default('').notNull(),
  financialYear: varchar('financial_year', { length: 9 }).default('').notNull(),
  lastNumber: integer('last_number').default(0).notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.organizationId, t.docType, t.scope, t.financialYear] }),
}));

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

// Canonical append-only business-event log (Handbook Vol. 4). Mirrors the
// DomainEvent envelope in @pump/core. Audit log + sync/replay source; business
// tables remain the query-optimized projections.
export const events = pgTable('events', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventId: uuid('event_id').notNull().unique(),
  eventType: varchar('event_type', { length: 100 }).notNull(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  stationId: uuid('station_id').references(() => stations.id),
  businessDayId: uuid('business_day_id').references(() => businessDays.id),
  aggregateType: varchar('aggregate_type', { length: 100 }).notNull(),
  aggregateId: uuid('aggregate_id').notNull(),
  version: integer('version').default(1).notNull(),
  occurredAt: timestamp('occurred_at').notNull(),
  recordedAt: timestamp('recorded_at').defaultNow().notNull(),
  actorId: uuid('actor_id').references(() => users.id),
  correlationId: uuid('correlation_id'),
  causationId: uuid('causation_id'),
  payload: jsonb('payload').notNull(),
  metadata: jsonb('metadata').default({}).notNull(),
});

// Caches the result of a mutating request keyed by a client-supplied
// Idempotency-Key header, so retries (after a timeout or offline replay) return
// the original response instead of duplicating the write.
export const idempotencyKeys = pgTable('idempotency_keys', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  idempotencyKey: varchar('idempotency_key', { length: 255 }).notNull().unique(),
  requestPath: varchar('request_path', { length: 255 }),
  responseStatus: integer('response_status'),
  responseBody: jsonb('response_body'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  orgIdx: index('idempotency_keys_org_idx').on(t.organizationId),
}));

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

// Per-terminal card/UPI breakdown captured within an attendant handover. The
// parent handover's card/upi aggregates are the sum of these rows when present.
export const handoverTerminalEntries = pgTable('handover_terminal_entries', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  stationId: uuid('station_id').references(() => stations.id).notNull(),
  handoverId: uuid('handover_id').references(() => attendantHandovers.id, { onDelete: 'cascade' }).notNull(),
  shiftId: uuid('shift_id').references(() => shifts.id).notNull(),
  terminalId: uuid('terminal_id').references(() => paymentTerminals.id).notNull(),
  duId: uuid('du_id').references(() => dispenserUnits.id),
  cardAmount: numeric('card_amount', { precision: 12, scale: 2 }).default('0').notNull(),
  upiAmount: numeric('upi_amount', { precision: 12, scale: 2 }).default('0').notNull(),
  batchRef: varchar('batch_ref', { length: 100 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  handoverIdx: index('handover_terminal_entries_handover_idx').on(t.handoverId),
  shiftIdx: index('handover_terminal_entries_shift_idx').on(t.shiftId),
}));
