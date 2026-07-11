import { Hono } from 'hono';
import { and, desc, eq, gte, ilike, inArray, lt, lte, ne, sql } from 'drizzle-orm';
import { schema, type DbClient } from '@pump/db';
import {
  isAuthorizedForStation,
  canManageCustomers,
  canManageSuppliers,
  canArchiveParty,
  canRecordPurchase,
  canManageExpenseCategory,
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
  GenerateInvoice,
  RecordMerchandiseHandover,
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
import { DrizzleSaleRepository, DrizzleMerchandiseHandoverRepository } from '../infra/repositories/retail-repositories.js';
import { DrizzleInvoiceRepository, DrizzleDocumentSequenceRepository } from '../infra/repositories/invoicing-repositories.js';
import { DrizzleProductRepository } from '../infra/repositories/product.repo.js';
import { DrizzleStationRepository } from '../infra/repositories/setup-repositories.js';
import { LedgerPostingService } from '../infra/ledger-posting.js';
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
  // TODO (ledger scaling): this returns the supplier's ALL-TIME transactions and
  // the client computes the period opening + in-range rows. Bounded per single
  // supplier, so fine for now. When a supplier's history grows large, mirror the
  // account-statement pattern: accept from/to, return
  // { periodOpeningBalance: Σ(debit − credit) WHERE businessDate < from, entries: in-range only }
  // and drop the client-side clampByDate/opening computation in UnifiedLedger.
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
  // TODO (ledger scaling): this returns the customer's ALL-TIME transactions and
  // the client computes the period opening + in-range rows. Bounded per single
  // customer, so fine for now. When a customer's history grows large, mirror the
  // account-statement pattern: accept from/to, return
  // { periodOpeningBalance: Σ(debit − credit) WHERE businessDate < from, entries: in-range only }
  // and drop the client-side clampByDate/opening computation in UnifiedLedger.
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

// GET /transactions/vehicles?activeOnly=  — all vehicles across the org, each
// with its owning customer + default product. Backs the Customers → Vehicles
// tab's "show all" view (filter client-side by customer / registration).
transactionsRouter.get('/vehicles', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  const activeOnly = c.req.query('activeOnly') === 'true';
  const rows = await db
    .select({
      id: schema.customerVehicles.id,
      organizationId: schema.customerVehicles.organizationId,
      customerId: schema.customerVehicles.customerId,
      customerName: schema.customers.name,
      customerType: schema.customers.customerType,
      registrationNumber: schema.customerVehicles.registrationNumber,
      vehicleType: schema.customerVehicles.vehicleType,
      defaultProductId: schema.customerVehicles.defaultProductId,
      defaultProductName: schema.products.name,
      defaultProductCode: schema.products.code,
      isActive: schema.customerVehicles.isActive,
      createdAt: schema.customerVehicles.createdAt,
      updatedAt: schema.customerVehicles.updatedAt,
    })
    .from(schema.customerVehicles)
    .innerJoin(schema.customers, eq(schema.customerVehicles.customerId, schema.customers.id))
    .leftJoin(schema.products, eq(schema.customerVehicles.defaultProductId, schema.products.id))
    .where(
      and(
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

// Create a custom expense category (org-scoped, deduped by name).
transactionsRouter.post('/expense-categories', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  if (!canManageExpenseCategory(user.role)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } }, 403);
  }
  const body = await c.req.json().catch(() => ({}));
  const name = String(body?.name ?? '').trim();
  if (!name) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Category name is required' } }, 400);
  }
  if (name.length > 100) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Category name is too long (max 100)' } }, 400);
  }
  const [dupe] = await db
    .select({ id: schema.expenseCategories.id })
    .from(schema.expenseCategories)
    .where(and(eq(schema.expenseCategories.organizationId, user.organizationId), ilike(schema.expenseCategories.name, name)))
    .limit(1);
  if (dupe) {
    return c.json({ success: false, error: { code: 'CONFLICT', message: 'A category with this name already exists' } }, 409);
  }
  const [created] = await db
    .insert(schema.expenseCategories)
    .values({ organizationId: user.organizationId, name, isSystem: false })
    .returning();
  return c.json({ success: true, data: created });
});

// Rename a custom expense category. System (seeded) categories are read-only.
// TODO (archive): add an `is_active` column + PATCH to soft-delete categories
// (expenses reference categoryId, so hard delete isn't safe). Deferred for now.
transactionsRouter.put('/expense-categories/:id', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  if (!canManageExpenseCategory(user.role)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } }, 403);
  }
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const name = String(body?.name ?? '').trim();
  if (!name) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Category name is required' } }, 400);
  }
  if (name.length > 100) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Category name is too long (max 100)' } }, 400);
  }
  const [existing] = await db
    .select()
    .from(schema.expenseCategories)
    .where(and(eq(schema.expenseCategories.id, id), eq(schema.expenseCategories.organizationId, user.organizationId)))
    .limit(1);
  if (!existing) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Category not found' } }, 404);
  }
  if (existing.isSystem) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'System categories cannot be renamed' } }, 403);
  }
  const [dupe] = await db
    .select({ id: schema.expenseCategories.id })
    .from(schema.expenseCategories)
    .where(and(eq(schema.expenseCategories.organizationId, user.organizationId), ilike(schema.expenseCategories.name, name), ne(schema.expenseCategories.id, id)))
    .limit(1);
  if (dupe) {
    return c.json({ success: false, error: { code: 'CONFLICT', message: 'A category with this name already exists' } }, 409);
  }
  const [updated] = await db
    .update(schema.expenseCategories)
    .set({ name })
    .where(and(eq(schema.expenseCategories.id, id), eq(schema.expenseCategories.organizationId, user.organizationId)))
    .returning();
  return c.json({ success: true, data: updated });
});

