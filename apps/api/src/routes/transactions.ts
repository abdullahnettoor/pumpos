import { Hono } from 'hono';
import { and, desc, eq, gte, ilike, lte, sql } from 'drizzle-orm';
import { schema, type DbClient } from '@pump/db';
import {
  isAuthorizedForStation,
  canManageCustomers,
  canManageSuppliers,
  canArchiveParty,
  canRecordPurchase,
  type Role,
} from '@pump/shared';
import {
  CreateCustomer,
  UpdateCustomer,
  CreateSupplier,
  UpdateSupplier,
  AddVehicle,
  UpdateVehicle,
  RecordExpense,
  RecordCollection,
  RecordCreditSale,
  VoidCreditSale,
  RecordPurchase,
  RecordSupplierPayment,
  CreateSale,
  RecordStockCount,
  type Result,
} from '@pump/core';
import { buildContext } from '../infra/context.js';
import { loadStationClock } from '../infra/station-clock.js';
import { runInTransaction } from '../infra/transaction.js';
import { TimestampDocumentNumberGenerator } from '../infra/doc-numbers.js';
import {
  DrizzleCustomerRepository,
  DrizzleCustomerLedgerRepository,
  DrizzleCollectionRepository,
  DrizzleSupplierRepository,
  DrizzleVehicleRepository,
} from '../infra/repositories/crm-repositories.js';
import {
  DrizzlePurchaseRepository,
  DrizzlePurchaseItemRepository,
  DrizzleSupplierTransactionRepository,
} from '../infra/repositories/purchasing-repositories.js';
import { DrizzleExpenseRepository } from '../infra/repositories/finance-repositories.js';
import { DrizzleStockMovementRepository, DrizzleStockVarianceRepository } from '../infra/repositories/inventory-repositories.js';
import { DrizzleSaleRepository } from '../infra/repositories/retail-repositories.js';
import { DrizzleProductRepository } from '../infra/repositories/product.repo.js';
import { DrizzleStationRepository } from '../infra/repositories/setup-repositories.js';
import {
  DrizzleShiftRepository,
  DrizzleBusinessDayRepository,
} from '../infra/repositories/station-ops-repositories.js';

type Variables = {
  db: DbClient;
  user: {
    id: string;
    email: string;
    organizationId: string;
    role: Role;
    assignedStationIds: string[];
  };
};

export const transactionsRouter = new Hono<{ Variables: Variables }>();

const STATUS_BY_CODE: Record<string, number> = {
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  FORBIDDEN: 403,
  UNAUTHORIZED: 401,
  INVARIANT_VIOLATION: 409,
};

function sendResult<T>(c: any, result: Result<T>) {
  if (result.success) return c.json({ success: true, data: result.data });
  const status = STATUS_BY_CODE[result.error.code] ?? 400;
  return c.json({ success: false, error: result.error }, status);
}

const docNumbers = new TimestampDocumentNumberGenerator();

const DEFAULT_EXPENSE_CATEGORIES = [
  'Staff Tea & Snacks',
  'Office Stationery',
  'Generator Diesel',
  'Cleaning & Hygiene',
  'General Miscellaneous',
];

// ====================================================
// MASTER DATA — Suppliers
// ====================================================

transactionsRouter.get('/suppliers', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  const activeOnly = c.req.query('activeOnly') !== 'false';

  // Outstanding balance = Σ purchases − Σ payments, scoped to org via business_days.
  // Aggregated in SQL (one row per supplier) + run alongside the list query.
  const [list, balanceRows] = await Promise.all([
    new DrizzleSupplierRepository(db).listByOrganization(user.organizationId, activeOnly),
    db
      .select({
        supplierId: schema.supplierTransactions.supplierId,
        balance: sql<string>`COALESCE(SUM(CASE WHEN ${schema.supplierTransactions.transactionType} = 'Payment' THEN -${schema.supplierTransactions.amount} ELSE ${schema.supplierTransactions.amount} END), 0)`,
      })
      .from(schema.supplierTransactions)
      .innerJoin(schema.businessDays, eq(schema.supplierTransactions.businessDayId, schema.businessDays.id))
      .where(eq(schema.businessDays.organizationId, user.organizationId))
      .groupBy(schema.supplierTransactions.supplierId),
  ]);

  const balances: Record<string, number> = {};
  for (const r of balanceRows) balances[r.supplierId] = Number(r.balance);
  return c.json({ success: true, data: list.map((s) => ({ ...s, currentBalance: balances[s.id] ?? 0 })) });
});