// ====================================================
// OPERATIONAL TRANSACTIONS (write via use-cases)
// ====================================================

transactionsRouter.post('/expenses', async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => ({}));
  const clock = await loadStationClock(c.var.db, body?.stationId);
  const result = await runInTransaction(c.var.db, async (tx, events) => {
    // When a specific pay-from account is chosen, derive paidFrom/affectsDrawer
    // from its type so drawer reconciliation stays correct (only the shift's
    // Cash-in-Hand affects the drawer; petty cash / bank / owner do not).
    if (body?.accountId) {
      const [acc] = await tx
        .select({ t: schema.financialAccounts.accountType })
        .from(schema.financialAccounts)
        .where(and(eq(schema.financialAccounts.id, body.accountId), eq(schema.financialAccounts.organizationId, user.organizationId)))
        .limit(1);
      const t = acc?.t;
      if (t === 'BANK') { body.paidFrom = 'BANK'; body.affectsDrawer = false; }
      else if (t === 'OWNER') { body.paidFrom = 'OWNER'; body.affectsDrawer = false; }
      else if (t === 'PETTY_CASH') { body.paidFrom = 'SHIFT_CASH'; body.affectsDrawer = false; }
      else if (t === 'CASH_IN_HAND') { body.paidFrom = 'SHIFT_CASH'; }
    }
    const r = await new RecordExpense({
      expenses: new DrizzleExpenseRepository(tx),
      shifts: new DrizzleShiftRepository(tx),
      businessDays: new DrizzleBusinessDayRepository(tx),
      events,
    }).execute(body, buildContext(user, { stationId: body?.stationId, ...clock }));
    if (r.success) await new LedgerPostingService(tx).postExpense(user.organizationId, r.data, body?.accountId);
    return r;
  });
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
  const result = await runInTransaction(c.var.db, async (tx, events) => {
    const r = await new RecordCollection({
      collections: new DrizzleCollectionRepository(tx),
      ledger: new DrizzleCustomerLedgerRepository(tx),
      customers: new DrizzleCustomerRepository(tx),
      shifts: new DrizzleShiftRepository(tx),
      businessDays: new DrizzleBusinessDayRepository(tx),
      docNumbers,
      events,
    }).execute(body, buildContext(user, { stationId: body?.stationId, ...clock }));
    if (r.success) await new LedgerPostingService(tx).postCollection(user.organizationId, r.data, body?.accountId);
    return r;
  });
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
  const result = await runInTransaction(c.var.db, async (tx, events) => {
    const ctx = buildContext(user, { stationId: body?.stationId, ...clock });
    const r = await new RecordPurchase({
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
    }).execute(body, ctx);

    // Optional "pay now" — record a supplier payment atomically with the
    // purchase (partial allowed). Same funding-account → paidFrom derivation as
    // the standalone /supplier-payments route; both commit or roll back together.
    if (r.success && body?.payment && Number(body.payment.amount) > 0) {
      const accountId = body.payment.accountId || undefined;
      const paymentBody: any = {
        supplierId: body.supplierId,
        amount: Number(body.payment.amount),
        stationId: body?.stationId,
        transactionDate: body?.transactionDate,
        shiftId: body?.shiftId,
        notes: body?.payment?.notes,
      };
      if (accountId) {
        const [acc] = await tx
          .select({ t: schema.financialAccounts.accountType })
          .from(schema.financialAccounts)
          .where(and(eq(schema.financialAccounts.id, accountId), eq(schema.financialAccounts.organizationId, user.organizationId)))
          .limit(1);
        const t = acc?.t;
        if (t === 'BANK') { paymentBody.paidFrom = 'BANK'; paymentBody.affectsDrawer = false; }
        else if (t === 'OWNER') { paymentBody.paidFrom = 'OWNER'; paymentBody.affectsDrawer = false; }
        else if (t === 'PETTY_CASH') { paymentBody.paidFrom = 'SHIFT_CASH'; paymentBody.affectsDrawer = false; }
        else if (t === 'CASH_IN_HAND') { paymentBody.paidFrom = 'SHIFT_CASH'; }
      }
      const pr = await new RecordSupplierPayment({
        supplierTxns: new DrizzleSupplierTransactionRepository(tx),
        suppliers: new DrizzleSupplierRepository(tx),
        shifts: new DrizzleShiftRepository(tx),
        businessDays: new DrizzleBusinessDayRepository(tx),
        events,
      }).execute(paymentBody, ctx);
      if (!pr.success) return pr; // roll the whole purchase back
      await new LedgerPostingService(tx).postSupplierPayment(user.organizationId, pr.data, accountId);
    }

    return r;
  });
  return sendResult(c, result);
});

transactionsRouter.post('/supplier-payments', async (c) => {
  const user = c.var.user;
  if (!canRecordPurchase(user.role)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions to record supplier payments' } }, 403);
  }
  const body = await c.req.json().catch(() => ({}));
  const clock = await loadStationClock(c.var.db, body?.stationId);
  const result = await runInTransaction(c.var.db, async (tx, events) => {
    // Chosen pay-from account → derive paidFrom/affectsDrawer so drawer
    // reconciliation stays correct (only the shift Cash-in-Hand affects it).
    if (body?.accountId) {
      const [acc] = await tx
        .select({ t: schema.financialAccounts.accountType })
        .from(schema.financialAccounts)
        .where(and(eq(schema.financialAccounts.id, body.accountId), eq(schema.financialAccounts.organizationId, user.organizationId)))
        .limit(1);
      const t = acc?.t;
      if (t === 'BANK') { body.paidFrom = 'BANK'; body.affectsDrawer = false; }
      else if (t === 'OWNER') { body.paidFrom = 'OWNER'; body.affectsDrawer = false; }
      else if (t === 'PETTY_CASH') { body.paidFrom = 'SHIFT_CASH'; body.affectsDrawer = false; }
      else if (t === 'CASH_IN_HAND') { body.paidFrom = 'SHIFT_CASH'; }
    }
    const r = await new RecordSupplierPayment({
      supplierTxns: new DrizzleSupplierTransactionRepository(tx),
      suppliers: new DrizzleSupplierRepository(tx),
      shifts: new DrizzleShiftRepository(tx),
      businessDays: new DrizzleBusinessDayRepository(tx),
      events,
    }).execute(body, buildContext(user, { stationId: body?.stationId, ...clock }));
    if (r.success) await new LedgerPostingService(tx).postSupplierPayment(user.organizationId, r.data, body?.accountId);
    return r;
  });
  return sendResult(c, result);
});

transactionsRouter.post('/sales', async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => ({}));
  const rawBuyer = body.buyer && typeof body.buyer === 'object' ? body.buyer : null;
  const saveAsCustomer = !!body.saveAsCustomer;
  const result = await runInTransaction(c.var.db, async (tx, events) => {
    let customerId: string | null = body.customerId ?? null;
    let buyerDetails: { name: string; phone: string | null; gstin: string | null; stateCode: string | null } | null = null;

    // Ad-hoc walk-in buyer (no saved customer selected). Either save/dedup them
    // into the customer registry (link customerId) or stash bill-to on the sale.
    if (!customerId && rawBuyer && typeof rawBuyer.name === 'string' && rawBuyer.name.trim()) {
      const name = rawBuyer.name.trim();
      const phone = (typeof rawBuyer.phone === 'string' && rawBuyer.phone.trim()) || null;
      const gstin = (typeof rawBuyer.gstin === 'string' && rawBuyer.gstin.trim()) || null;
      const stateCode = (typeof rawBuyer.stateCode === 'string' && rawBuyer.stateCode.trim()) || null;
      if (saveAsCustomer) {
        const custRepo = new DrizzleCustomerRepository(tx);
        const digits = (v: string | null) => (v ? v.replace(/\D/g, '') : '');
        const existing = (await custRepo.listByOrganization(user.organizationId, false)).find((x) => {
          const md = (x.metadata as Record<string, any>) || {};
          if (gstin && md.gstin && String(md.gstin).toLowerCase() === gstin.toLowerCase()) return true;
          if (phone && x.phone && digits(x.phone) === digits(phone)) return true;
          return x.name.trim().toLowerCase() === name.toLowerCase();
        });
        if (existing) {
          customerId = existing.id;
        } else {
          const created = await new CreateCustomer({ repository: custRepo, events }).execute(
            { name, customerType: 'Regular', phone, metadata: { ...(gstin ? { gstin } : {}), ...(stateCode ? { stateCode } : {}) } },
            buildContext(user),
          );
          if (!created.success) return created;
          customerId = created.data.id;
        }
      } else {
        buyerDetails = { name, phone, gstin, stateCode };
      }
    }

    return new CreateSale({
      sales: new DrizzleSaleRepository(tx),
      stock: new DrizzleStockMovementRepository(tx),
      ledger: new DrizzleCustomerLedgerRepository(tx),
      customers: new DrizzleCustomerRepository(tx),
      shifts: new DrizzleShiftRepository(tx),
      docNumbers,
      events,
    }).execute({ ...body, customerId, buyerDetails }, buildContext(user));
  });
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
      // Comma-joined distinct product names on the invoice — a quick "what was
      // bought" hint for the list, without fetching each purchase's line items.
      itemsSummary: sql<string | null>`(
        SELECT string_agg(DISTINCT pr.name, ', ')
        FROM purchase_items pi
        LEFT JOIN products pr ON pr.id = pi.product_id
        WHERE pi.purchase_id = ${schema.purchases.id}
      )`,
      itemCount: sql<number>`(
        SELECT COUNT(*)::int FROM purchase_items pi WHERE pi.purchase_id = ${schema.purchases.id}
      )`,
    })
    .from(schema.purchases)
    .innerJoin(schema.businessDays, eq(schema.purchases.businessDayId, schema.businessDays.id))
    .leftJoin(schema.suppliers, eq(schema.purchases.supplierId, schema.suppliers.id))
    .where(eq(schema.businessDays.organizationId, user.organizationId))
    .orderBy(desc(schema.purchases.createdAt));
  return c.json({ success: true, data: rows.map((r) => ({ ...r.purchase, businessDate: r.businessDate, supplierName: r.supplierName ?? 'Unknown Supplier', itemsSummary: r.itemsSummary, itemCount: Number(r.itemCount || 0) })) });
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