transactionsRouter.post('/suppliers', async (c) => {
  const user = c.var.user;
  if (!canManageSuppliers(user.role)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } }, 403);
  }
  const body = await c.req.json().catch(() => ({}));
  const result = await runInTransaction(c.var.db, (tx, events) =>
    new CreateSupplier({ repository: new DrizzleSupplierRepository(tx), events }).execute(body, buildContext(user)),
  );
  return sendResult(c, result);
});

transactionsRouter.put('/suppliers/:id', async (c) => {
  const user = c.var.user;
  if (!canManageSuppliers(user.role)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } }, 403);
  }
  const body = await c.req.json().catch(() => ({}));
  const result = await runInTransaction(c.var.db, (tx, events) =>
    new UpdateSupplier({ repository: new DrizzleSupplierRepository(tx), events }).execute({ ...body, id: c.req.param('id') }, buildContext(user)),
  );
  return sendResult(c, result);
});

transactionsRouter.delete('/suppliers/:id', async (c) => {
  const user = c.var.user;
  if (!canArchiveParty(user.role)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } }, 403);
  }
  const result = await runInTransaction(c.var.db, (tx, events) =>
    new UpdateSupplier({ repository: new DrizzleSupplierRepository(tx), events }).execute({ id: c.req.param('id'), isActive: false }, buildContext(user)),
  );
  return sendResult(c, result);
});

transactionsRouter.get('/suppliers/:id/ledger', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  const supplierId = c.req.param('id');
  const supplier = await new DrizzleSupplierRepository(db).findById(supplierId);
  if (!supplier || supplier.organizationId !== user.organizationId) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Supplier not found' } }, 404);
  }
  const list = await db
    .select({
      id: schema.supplierTransactions.id,
      transactionType: schema.supplierTransactions.transactionType,
      amount: schema.supplierTransactions.amount,
      paidFrom: schema.supplierTransactions.paidFrom,
      notes: schema.supplierTransactions.notes,
      createdAt: schema.supplierTransactions.createdAt,
      shiftId: schema.supplierTransactions.shiftId,
      businessDate: schema.businessDays.businessDate,
    })
    .from(schema.supplierTransactions)
    .innerJoin(schema.businessDays, eq(schema.supplierTransactions.businessDayId, schema.businessDays.id))
    .where(eq(schema.supplierTransactions.supplierId, supplierId))
    .orderBy(schema.supplierTransactions.createdAt);
  return c.json({ success: true, data: list });
});

// ====================================================
// MASTER DATA — Customers
// ====================================================

transactionsRouter.get('/customers', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  const activeOnly = c.req.query('activeOnly') !== 'false';

  // Receivable = Σ credit sales/adjustments − Σ collections, scoped via business_days.
  // Aggregated in SQL (one row per customer) + run alongside the list query.
  const [list, balanceRows] = await Promise.all([
    new DrizzleCustomerRepository(db).listByOrganization(user.organizationId, activeOnly),
    db
      .select({
        customerId: schema.customerTransactions.customerId,
        balance: sql<string>`COALESCE(SUM(CASE WHEN ${schema.customerTransactions.transactionType} = 'Collection' THEN -${schema.customerTransactions.amount} ELSE ${schema.customerTransactions.amount} END), 0)`,
      })
      .from(schema.customerTransactions)
      .innerJoin(schema.businessDays, eq(schema.customerTransactions.businessDayId, schema.businessDays.id))
      .where(eq(schema.businessDays.organizationId, user.organizationId))
      .groupBy(schema.customerTransactions.customerId),
  ]);

  const balances: Record<string, number> = {};
  for (const r of balanceRows) balances[r.customerId] = Number(r.balance);
  return c.json({ success: true, data: list.map((cust) => ({ ...cust, currentBalance: balances[cust.id] ?? 0 })) });
});

transactionsRouter.post('/customers', async (c) => {
  const user = c.var.user;
  if (!canManageCustomers(user.role)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } }, 403);
  }
  const body = await c.req.json().catch(() => ({}));
  const result = await runInTransaction(c.var.db, (tx, events) =>
    new CreateCustomer({ repository: new DrizzleCustomerRepository(tx), events }).execute(body, buildContext(user)),
  );
  return sendResult(c, result);
});

transactionsRouter.put('/customers/:id', async (c) => {
  const user = c.var.user;
  if (!canManageCustomers(user.role)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } }, 403);
  }
  const body = await c.req.json().catch(() => ({}));
  const result = await runInTransaction(c.var.db, (tx, events) =>
    new UpdateCustomer({ repository: new DrizzleCustomerRepository(tx), events }).execute({ ...body, id: c.req.param('id') }, buildContext(user)),
  );
  return sendResult(c, result);
});

transactionsRouter.delete('/customers/:id', async (c) => {
  const user = c.var.user;
  if (!canArchiveParty(user.role)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } }, 403);
  }
  const result = await runInTransaction(c.var.db, (tx, events) =>
    new UpdateCustomer({ repository: new DrizzleCustomerRepository(tx), events }).execute({ id: c.req.param('id'), isActive: false }, buildContext(user)),
  );
  return sendResult(c, result);
});

transactionsRouter.get('/customers/:id/ledger', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  const customerId = c.req.param('id');
  const customer = await new DrizzleCustomerRepository(db).findById(customerId);
  if (!customer || customer.organizationId !== user.organizationId) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Customer not found' } }, 404);
  }
  const list = await db
    .select({
      id: schema.customerTransactions.id,
      transactionType: schema.customerTransactions.transactionType,
      amount: schema.customerTransactions.amount,
      notes: schema.customerTransactions.notes,
      createdAt: schema.customerTransactions.createdAt,
      shiftId: schema.customerTransactions.shiftId,
      businessDate: schema.businessDays.businessDate,
    })
    .from(schema.customerTransactions)
    .innerJoin(schema.businessDays, eq(schema.customerTransactions.businessDayId, schema.businessDays.id))
    .where(eq(schema.customerTransactions.customerId, customerId))
    .orderBy(schema.customerTransactions.createdAt);
  return c.json({ success: true, data: list });
});

// ====================================================
// MASTER DATA — Vehicles
// ====================================================

transactionsRouter.get('/customers/:id/vehicles', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  const customerId = c.req.param('id');
  const activeOnly = c.req.query('activeOnly') !== 'false';
  const customer = await new DrizzleCustomerRepository(db).findById(customerId);
  if (!customer || customer.organizationId !== user.organizationId) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Customer not found' } }, 404);
  }
  const rows = await db
    .select({
      id: schema.customerVehicles.id,
      organizationId: schema.customerVehicles.organizationId,
      customerId: schema.customerVehicles.customerId,
      registrationNumber: schema.customerVehicles.registrationNumber,
      vehicleType: schema.customerVehicles.vehicleType,
      defaultProductId: schema.customerVehicles.defaultProductId,
      isActive: schema.customerVehicles.isActive,
      createdAt: schema.customerVehicles.createdAt,
      updatedAt: schema.customerVehicles.updatedAt,
      defaultProductName: schema.products.name,
      defaultProductCode: schema.products.code,
    })
    .from(schema.customerVehicles)
    .leftJoin(schema.products, eq(schema.customerVehicles.defaultProductId, schema.products.id))
    .where(
      and(
        eq(schema.customerVehicles.customerId, customerId),
        eq(schema.customerVehicles.organizationId, user.organizationId),
        ...(activeOnly ? [eq(schema.customerVehicles.isActive, true)] : []),
      ),
    )
    .orderBy(desc(schema.customerVehicles.updatedAt));
  return c.json({ success: true, data: rows });
});

transactionsRouter.post('/customers/:id/vehicles', async (c) => {
  const user = c.var.user;
  if (!canManageCustomers(user.role)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } }, 403);
  }
  const body = await c.req.json().catch(() => ({}));
  const result = await runInTransaction(c.var.db, (tx, events) =>
    new AddVehicle({
      repository: new DrizzleVehicleRepository(tx),
      customers: new DrizzleCustomerRepository(tx),
      events,
    }).execute({ ...body, customerId: c.req.param('id') }, buildContext(user)),
  );
  return sendResult(c, result);
});

transactionsRouter.put('/vehicles/:id', async (c) => {
  const user = c.var.user;
  if (!canManageCustomers(user.role)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } }, 403);
  }
  const body = await c.req.json().catch(() => ({}));
  const result = await runInTransaction(c.var.db, (tx, events) =>
    new UpdateVehicle({
      repository: new DrizzleVehicleRepository(tx),
      customers: new DrizzleCustomerRepository(tx),
      events,
    }).execute({ ...body, id: c.req.param('id') }, buildContext(user)),
  );
  return sendResult(c, result);
});