// GET /transactions/credit-sales — org-wide credit-sale ledger debits (fuel-on-
// credit + merchandise on credit), each with customer / product / vehicle. Backs
// the Customers → Sales tab. Credit sales are receivables (never touch the drawer).
transactionsRouter.get('/credit-sales', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  const rows = await db
    .select({
      id: schema.customerTransactions.id,
      customerId: schema.customerTransactions.customerId,
      customerName: schema.customers.name,
      customerType: schema.customers.customerType,
      amount: schema.customerTransactions.amount,
      quantity: schema.customerTransactions.quantity,
      unitPrice: schema.customerTransactions.unitPrice,
      notes: schema.customerTransactions.notes,
      shiftId: schema.customerTransactions.shiftId,
      createdAt: schema.customerTransactions.createdAt,
      businessDate: schema.businessDays.businessDate,
      productName: schema.products.name,
      productCode: schema.products.code,
      vehicleReg: schema.customerVehicles.registrationNumber,
    })
    .from(schema.customerTransactions)
    .innerJoin(schema.businessDays, eq(schema.customerTransactions.businessDayId, schema.businessDays.id))
    .leftJoin(schema.customers, eq(schema.customerTransactions.customerId, schema.customers.id))
    .leftJoin(schema.products, eq(schema.customerTransactions.productId, schema.products.id))
    .leftJoin(schema.customerVehicles, eq(schema.customerTransactions.vehicleId, schema.customerVehicles.id))
    .where(
      and(
        eq(schema.businessDays.organizationId, user.organizationId),
        eq(schema.customerTransactions.transactionType, 'Credit Sale'),
      ),
    )
    .orderBy(desc(schema.customerTransactions.createdAt));
  return c.json({ success: true, data: rows.map((r) => ({ ...r, customerName: r.customerName ?? 'Unknown Customer' })) });
});