transactionsRouter.delete('/vehicles/:id', async (c) => {
  const user = c.var.user;
  if (!canArchiveParty(user.role)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } }, 403);
  }
  const result = await runInTransaction(c.var.db, (tx, events) =>
    new UpdateVehicle({
      repository: new DrizzleVehicleRepository(tx),
      customers: new DrizzleCustomerRepository(tx),
      events,
    }).execute({ id: c.req.param('id'), isActive: false }, buildContext(user)),
  );
  return sendResult(c, result);
});

transactionsRouter.get('/vehicles/search', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  const q = (c.req.query('q') || '').trim();
  const limit = Math.min(Number(c.req.query('limit') || 20), 50);
  if (q.length < 1) return c.json({ success: true, data: [] });
  const rows = await db
    .select({
      id: schema.customerVehicles.id,
      registrationNumber: schema.customerVehicles.registrationNumber,
      vehicleType: schema.customerVehicles.vehicleType,
      defaultProductId: schema.customerVehicles.defaultProductId,
      customerId: schema.customerVehicles.customerId,
      customerName: schema.customers.name,
      customerType: schema.customers.customerType,
      isPrepaid: schema.customers.isPrepaid,
      creditLimit: schema.customers.creditLimit,
      defaultProductName: schema.products.name,
      defaultProductCode: schema.products.code,
      defaultProductUnit: schema.products.unit,
    })
    .from(schema.customerVehicles)
    .innerJoin(schema.customers, eq(schema.customerVehicles.customerId, schema.customers.id))
    .leftJoin(schema.products, eq(schema.customerVehicles.defaultProductId, schema.products.id))
    .where(
      and(
        eq(schema.customerVehicles.organizationId, user.organizationId),
        eq(schema.customerVehicles.isActive, true),
        eq(schema.customers.isActive, true),
        ilike(schema.customerVehicles.registrationNumber, `%${q}%`),
      ),
    )
    .orderBy(
      sql`CASE WHEN ${schema.customerVehicles.registrationNumber} ILIKE ${q + '%'} THEN 0 ELSE 1 END`,
      desc(schema.customerVehicles.updatedAt),
    )
    .limit(limit);
  return c.json({ success: true, data: rows });
});

// ====================================================
// EXPENSE CATEGORIES
// ====================================================

transactionsRouter.get('/expense-categories', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  let list = await db.select().from(schema.expenseCategories).where(eq(schema.expenseCategories.organizationId, user.organizationId));
  if (list.length === 0) {
    await db
      .insert(schema.expenseCategories)
      .values(DEFAULT_EXPENSE_CATEGORIES.map((name) => ({ organizationId: user.organizationId, name, isSystem: true })))
      .onConflictDoNothing();
    list = await db.select().from(schema.expenseCategories).where(eq(schema.expenseCategories.organizationId, user.organizationId));
  }
  return c.json({ success: true, data: list });
});

// ====================================================
// OPERATIONAL TRANSACTIONS (write via use-cases)
// ====================================================

transactionsRouter.post('/expenses', async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => ({}));
  const clock = await loadStationClock(c.var.db, body?.stationId);
  const result = await runInTransaction(c.var.db, (tx, events) =>
    new RecordExpense({
      expenses: new DrizzleExpenseRepository(tx),
      shifts: new DrizzleShiftRepository(tx),
      businessDays: new DrizzleBusinessDayRepository(tx),
      events,
    }).execute(body, buildContext(user, { stationId: body?.stationId, ...clock })),
  );
  return sendResult(c, result);
});

transactionsRouter.post('/collections', async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => ({}));
  const clock = await loadStationClock(c.var.db, body?.stationId);
  // A "Credit" collection is a credit SALE (a receivable), not a payment. It is
  // recorded on the customer ledger with no drawer/stock impact.
  if (body?.paymentMethod === 'Credit') {
    const result = await runInTransaction(c.var.db, (tx, events) =>
      new RecordCreditSale({
        ledger: new DrizzleCustomerLedgerRepository(tx),
        customers: new DrizzleCustomerRepository(tx),
        shifts: new DrizzleShiftRepository(tx),
        businessDays: new DrizzleBusinessDayRepository(tx),
        events,
      }).execute(body, buildContext(user, { stationId: body?.stationId, ...clock })),
    );
    return sendResult(c, result);
  }
  const result = await runInTransaction(c.var.db, (tx, events) =>
    new RecordCollection({
      collections: new DrizzleCollectionRepository(tx),
      ledger: new DrizzleCustomerLedgerRepository(tx),
      customers: new DrizzleCustomerRepository(tx),
      shifts: new DrizzleShiftRepository(tx),
      businessDays: new DrizzleBusinessDayRepository(tx),
      docNumbers,
      events,
    }).execute(body, buildContext(user, { stationId: body?.stationId, ...clock })),
  );
  return sendResult(c, result);
});

// Void a credit fuel sale (correction while the shift is still open). The
// receivable is removed; allowed only before the originating shift closes.
transactionsRouter.delete('/credit-sales/:id', async (c) => {
  const user = c.var.user;
  const id = c.req.param('id');
  const result = await runInTransaction(c.var.db, (tx, events) =>
    new VoidCreditSale({
      ledger: new DrizzleCustomerLedgerRepository(tx),
      shifts: new DrizzleShiftRepository(tx),
      events,
    }).execute({ id }, buildContext(user)),
  );
  return sendResult(c, result);
});

transactionsRouter.post('/purchases', async (c) => {
  const user = c.var.user;
  if (!canRecordPurchase(user.role)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions to record purchases' } }, 403);
  }
  const body = await c.req.json().catch(() => ({}));
  const clock = await loadStationClock(c.var.db, body?.stationId);
  const result = await runInTransaction(c.var.db, (tx, events) =>
    new RecordPurchase({
      purchases: new DrizzlePurchaseRepository(tx),
      purchaseItems: new DrizzlePurchaseItemRepository(tx),
      stock: new DrizzleStockMovementRepository(tx),
      supplierTxns: new DrizzleSupplierTransactionRepository(tx),
      suppliers: new DrizzleSupplierRepository(tx),
      products: new DrizzleProductRepository(tx),
      stations: new DrizzleStationRepository(tx),
      shifts: new DrizzleShiftRepository(tx),
      businessDays: new DrizzleBusinessDayRepository(tx),
      docNumbers,
      events,
    }).execute(body, buildContext(user, { stationId: body?.stationId, ...clock })),
  );
  return sendResult(c, result);
});

transactionsRouter.post('/supplier-payments', async (c) => {
  const user = c.var.user;
  if (!canRecordPurchase(user.role)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions to record supplier payments' } }, 403);
  }
  const body = await c.req.json().catch(() => ({}));
  const clock = await loadStationClock(c.var.db, body?.stationId);
  const result = await runInTransaction(c.var.db, (tx, events) =>
    new RecordSupplierPayment({
      supplierTxns: new DrizzleSupplierTransactionRepository(tx),
      suppliers: new DrizzleSupplierRepository(tx),
      shifts: new DrizzleShiftRepository(tx),
      businessDays: new DrizzleBusinessDayRepository(tx),
      events,
    }).execute(body, buildContext(user, { stationId: body?.stationId, ...clock })),
  );
  return sendResult(c, result);
});

transactionsRouter.post('/sales', async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => ({}));
  const result = await runInTransaction(c.var.db, (tx, events) =>
    new CreateSale({
      sales: new DrizzleSaleRepository(tx),
      stock: new DrizzleStockMovementRepository(tx),
      ledger: new DrizzleCustomerLedgerRepository(tx),
      customers: new DrizzleCustomerRepository(tx),
      shifts: new DrizzleShiftRepository(tx),
      docNumbers,
      events,
    }).execute(body, buildContext(user)),
  );
  return sendResult(c, result);
});

// ====================================================
// TRANSACTION READ PROJECTIONS
// ====================================================

transactionsRouter.get('/expenses', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  const rows = await db
    .select({
      expense: schema.expenses,
      businessDate: schema.businessDays.businessDate,
      categoryName: schema.expenseCategories.name,
    })
    .from(schema.expenses)
    .innerJoin(schema.businessDays, eq(schema.expenses.businessDayId, schema.businessDays.id))
    .leftJoin(schema.expenseCategories, eq(schema.expenses.categoryId, schema.expenseCategories.id))
    .where(eq(schema.businessDays.organizationId, user.organizationId))
    .orderBy(desc(schema.expenses.createdAt));
  return c.json({ success: true, data: rows.map((r) => ({ ...r.expense, businessDate: r.businessDate, categoryName: r.categoryName ?? 'General' })) });
});