// GET /transactions/money-movements?stationId=&from=&to=
// Money-account "payments & receipts" ledger (Phase L3/L6): discretely recorded
// money movements — collections IN, expenses OUT, supplier payments OUT —
// classified by the funding account (Cash / Bank / Owner). Cash & Bank drive the
// Cash & Bank ledger tab; Owner-funded rows drive the Owner ledger tab. Always
// EXCLUDES fuel/drawer sales (reconciled in the DSSR), so it never double-counts
// the authoritative shift/DSSR figures.
transactionsRouter.get('/money-movements', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  const stationId = c.req.query('stationId');
  const from = c.req.query('from');
  const to = c.req.query('to');
  if (!stationId) return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Missing stationId' } }, 400);
  if (!isAuthorizedForStation(user, { organizationId: user.organizationId, stationId })) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this station' } }, 403);
  }
  const dateConds = [
    eq(schema.businessDays.stationId, stationId),
    eq(schema.businessDays.organizationId, user.organizationId),
    ...(from ? [gte(schema.businessDays.businessDate, from)] : []),
    ...(to ? [lte(schema.businessDays.businessDate, to)] : []),
  ];

  const [collectionRows, expenseRows, paymentRows] = await Promise.all([
    db
      .select({ id: schema.collections.id, amount: schema.collections.amount, paymentMethod: schema.collections.paymentMethod, createdAt: schema.collections.createdAt, businessDate: schema.businessDays.businessDate, customerName: schema.customers.name })
      .from(schema.collections)
      .innerJoin(schema.businessDays, eq(schema.collections.businessDayId, schema.businessDays.id))
      .leftJoin(schema.customers, eq(schema.customers.id, schema.collections.customerId))
      .where(and(...dateConds)),
    db
      .select({ id: schema.expenses.id, amount: schema.expenses.amount, paidFrom: schema.expenses.paidFrom, description: schema.expenses.description, createdAt: schema.expenses.createdAt, businessDate: schema.businessDays.businessDate, categoryName: schema.expenseCategories.name })
      .from(schema.expenses)
      .innerJoin(schema.businessDays, eq(schema.expenses.businessDayId, schema.businessDays.id))
      .leftJoin(schema.expenseCategories, eq(schema.expenseCategories.id, schema.expenses.categoryId))
      .where(and(ne(schema.expenses.status, 'VOIDED'), ...dateConds)),
    db
      .select({ id: schema.supplierTransactions.id, amount: schema.supplierTransactions.amount, paidFrom: schema.supplierTransactions.paidFrom, notes: schema.supplierTransactions.notes, createdAt: schema.supplierTransactions.createdAt, businessDate: schema.businessDays.businessDate, supplierName: schema.suppliers.name })
      .from(schema.supplierTransactions)
      .innerJoin(schema.businessDays, eq(schema.supplierTransactions.businessDayId, schema.businessDays.id))
      .leftJoin(schema.suppliers, eq(schema.suppliers.id, schema.supplierTransactions.supplierId))
      .where(and(eq(schema.supplierTransactions.transactionType, 'Payment'), ...dateConds)),
  ]);

  const accountForPaidFrom = (pf: string): 'Cash' | 'Bank' | 'Owner' =>
    pf === 'SHIFT_CASH' ? 'Cash' : pf === 'OWNER' ? 'Owner' : 'Bank';

  type Movement = { id: string; date: string; createdAt: any; account: 'Cash' | 'Bank' | 'Owner'; direction: 'in' | 'out'; label: string; source: string; amount: number };
  const movements: Movement[] = [];

  for (const r of collectionRows) {
    movements.push({
      id: r.id,
      date: r.businessDate,
      createdAt: r.createdAt,
      account: r.paymentMethod === 'Cash' ? 'Cash' : 'Bank',
      direction: 'in',
      label: r.customerName ? `Collection · ${r.customerName}` : 'Collection',
      source: 'Collection',
      amount: Number(r.amount),
    });
  }
  for (const r of expenseRows) {
    const account = accountForPaidFrom(r.paidFrom);
    movements.push({ id: r.id, date: r.businessDate, createdAt: r.createdAt, account, direction: 'out', label: r.categoryName || r.description || 'Expense', source: 'Expense', amount: Number(r.amount) });
  }
  for (const r of paymentRows) {
    const account = accountForPaidFrom(r.paidFrom);
    movements.push({ id: r.id, date: r.businessDate, createdAt: r.createdAt, account, direction: 'out', label: r.supplierName ? `Payment · ${r.supplierName}` : 'Supplier payment', source: 'Supplier Payment', amount: Number(r.amount) });
  }

  movements.sort((a, b) => (b.date || '').localeCompare(a.date || '') || String(b.createdAt).localeCompare(String(a.createdAt)));

  // Per-account opening balance = signed net (collections in − expenses/payments
  // out) for business days strictly before `from`, so the ledger's running
  // balance carries the historical opening instead of restarting at zero.
  // Only computed when a range start is given.
  const openings: Array<{ account: 'Cash' | 'Bank' | 'Owner'; opening: number }> = [];
  if (from) {
    const priorConds = [
      eq(schema.businessDays.stationId, stationId),
      eq(schema.businessDays.organizationId, user.organizationId),
      lt(schema.businessDays.businessDate, from),
    ];
    const [priorCollections, priorExpenses, priorPayments] = await Promise.all([
      db
        .select({ paymentMethod: schema.collections.paymentMethod, total: sql<string>`COALESCE(SUM(${schema.collections.amount}), 0)` })
        .from(schema.collections)
        .innerJoin(schema.businessDays, eq(schema.collections.businessDayId, schema.businessDays.id))
        .where(and(...priorConds))
        .groupBy(schema.collections.paymentMethod),
      db
        .select({ paidFrom: schema.expenses.paidFrom, total: sql<string>`COALESCE(SUM(${schema.expenses.amount}), 0)` })
        .from(schema.expenses)
        .innerJoin(schema.businessDays, eq(schema.expenses.businessDayId, schema.businessDays.id))
        .where(and(ne(schema.expenses.status, 'VOIDED'), ...priorConds))
        .groupBy(schema.expenses.paidFrom),
      db
        .select({ paidFrom: schema.supplierTransactions.paidFrom, total: sql<string>`COALESCE(SUM(${schema.supplierTransactions.amount}), 0)` })
        .from(schema.supplierTransactions)
        .innerJoin(schema.businessDays, eq(schema.supplierTransactions.businessDayId, schema.businessDays.id))
        .where(and(eq(schema.supplierTransactions.transactionType, 'Payment'), ...priorConds))
        .groupBy(schema.supplierTransactions.paidFrom),
    ]);

    const openMap: Record<'Cash' | 'Bank' | 'Owner', number> = { Cash: 0, Bank: 0, Owner: 0 };
    for (const r of priorCollections) openMap[r.paymentMethod === 'Cash' ? 'Cash' : 'Bank'] += Number(r.total);
    for (const r of priorExpenses) openMap[accountForPaidFrom(r.paidFrom)] -= Number(r.total);
    for (const r of priorPayments) openMap[accountForPaidFrom(r.paidFrom)] -= Number(r.total);
    (['Cash', 'Bank', 'Owner'] as const).forEach((account) => openings.push({ account, opening: openMap[account] }));
  }

  return c.json({ success: true, data: { movements, openings } });
});

// ====================================================
// INVOICING — GST tax invoices (Phase T4)
// ====================================================

const INVOICE_ROLES = new Set<Role>(['Owner', 'Manager', 'Accountant']);