transactionsRouter.get('/purchases', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  const rows = await db
    .select({
      purchase: schema.purchases,
      businessDate: schema.businessDays.businessDate,
      supplierName: schema.suppliers.name,
    })
    .from(schema.purchases)
    .innerJoin(schema.businessDays, eq(schema.purchases.businessDayId, schema.businessDays.id))
    .leftJoin(schema.suppliers, eq(schema.purchases.supplierId, schema.suppliers.id))
    .where(eq(schema.businessDays.organizationId, user.organizationId))
    .orderBy(desc(schema.purchases.createdAt));
  return c.json({ success: true, data: rows.map((r) => ({ ...r.purchase, businessDate: r.businessDate, supplierName: r.supplierName ?? 'Unknown Supplier' })) });
});

transactionsRouter.get('/purchases/:id/items', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  const purchaseId = c.req.param('id');
  const rows = await db
    .select({
      item: schema.purchaseItems,
      productName: schema.products.name,
      productCode: schema.products.code,
      unit: schema.products.unit,
    })
    .from(schema.purchaseItems)
    .innerJoin(schema.purchases, eq(schema.purchaseItems.purchaseId, schema.purchases.id))
    .innerJoin(schema.businessDays, eq(schema.purchases.businessDayId, schema.businessDays.id))
    .leftJoin(schema.products, eq(schema.purchaseItems.productId, schema.products.id))
    .where(and(eq(schema.purchaseItems.purchaseId, purchaseId), eq(schema.businessDays.organizationId, user.organizationId)))
    .orderBy(schema.purchaseItems.createdAt);
  return c.json({ success: true, data: rows.map((r) => ({ ...r.item, productName: r.productName ?? 'Product', productCode: r.productCode ?? null, unit: r.unit ?? null })) });
});

// GST input-tax-credit (ITC) register: GST purchase lines over a date range.
// Fuel (VAT) and exempt lines carry no input credit and are excluded.
transactionsRouter.get('/purchases/gst-register', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  const from = c.req.query('from');
  const to = c.req.query('to');
  const conds = [eq(schema.businessDays.organizationId, user.organizationId), eq(schema.purchaseItems.taxCategory, 'GST')];
  if (from) conds.push(gte(schema.businessDays.businessDate, from));
  if (to) conds.push(lte(schema.businessDays.businessDate, to));
  const rows = await db
    .select({
      item: schema.purchaseItems,
      businessDate: schema.businessDays.businessDate,
      supplierName: schema.suppliers.name,
      supplierGstin: schema.suppliers.metadata,
      invoiceNumber: schema.purchases.invoiceNumber,
      documentNumber: schema.purchases.documentNumber,
      productName: schema.products.name,
      productCode: schema.products.code,
    })
    .from(schema.purchaseItems)
    .innerJoin(schema.purchases, eq(schema.purchaseItems.purchaseId, schema.purchases.id))
    .innerJoin(schema.businessDays, eq(schema.purchases.businessDayId, schema.businessDays.id))
    .leftJoin(schema.suppliers, eq(schema.purchases.supplierId, schema.suppliers.id))
    .leftJoin(schema.products, eq(schema.purchaseItems.productId, schema.products.id))
    .where(and(...conds))
    .orderBy(desc(schema.businessDays.businessDate));
  const data = rows.map((r) => ({
    ...r.item,
    businessDate: r.businessDate,
    supplierName: r.supplierName ?? 'Unknown Supplier',
    supplierGstin: (r.supplierGstin as Record<string, unknown> | null)?.gstin ?? null,
    invoiceNumber: r.invoiceNumber,
    documentNumber: r.documentNumber,
    productName: r.productName ?? 'Product',
    productCode: r.productCode ?? null,
  }));
  return c.json({ success: true, data });
});

transactionsRouter.get('/collections', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  const rows = await db
    .select({
      collection: schema.collections,
      businessDate: schema.businessDays.businessDate,
      customerName: schema.customers.name,
    })
    .from(schema.collections)
    .innerJoin(schema.businessDays, eq(schema.collections.businessDayId, schema.businessDays.id))
    .leftJoin(schema.customers, eq(schema.collections.customerId, schema.customers.id))
    .where(eq(schema.businessDays.organizationId, user.organizationId))
    .orderBy(desc(schema.collections.createdAt));
  return c.json({ success: true, data: rows.map((r) => ({ ...r.collection, businessDate: r.businessDate, customerName: r.customerName ?? 'Walk-in Customer' })) });
});

transactionsRouter.get('/shifts/:id/transactions', async (c) => {
  const db = c.var.db;
  const shiftId = c.req.param('id');
  const [expenses, purchases, collections, sales, creditSales] = await Promise.all([
    db.select().from(schema.expenses).where(eq(schema.expenses.shiftId, shiftId)),
    db.select().from(schema.purchases).where(eq(schema.purchases.shiftId, shiftId)),
    db.select().from(schema.collections).where(eq(schema.collections.shiftId, shiftId)),
    db.select().from(schema.sales).where(eq(schema.sales.shiftId, shiftId)),
    // Stage B fuel-on-credit sales live in customer_transactions (a receivable),
    // not the collections table — surface them so totals/reconciliation/summary see them.
    db
      .select({
        id: schema.customerTransactions.id,
        transactionType: schema.customerTransactions.transactionType,
        amount: schema.customerTransactions.amount,
        quantity: schema.customerTransactions.quantity,
        unitPrice: schema.customerTransactions.unitPrice,
        notes: schema.customerTransactions.notes,
        createdAt: schema.customerTransactions.createdAt,
        shiftId: schema.customerTransactions.shiftId,
        duId: schema.customerTransactions.duId,
        attendantId: schema.customerTransactions.attendantId,
        customerId: schema.customerTransactions.customerId,
        vehicleId: schema.customerTransactions.vehicleId,
        productId: schema.customerTransactions.productId,
        customerName: schema.customers.name,
        productName: schema.products.name,
        productCode: schema.products.code,
        vehicleNumber: schema.customerVehicles.registrationNumber,
      })
      .from(schema.customerTransactions)
      .leftJoin(schema.customers, eq(schema.customers.id, schema.customerTransactions.customerId))
      .leftJoin(schema.products, eq(schema.products.id, schema.customerTransactions.productId))
      .leftJoin(schema.customerVehicles, eq(schema.customerVehicles.id, schema.customerTransactions.vehicleId))
      .where(
        and(
          eq(schema.customerTransactions.shiftId, shiftId),
          eq(schema.customerTransactions.transactionType, 'Credit Sale'),
          eq(schema.customerTransactions.referenceType, 'CREDIT_SALE'),
        ),
      ),
  ]);
  return c.json({ success: true, data: { expenses, purchases, collections, sales, creditSales } });
});

// ====================================================
// INVENTORY READ PROJECTIONS (business-day anchored)
// ====================================================

transactionsRouter.get('/inventory/status', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  const stationId = c.req.query('stationId');
  if (!stationId) return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Missing stationId' } }, 400);
  if (!isAuthorizedForStation(user, { organizationId: user.organizationId, stationId })) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this station' } }, 403);
  }
  // Single query: per-tank current volume (Σ stock movements) + product info.
  // Replaces the previous 1 + 2N round-trips (per-tank product + aggregate).
  const rows = await db
    .select({
      id: schema.tanks.id,
      name: schema.tanks.name,
      productId: schema.tanks.productId,
      capacity: schema.tanks.capacity,
      productName: schema.products.name,
      productCode: schema.products.code,
      total: sql<string>`COALESCE(SUM(${schema.stockMovements.quantity}), 0)`,
    })
    .from(schema.tanks)
    .leftJoin(schema.products, eq(schema.products.id, schema.tanks.productId))
    .leftJoin(schema.stockMovements, eq(schema.stockMovements.tankId, schema.tanks.id))
    .where(and(eq(schema.tanks.stationId, stationId), eq(schema.tanks.organizationId, user.organizationId)))
    .groupBy(schema.tanks.id, schema.products.name, schema.products.code);

  const enriched = rows.map((r) => ({
    id: r.id,
    name: r.name,
    productId: r.productId,
    productName: r.productName ?? 'Unknown',
    productCode: r.productCode ?? 'Unknown',
    capacity: Number(r.capacity),
    currentVolume: Math.max(0, Number(r.total ?? 0)),
  }));
  return c.json({ success: true, data: enriched });
});

transactionsRouter.get('/inventory/items', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  const stationId = c.req.query('stationId');
  if (!stationId) return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Missing stationId' } }, 400);
  if (!isAuthorizedForStation(user, { organizationId: user.organizationId, stationId })) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this station' } }, 403);
  }
  // Merchandise (non-fuel) stock-on-hand. Item products are org-scoped (no tank);
  // quantity = sum of all stock movements for the product (tankId is null for items).
  const rows = await db
    .select({
      productId: schema.products.id,
      name: schema.products.name,
      code: schema.products.code,
      unit: schema.products.unit,
      productType: schema.products.productType,
      quantity: sql<string>`COALESCE((SELECT SUM(sm.quantity) FROM stock_movements sm WHERE sm.product_id = "products"."id"), 0)`,
    })
    .from(schema.products)
    .where(
      and(
        eq(schema.products.organizationId, user.organizationId),
        eq(schema.products.inventoryType, 'ITEM'),
        eq(schema.products.isActive, true),
      ),
    );
  return c.json({
    success: true,
    data: rows.map((r) => ({ ...r, quantity: Number(r.quantity) })),
  });
});