// POST /transactions/sales/:id/invoice — issue a GST tax invoice for a sale.
// Idempotent: if the sale was already invoiced, the existing invoice is returned.
transactionsRouter.post('/sales/:id/invoice', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  if (!INVOICE_ROLES.has(user.role)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } }, 403);
  }
  const saleId = c.req.param('id');

  const saleRows = await db
    .select({
      id: schema.sales.id,
      customerId: schema.sales.customerId,
      buyerDetails: schema.sales.buyerDetails,
      businessDayId: schema.sales.businessDayId,
      stationId: schema.businessDays.stationId,
      businessDate: schema.businessDays.businessDate,
      organizationId: schema.businessDays.organizationId,
    })
    .from(schema.sales)
    .innerJoin(schema.businessDays, eq(schema.sales.businessDayId, schema.businessDays.id))
    .where(eq(schema.sales.id, saleId))
    .limit(1);
  const sale = saleRows[0];
  if (!sale || sale.organizationId !== user.organizationId) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Sale not found' } }, 404);
  }
  if (!isAuthorizedForStation(user, { organizationId: user.organizationId, stationId: sale.stationId })) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this station' } }, 403);
  }

  const items = await db
    .select({
      productId: schema.saleItems.productId,
      quantity: schema.saleItems.quantity,
      unitPrice: schema.saleItems.unitPrice,
      discountAmount: schema.saleItems.discountAmount,
      name: schema.products.name,
      taxCategory: schema.products.taxCategory,
      taxConfig: schema.products.taxConfig,
    })
    .from(schema.saleItems)
    .innerJoin(schema.products, eq(schema.products.id, schema.saleItems.productId))
    .where(eq(schema.saleItems.saleId, saleId));
  if (items.length === 0) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Sale has no line items to invoice' } }, 400);
  }

  let buyer: { customerId: string | null; name: string | null; gstin: string | null; stateCode: string | null } = {
    customerId: null, name: null, gstin: null, stateCode: null,
  };
  if (sale.customerId) {
    const cust = await new DrizzleCustomerRepository(db).findById(sale.customerId);
    const md = ((cust?.metadata as Record<string, any>) || {});
    buyer = { customerId: sale.customerId, name: cust?.name ?? null, gstin: md.gstin ?? null, stateCode: md.stateCode ?? null };
  } else if (sale.buyerDetails) {
    // Ad-hoc walk-in buyer captured on the sale (not saved to the registry).
    const bd = (sale.buyerDetails as Record<string, any>) || {};
    buyer = { customerId: null, name: bd.name ?? null, gstin: bd.gstin ?? null, stateCode: bd.stateCode ?? null };
  }
  const station = await new DrizzleStationRepository(db).findById(sale.stationId);
  const legal = ((station?.settings as any)?.legal) || {};

  const lines = items.map((it) => {
    const tc = (it.taxConfig as Record<string, any>) || {};
    // Retail merchandise is usually MRP (tax-inclusive). Honour the product's
    // price_inclusive flag; default GST lines to inclusive when unset.
    const inclusive = it.taxCategory === 'GST' ? tc.price_inclusive !== false : false;
    return {
      productId: it.productId,
      name: it.name,
      hsnCode: tc.hsn_code ?? null,
      taxCategory: it.taxCategory as any,
      gstRate: tc.gst_rate ?? null,
      vatRate: tc.vat_rate ?? null,
      cessRate: tc.cess ?? null,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      discount: it.discountAmount,
      inclusive,
    };
  });

  const result = await runInTransaction(db, (tx, events) =>
    new GenerateInvoice({
      invoices: new DrizzleInvoiceRepository(tx),
      sequences: new DrizzleDocumentSequenceRepository(tx),
      events,
    }).execute(
      {
        saleId,
        stationId: sale.stationId,
        businessDayId: sale.businessDayId,
        issuedDate: sale.businessDate,
        supplierGstin: legal.gstin ?? null,
        supplierStateCode: legal.stateCode ?? null,
        buyerCustomerId: buyer.customerId,
        buyerName: buyer.name,
        buyerGstin: buyer.gstin,
        buyerStateCode: buyer.stateCode,
        placeOfSupply: buyer.stateCode ?? legal.stateCode ?? null,
        lines,
      },
      buildContext(user, { stationId: sale.stationId, businessDayId: sale.businessDayId }),
    ),
  );
  return sendResult(c, result);
});

// GET /transactions/invoices?stationId=&from=&to= — list issued invoices.
transactionsRouter.get('/invoices', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  const stationId = c.req.query('stationId');
  const from = c.req.query('from');
  const to = c.req.query('to');
  const conds = [
    eq(schema.invoices.organizationId, user.organizationId),
    ...(stationId ? [eq(schema.invoices.stationId, stationId)] : []),
    ...(from ? [gte(schema.invoices.issuedDate, from)] : []),
    ...(to ? [lte(schema.invoices.issuedDate, to)] : []),
  ];
  const rows = await db
    .select({
      id: schema.invoices.id,
      invoiceNumber: schema.invoices.invoiceNumber,
      issuedDate: schema.invoices.issuedDate,
      saleId: schema.invoices.saleId,
      buyerName: schema.invoices.buyerName,
      buyerGstin: schema.invoices.buyerGstin,
      interState: schema.invoices.interState,
      taxableAmount: schema.invoices.taxableAmount,
      totalAmount: schema.invoices.totalAmount,
      createdAt: schema.invoices.createdAt,
    })
    .from(schema.invoices)
    .where(and(...conds))
    .orderBy(desc(schema.invoices.createdAt));
  return c.json({ success: true, data: rows });
});