// POST /inventory/count — physical stock count / opening balance / adjustment.
// Reconciles book stock to the measured actual (tankId for fuel, productId for items).
transactionsRouter.post('/inventory/count', async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => ({}));
  if (!isAuthorizedForStation(user, { organizationId: user.organizationId, stationId: body?.stationId })) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this station' } }, 403);
  }
  const stockClock = await loadStationClock(c.var.db, body?.stationId);
  const result = await runInTransaction(c.var.db, (tx, events) =>
    new RecordStockCount({
      movements: new DrizzleStockMovementRepository(tx),
      variances: new DrizzleStockVarianceRepository(tx),
      businessDays: new DrizzleBusinessDayRepository(tx),
      events,
    }).execute(body, buildContext(user, { stationId: body?.stationId, ...stockClock })),
  );
  return sendResult(c, result);
});

transactionsRouter.get('/inventory/movements', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  const stationId = c.req.query('stationId');
  if (!stationId) return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Missing stationId' } }, 400);
  if (!isAuthorizedForStation(user, { organizationId: user.organizationId, stationId })) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this station' } }, 403);
  }
  const rows = await db
    .select({
      movement: schema.stockMovements,
      businessDate: schema.businessDays.businessDate,
      tankName: schema.tanks.name,
      productName: schema.products.name,
      productCode: schema.products.code,
      productUnit: schema.products.unit,
    })
    .from(schema.stockMovements)
    .innerJoin(schema.businessDays, eq(schema.stockMovements.businessDayId, schema.businessDays.id))
    .leftJoin(schema.tanks, eq(schema.stockMovements.tankId, schema.tanks.id))
    .leftJoin(schema.products, eq(schema.stockMovements.productId, schema.products.id))
    .where(and(eq(schema.businessDays.stationId, stationId), eq(schema.businessDays.organizationId, user.organizationId)))
    .orderBy(desc(schema.stockMovements.createdAt));
  return c.json({
    success: true,
    data: rows.map((r) => ({
      ...r.movement,
      quantity: Number(r.movement.quantity),
      businessDate: r.businessDate,
      tankName: r.tankName ?? null,
      productName: r.productName ?? 'Unknown',
      productCode: r.productCode ?? 'Unknown',
      productUnit: r.productUnit ?? null,
    })),
  });
});

transactionsRouter.get('/inventory/variances', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  const stationId = c.req.query('stationId');
  if (!stationId) return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Missing stationId' } }, 400);
  if (!isAuthorizedForStation(user, { organizationId: user.organizationId, stationId })) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this station' } }, 403);
  }
  const rows = await db
    .select({
      variance: schema.stockVariances,
      businessDate: schema.businessDays.businessDate,
      tankName: schema.tanks.name,
      productName: schema.products.name,
      productCode: schema.products.code,
      productUnit: schema.products.unit,
    })
    .from(schema.stockVariances)
    .innerJoin(schema.businessDays, eq(schema.stockVariances.businessDayId, schema.businessDays.id))
    .leftJoin(schema.tanks, eq(schema.stockVariances.tankId, schema.tanks.id))
    .leftJoin(schema.products, eq(schema.stockVariances.productId, schema.products.id))
    .where(and(eq(schema.businessDays.stationId, stationId), eq(schema.businessDays.organizationId, user.organizationId)))
    .orderBy(desc(schema.stockVariances.createdAt));
  return c.json({
    success: true,
    data: rows.map((r) => ({
      ...r.variance,
      expectedQuantity: Number(r.variance.expectedQuantity),
      actualQuantity: Number(r.variance.actualQuantity),
      varianceQuantity: Number(r.variance.varianceQuantity),
      businessDate: r.businessDate,
      tankName: r.tankName ?? null,
      productName: r.productName ?? 'Unknown',
      productCode: r.productCode ?? 'Unknown',
      productUnit: r.productUnit ?? null,
    })),
  });
});