// GET /transactions/invoices/:id — full invoice (for PDF / reprint).
transactionsRouter.get('/invoices/:id', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  const rows = await db.select().from(schema.invoices).where(eq(schema.invoices.id, c.req.param('id'))).limit(1);
  const invoice = rows[0];
  if (!invoice || invoice.organizationId !== user.organizationId) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Invoice not found' } }, 404);
  }
  return c.json({ success: true, data: invoice });
});

// GET /transactions/sales/:id/invoice — the invoice for a sale, if any.
transactionsRouter.get('/sales/:id/invoice', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  const rows = await db.select().from(schema.invoices).where(eq(schema.invoices.saleId, c.req.param('id'))).limit(1);
  const invoice = rows[0];
  if (!invoice || invoice.organizationId !== user.organizationId) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'No invoice for this sale' } }, 404);
  }
  return c.json({ success: true, data: invoice });
});

// GET /transactions/sales?stationId=&from=&to= — non-fuel (merchandise) sales
// with their invoice status, for the Invoices workspace. Fuel sales are excluded
// (they're VAT, not GST-invoiceable here).
transactionsRouter.get('/sales', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  const stationId = c.req.query('stationId');
  const from = c.req.query('from');
  const to = c.req.query('to');
  if (!stationId) return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Missing stationId' } }, 400);
  if (!isAuthorizedForStation(user, { organizationId: user.organizationId, stationId })) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this station' } }, 403);
  }
  const rows = await db
    .select({
      id: schema.sales.id,
      documentNumber: schema.sales.documentNumber,
      saleType: schema.sales.saleType,
      paymentMethod: schema.sales.paymentMethod,
      customerId: schema.sales.customerId,
      subtotalAmount: schema.sales.subtotalAmount,
      taxAmount: schema.sales.taxAmount,
      totalAmount: schema.sales.totalAmount,
      createdAt: schema.sales.createdAt,
      businessDate: schema.businessDays.businessDate,
      customerName: schema.customers.name,
      invoiceId: schema.invoices.id,
      invoiceNumber: schema.invoices.invoiceNumber,
    })
    .from(schema.sales)
    .innerJoin(schema.businessDays, eq(schema.sales.businessDayId, schema.businessDays.id))
    .leftJoin(schema.customers, eq(schema.customers.id, schema.sales.customerId))
    .leftJoin(schema.invoices, eq(schema.invoices.saleId, schema.sales.id))
    .where(
      and(
        eq(schema.businessDays.stationId, stationId),
        eq(schema.businessDays.organizationId, user.organizationId),
        ne(schema.sales.saleType, 'Fuel'),
        ...(from ? [gte(schema.businessDays.businessDate, from)] : []),
        ...(to ? [lte(schema.businessDays.businessDate, to)] : []),
      ),
    )
    .orderBy(desc(schema.sales.createdAt));
  return c.json({ success: true, data: rows });
});

// ====================================================
// MERCHANDISE HANDOVER (walk-in bulk, per employee) — Phase T4b
// ====================================================

// POST /transactions/shifts/:id/merchandise-handover — record/replace an
// employee's itemized walk-in merchandise closing (a cash sale attributed to them).
transactionsRouter.post('/shifts/:id/merchandise-handover', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  const shiftId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));

  const shiftRows = await db
    .select({ stationId: schema.shifts.stationId })
    .from(schema.shifts)
    .where(and(eq(schema.shifts.id, shiftId), eq(schema.shifts.organizationId, user.organizationId)))
    .limit(1);
  if (!shiftRows[0]) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Shift not found' } }, 404);
  if (!isAuthorizedForStation(user, { organizationId: user.organizationId, stationId: shiftRows[0].stationId })) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this station' } }, 403);
  }

  const result = await runInTransaction(db, (tx, events) =>
    new RecordMerchandiseHandover({
      sales: new DrizzleSaleRepository(tx),
      handovers: new DrizzleMerchandiseHandoverRepository(tx),
      stock: new DrizzleStockMovementRepository(tx),
      products: new DrizzleProductRepository(tx),
      shifts: new DrizzleShiftRepository(tx),
      docNumbers: new TimestampDocumentNumberGenerator(),
      events,
    }).execute({ shiftId, attendantId: body.attendantId, lines: body.lines ?? [], nonCashAmount: body.nonCashAmount }, buildContext(user)),
  );
  return sendResult(c, result);
});

// GET /transactions/shifts/:id/merchandise-handovers — list per-employee handovers + items.
transactionsRouter.get('/shifts/:id/merchandise-handovers', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  const shiftId = c.req.param('id');

  const handovers = await db
    .select({
      id: schema.sales.id,
      attendantId: schema.sales.attendantId,
      attendantName: schema.users.fullName,
      subtotalAmount: schema.sales.subtotalAmount,
      taxAmount: schema.sales.taxAmount,
      totalAmount: schema.sales.totalAmount,
      nonCashAmount: schema.sales.nonCashAmount,
      createdAt: schema.sales.createdAt,
    })
    .from(schema.sales)
    .leftJoin(schema.users, eq(schema.users.id, schema.sales.attendantId))
    .innerJoin(schema.businessDays, eq(schema.sales.businessDayId, schema.businessDays.id))
    .where(
      and(
        eq(schema.sales.shiftId, shiftId),
        eq(schema.sales.captureMechanism, 'MERCH_HANDOVER'),
        eq(schema.businessDays.organizationId, user.organizationId),
      ),
    )
    .orderBy(desc(schema.sales.createdAt));

  const saleIds = handovers.map((h) => h.id);
  let itemsBySale: Record<string, any[]> = {};
  if (saleIds.length > 0) {
    const items = await db
      .select({
        saleId: schema.saleItems.saleId,
        productId: schema.saleItems.productId,
        productName: schema.products.name,
        quantity: schema.saleItems.quantity,
        unitPrice: schema.saleItems.unitPrice,
        lineTotal: schema.saleItems.lineTotal,
      })
      .from(schema.saleItems)
      .leftJoin(schema.products, eq(schema.products.id, schema.saleItems.productId))
      .where(inArray(schema.saleItems.saleId, saleIds));
    itemsBySale = items.reduce((acc: Record<string, any[]>, it) => {
      (acc[it.saleId] ||= []).push(it);
      return acc;
    }, {});
  }

  return c.json({ success: true, data: handovers.map((h) => ({ ...h, items: itemsBySale[h.id] ?? [] })) });
});

// GET /transactions/shifts/:id/merchandise-sales — the individual (quick-entry)
// non-fuel "billed" sales for a shift: everything NOT recorded via the bulk
// merchandise handover. Shown read-only inside the handover drawer so a
// employee's full merchandise picture (bulk + billed) reconciles in one place.
transactionsRouter.get('/shifts/:id/merchandise-sales', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  const shiftId = c.req.param('id');

  const rows = await db
    .select({
      id: schema.sales.id,
      documentNumber: schema.sales.documentNumber,
      attendantId: schema.sales.attendantId,
      attendantName: schema.users.fullName,
      customerId: schema.sales.customerId,
      customerName: schema.customers.name,
      buyerDetails: schema.sales.buyerDetails,
      paymentMethod: schema.sales.paymentMethod,
      totalAmount: schema.sales.totalAmount,
      createdAt: schema.sales.createdAt,
    })
    .from(schema.sales)
    .leftJoin(schema.users, eq(schema.users.id, schema.sales.attendantId))
    .leftJoin(schema.customers, eq(schema.customers.id, schema.sales.customerId))
    .innerJoin(schema.businessDays, eq(schema.sales.businessDayId, schema.businessDays.id))
    .where(
      and(
        eq(schema.sales.shiftId, shiftId),
        ne(schema.sales.saleType, 'Fuel'),
        ne(schema.sales.captureMechanism, 'MERCH_HANDOVER'),
        eq(schema.businessDays.organizationId, user.organizationId),
      ),
    )
    .orderBy(desc(schema.sales.createdAt));

  const saleIds = rows.map((r) => r.id);
  let itemsBySale: Record<string, any[]> = {};
  if (saleIds.length > 0) {
    const items = await db
      .select({
        saleId: schema.saleItems.saleId,
        productName: schema.products.name,
        quantity: schema.saleItems.quantity,
        lineTotal: schema.saleItems.lineTotal,
      })
      .from(schema.saleItems)
      .leftJoin(schema.products, eq(schema.products.id, schema.saleItems.productId))
      .where(inArray(schema.saleItems.saleId, saleIds));
    itemsBySale = items.reduce((acc: Record<string, any[]>, it) => {
      (acc[it.saleId] ||= []).push(it);
      return acc;
    }, {});
  }

  return c.json({ success: true, data: rows.map((r) => ({ ...r, customerName: r.customerName ?? ((r.buyerDetails as any)?.name ?? null), items: itemsBySale[r.id] ?? [] })) });
});

// DELETE /transactions/merchandise-handovers/:saleId — remove a handover (shift must be OPEN).
transactionsRouter.delete('/merchandise-handovers/:saleId', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  const saleId = c.req.param('saleId');

  const rows = await db
    .select({ shiftStatus: schema.shifts.status, orgId: schema.businessDays.organizationId, capture: schema.sales.captureMechanism })
    .from(schema.sales)
    .innerJoin(schema.shifts, eq(schema.shifts.id, schema.sales.shiftId))
    .innerJoin(schema.businessDays, eq(schema.sales.businessDayId, schema.businessDays.id))
    .where(eq(schema.sales.id, saleId))
    .limit(1);
  const row = rows[0];
  if (!row || row.orgId !== user.organizationId || row.capture !== 'MERCH_HANDOVER') {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Merchandise handover not found' } }, 404);
  }
  if (row.shiftStatus !== 'OPEN') {
    return c.json({ success: false, error: { code: 'INVARIANT_VIOLATION', message: 'Cannot edit after the shift is closed' } }, 409);
  }
  await new DrizzleMerchandiseHandoverRepository(db).deleteHandoverSale(saleId);
  return c.json({ success: true, data: { id: saleId } });
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
