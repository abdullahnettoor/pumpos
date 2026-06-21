import { Hono } from 'hono';
import { eq, and, desc } from 'drizzle-orm';
import { schema, DbClient } from '@pump/db';
import {
  shiftExpenseSchema,
  shiftPurchaseSchema,
  shiftCollectionSchema,
  customerCreateSchema,
  supplierCreateSchema,
  Role,
} from '@pump/shared';
import { validateJson } from '../utils/validator.js';

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

// Helper to compile DSSR Snapshot reactively
export async function compileDssrSnapshot(
  db: DbClient,
  shiftId: string,
  closingDipReadings?: { tankId: string; actualQuantity: number }[]
) {
  const [shift] = await db
    .select()
    .from(schema.shifts)
    .where(eq(schema.shifts.id, shiftId))
    .limit(1);

  if (!shift) return;

  const [template] = await db
    .select()
    .from(schema.shiftTemplates)
    .where(eq(schema.shiftTemplates.id, shift.shiftTemplateId))
    .limit(1);

  const [closedByUser] = shift.closedBy
    ? await db.select().from(schema.users).where(eq(schema.users.id, shift.closedBy)).limit(1)
    : [null];

  // Fetch all nozzle readings
  const rawNozzleReadings = await db
    .select()
    .from(schema.nozzleReadings)
    .where(eq(schema.nozzleReadings.shiftId, shiftId));

  const enrichedReadingsSnapshot = await Promise.all(
    rawNozzleReadings.map(async (nr) => {
      const [nz] = await db.select().from(schema.nozzles).where(eq(schema.nozzles.id, nr.nozzleId)).limit(1);
      const [prod] = nz ? await db.select().from(schema.products).where(eq(schema.products.id, nz.productId)).limit(1) : [null];
      return {
        nozzleId: nr.nozzleId,
        productId: nz?.productId ?? 'Unknown',
        nozzleName: nz?.name ?? 'Unknown',
        productName: prod?.name ?? 'Unknown',
        productCode: prod?.code ?? 'Unknown',
        openingReading: Number(nr.openingReading),
        closingReading: Number(nr.closingReading),
        volumeSold: Number(nr.volumeSold),
        unitPrice: nr.unitPrice ? Number(nr.unitPrice) : 0,
      };
    })
  );

  const totalVolumeSold = enrichedReadingsSnapshot.reduce((sum, r) => sum + r.volumeSold, 0);

  // Fetch all transactions
  const expenses = await db
    .select()
    .from(schema.expenses)
    .where(eq(schema.expenses.shiftId, shiftId));

  const purchases = await db
    .select()
    .from(schema.purchases)
    .where(eq(schema.purchases.shiftId, shiftId));

  const collections = await db
    .select()
    .from(schema.collections)
    .where(eq(schema.collections.shiftId, shiftId));

  // Retrieve attendant handovers recorded for the shift
  const handovers = await db
    .select()
    .from(schema.attendantHandovers)
    .where(eq(schema.attendantHandovers.shiftId, shiftId));

  const handoversList = await Promise.all(
    handovers.map(async (h) => {
      const [u] = await db.select().from(schema.users).where(eq(schema.users.id, h.userId)).limit(1);
      const [du] = await db.select().from(schema.dispenserUnits).where(eq(schema.dispenserUnits.id, h.duId)).limit(1);
      return {
        ...h,
        attendantName: u?.fullName ?? 'Unknown Attendant',
        duCode: du?.code ?? 'Unknown DU',
        cashHandedOver: Number(h.cashHandedOver),
        cardHandedOver: Number(h.cardHandedOver),
        upiHandedOver: Number(h.upiHandedOver),
        creditHandedOver: Number(h.creditHandedOver),
        testingVolume: Number(h.testingVolume),
        expectedSales: Number(h.expectedSales),
        varianceAmount: Number(h.varianceAmount),
      };
    })
  );

  // Compute cash calculations
  const openingCashNum = Number(shift.openingCash);
  const closingCashNum = Number(shift.closingCash ?? 0);

  let cashCollectionsSum = 0;
  let cardCollectionsSum = 0;
  let upiCollectionsSum = 0;
  let creditSalesSum = 0;

  if (handovers.length > 0) {
    cashCollectionsSum = handoversList.reduce((sum, h) => sum + h.cashHandedOver, 0);
    cardCollectionsSum = handoversList.reduce((sum, h) => sum + h.cardHandedOver, 0);
    upiCollectionsSum = handoversList.reduce((sum, h) => sum + h.upiHandedOver, 0);
    creditSalesSum = handoversList.reduce((sum, h) => sum + h.creditHandedOver, 0);
  } else {
    cashCollectionsSum = collections
      .filter((c) => c.paymentMethod === 'Cash')
      .reduce((sum, c) => sum + Number(c.amount), 0);

    cardCollectionsSum = collections
      .filter((c) => c.paymentMethod === 'Card')
      .reduce((sum, c) => sum + Number(c.amount), 0);

    upiCollectionsSum = collections
      .filter((c) => c.paymentMethod === 'UPI')
      .reduce((sum, c) => sum + Number(c.amount), 0);

    creditSalesSum = collections
      .filter((c) => c.paymentMethod === 'Credit')
      .reduce((sum, c) => sum + Number(c.amount), 0);
  }

  const cashExpensesSum = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

  const expectedCash = openingCashNum + cashCollectionsSum - cashExpensesSum;
  const cashVariance = closingCashNum - expectedCash;

  // Compile warnings
  const warnings = [];
  if (closingCashNum === 0 && openingCashNum > 0) {
    warnings.push('Closing cash is ₹0, which is highly unusual.');
  }
  if (totalVolumeSold === 0) {
    warnings.push('Zero volume was sold across all nozzles this shift.');
  }
  if (Math.abs(cashVariance) > 100) {
    warnings.push(`Cash discrepancy detected! Variance is ₹${cashVariance.toLocaleString('en-IN')}`);
  }

  // Credit sales mismatch check
  if (handovers.length > 0) {
    const detailedCreditSum = collections
      .filter((c) => c.paymentMethod === 'Credit')
      .reduce((sum, c) => sum + Number(c.amount), 0);
    
    if (Math.abs(detailedCreditSum - creditSalesSum) > 1.00) {
      warnings.push(`Credit Sales mismatch: Attendants declared ₹${creditSalesSum.toLocaleString('en-IN')} in chits, but only ₹${detailedCreditSum.toLocaleString('en-IN')} of detailed customer billing has been logged.`);
    }
  }

  // Format list profiles for snapshot summary lists
  const expensesList = await Promise.all(
    expenses.map(async (e) => {
      const [cat] = await db.select().from(schema.expenseCategories).where(eq(schema.expenseCategories.id, e.categoryId)).limit(1);
      return {
        id: e.id,
        amount: Number(e.amount),
        description: e.description ?? '',
        categoryName: cat?.name ?? 'General',
        createdAt: e.createdAt,
      };
    })
  );

  const purchasesList = await Promise.all(
    purchases.map(async (p) => {
      const [sup] = await db.select().from(schema.suppliers).where(eq(schema.suppliers.id, p.supplierId)).limit(1);
      return {
        id: p.id,
        amount: Number(p.amount),
        notes: p.notes ?? '',
        supplierName: sup?.name ?? 'Unknown',
        documentNumber: p.documentNumber,
        createdAt: p.createdAt,
      };
    })
  );

  const collectionsList = await Promise.all(
    collections.map(async (c) => {
      const [cust] = c.customerId
        ? await db.select().from(schema.customers).where(eq(schema.customers.id, c.customerId)).limit(1)
        : [null];
      return {
        id: c.id,
        amount: Number(c.amount),
        paymentMethod: c.paymentMethod,
        notes: c.notes ?? '',
        customerName: cust?.name ?? 'Walk-in Customer',
        documentNumber: c.documentNumber,
        createdAt: c.createdAt,
      };
    })
  );

  // Fetch stock variances for this shift
  const stockVariances = await db
    .select()
    .from(schema.stockVariances)
    .where(eq(schema.stockVariances.shiftId, shiftId));

  const stockVariancesList = await Promise.all(
    stockVariances.map(async (v) => {
      const [prod] = await db
        .select()
        .from(schema.products)
        .where(eq(schema.products.id, v.productId))
        .limit(1);

      return {
        id: v.id,
        productId: v.productId,
        productName: prod?.name ?? 'Unknown',
        productCode: prod?.code ?? 'Unknown',
        expectedQuantity: Number(v.expectedQuantity),
        actualQuantity: Number(v.actualQuantity),
        varianceQuantity: Number(v.varianceQuantity),
        reason: v.reason ?? '',
      };
    })
  );

  // Compile warnings for stock variances (flag if variance exceeds 0.5% of expected stock)
  for (const sv of stockVariancesList) {
    if (sv.expectedQuantity > 0 && Math.abs(sv.varianceQuantity) > 0.005 * sv.expectedQuantity) {
      warnings.push(`Stock discrepancy for ${sv.productName}! Variance is ${sv.varianceQuantity.toFixed(2)} Liters`);
    }
  }

  // Construct dip readings snapshot
  let dipReadingsSnapshot: any[] = [];
  if (closingDipReadings && closingDipReadings.length > 0) {
    dipReadingsSnapshot = await Promise.all(
      closingDipReadings.map(async (dr) => {
        const [tank] = await db
          .select()
          .from(schema.tanks)
          .where(eq(schema.tanks.id, dr.tankId))
          .limit(1);
        const [prod] = tank
          ? await db.select().from(schema.products).where(eq(schema.products.id, tank.productId)).limit(1)
          : [null];
        return {
          tankId: dr.tankId,
          tankName: tank?.name ?? 'Unknown Tank',
          productName: prod?.name ?? 'Unknown',
          productCode: prod?.code ?? 'Unknown',
          capacity: tank ? Number(tank.capacity) : 0,
          actualQuantity: dr.actualQuantity,
        };
      })
    );
  } else {
    // Try to get from existing snapshot
    const [existingDssr] = await db
      .select()
      .from(schema.dssrSnapshots)
      .where(eq(schema.dssrSnapshots.shiftId, shiftId))
      .limit(1);
    if (existingDssr && (existingDssr.snapshotData as any)?.dipReadings) {
      dipReadingsSnapshot = (existingDssr.snapshotData as any).dipReadings;
    }
  }

  const snapshotData = {
    shiftId,
    templateName: template?.name ?? 'Unknown',
    openedAt: shift.openedAt,
    closedAt: shift.closedAt,
    openedBy: shift.openedBy,
    closedBy: shift.closedBy,
    closedByName: closedByUser?.fullName ?? 'Staff',
    openingCash: openingCashNum,
    closingCash: closingCashNum,
    expectedCash,
    cashVariance,
    cashCollectionsSum,
    cardCollectionsSum,
    upiCollectionsSum,
    creditSalesSum,
    cashExpensesSum,
    nozzleReadings: enrichedReadingsSnapshot,
    totalVolumeSold,
    expenses: expensesList,
    purchases: purchasesList,
    collections: collectionsList,
    stockVariances: stockVariancesList,
    dipReadings: dipReadingsSnapshot,
    handovers: handoversList,
    warnings,
  };

  // Upsert DSSR Snapshot: Delete existing one first and insert fresh compilation
  await db.delete(schema.dssrSnapshots).where(eq(schema.dssrSnapshots.shiftId, shiftId));
  await db.insert(schema.dssrSnapshots).values({
    shiftId,
    snapshotData,
    generatedAt: new Date(),
  });
}

// Check lock guard middleware
async function ensureShiftNotLocked(db: DbClient, shiftId: string): Promise<boolean> {
  const [shift] = await db.select().from(schema.shifts).where(eq(schema.shifts.id, shiftId)).limit(1);
  if (!shift) return false;
  if (shift.status === 'LOCKED') return false;

  if (shift.status === 'CLOSED' && shift.closedAt) {
    const [station] = await db.select().from(schema.stations).where(eq(schema.stations.id, shift.stationId)).limit(1);
    const lockGraceDays = (station?.settings as any)?.shift_lock_grace_days ?? 3;
    const closedTime = new Date(shift.closedAt).getTime();
    const lockExpiryTime = closedTime + lockGraceDays * 24 * 60 * 60 * 1000;

    if (Date.now() > lockExpiryTime) {
      // Auto-lock transition
      await db.update(schema.shifts).set({ status: 'LOCKED', lockedAt: new Date(lockExpiryTime) }).where(eq(schema.shifts.id, shiftId));
      return false;
    }
  }

  return true;
}

// GET /api/shifts/:id/transactions
transactionsRouter.get('/shifts/:id/transactions', async (c) => {
  const db = c.var.db;
  const shiftId = c.req.param('id');

  try {
    const expenses = await db.select().from(schema.expenses).where(eq(schema.expenses.shiftId, shiftId));
    const enrichedExpenses = await Promise.all(
      expenses.map(async (e) => {
        const [cat] = await db.select().from(schema.expenseCategories).where(eq(schema.expenseCategories.id, e.categoryId)).limit(1);
        return { ...e, categoryName: cat?.name ?? 'General' };
      })
    );

    const purchases = await db.select().from(schema.purchases).where(eq(schema.purchases.shiftId, shiftId));
    const enrichedPurchases = await Promise.all(
      purchases.map(async (p) => {
        const [sup] = await db.select().from(schema.suppliers).where(eq(schema.suppliers.id, p.supplierId)).limit(1);
        return { ...p, supplierName: sup?.name ?? 'Unknown' };
      })
    );

    const collections = await db.select().from(schema.collections).where(eq(schema.collections.shiftId, shiftId));
    const enrichedCollections = await Promise.all(
      collections.map(async (cl) => {
        const [cust] = cl.customerId 
          ? await db.select().from(schema.customers).where(eq(schema.customers.id, cl.customerId)).limit(1)
          : [null];
        return { ...cl, customerName: cust?.name ?? 'Walk-in Customer' };
      })
    );

    return c.json({
      success: true,
      data: {
        expenses: enrichedExpenses,
        purchases: enrichedPurchases,
        collections: enrichedCollections,
      },
    });
  } catch (err: any) {
    return c.json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } }, 500);
  }
});

// GET /api/shifts/expense-categories
transactionsRouter.get('/expense-categories', async (c) => {
  const db = c.var.db;
  const user = c.var.user;

  try {
    let list = await db
      .select()
      .from(schema.expenseCategories)
      .where(eq(schema.expenseCategories.organizationId, user.organizationId));

    if (list.length === 0) {
      // Seed standard categories
      const defaults = [
        { name: 'Staff Tea & Snacks', isSystem: true },
        { name: 'Office Stationery', isSystem: true },
        { name: 'Generator Diesel', isSystem: true },
        { name: 'Cleaning & Hygiene', isSystem: true },
        { name: 'General Miscellaneous', isSystem: true },
      ];
      
      await db.insert(schema.expenseCategories)
        .values(defaults.map(item => ({
          organizationId: user.organizationId,
          name: item.name,
          isSystem: item.isSystem
        })))
        .onConflictDoNothing();

      list = await db
        .select()
        .from(schema.expenseCategories)
        .where(eq(schema.expenseCategories.organizationId, user.organizationId));
    }

    return c.json({ success: true, data: list });
  } catch (err: any) {
    return c.json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } }, 500);
  }
});

// GET /api/transactions/suppliers
transactionsRouter.get('/suppliers', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  const activeOnly = c.req.query('activeOnly') !== 'false';

  try {
    let list;
    if (activeOnly) {
      list = await db
        .select()
        .from(schema.suppliers)
        .where(and(eq(schema.suppliers.organizationId, user.organizationId), eq(schema.suppliers.isActive, true)));
    } else {
      list = await db
        .select()
        .from(schema.suppliers)
        .where(eq(schema.suppliers.organizationId, user.organizationId));
    }

    return c.json({ success: true, data: list });
  } catch (err: any) {
    return c.json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } }, 500);
  }
});

// POST /api/transactions/suppliers
transactionsRouter.post('/suppliers', validateJson(supplierCreateSchema), async (c) => {
  const db = c.var.db;
  const user = c.var.user;

  const parsed = c.req.valid('json');

  const [newSup] = await db
    .insert(schema.suppliers)
    .values({
      organizationId: user.organizationId,
      name: parsed.name,
      phone: parsed.phone,
      isActive: parsed.isActive,
      metadata: parsed.metadata,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return c.json({ success: true, data: newSup });
});

// PUT /api/transactions/suppliers/:id
transactionsRouter.put('/suppliers/:id', validateJson(supplierCreateSchema), async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  const id = c.req.param('id');

  const parsed = c.req.valid('json');

  const [updatedSup] = await db
    .update(schema.suppliers)
    .set({
      name: parsed.name,
      phone: parsed.phone,
      isActive: parsed.isActive,
      metadata: parsed.metadata,
      updatedAt: new Date(),
    })
    .where(and(eq(schema.suppliers.id, id), eq(schema.suppliers.organizationId, user.organizationId)))
    .returning();

  if (!updatedSup) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Supplier not found' } }, 404);
  }

  return c.json({ success: true, data: updatedSup });
});

// DELETE /api/transactions/suppliers/:id (Soft delete)
transactionsRouter.delete('/suppliers/:id', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  const id = c.req.param('id');

  try {
    const [deletedSup] = await db
      .update(schema.suppliers)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(and(eq(schema.suppliers.id, id), eq(schema.suppliers.organizationId, user.organizationId)))
      .returning();

    if (!deletedSup) {
      return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Supplier not found' } }, 404);
    }

    return c.json({ success: true, data: deletedSup });
  } catch (err: any) {
    return c.json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } }, 500);
  }
});

// GET /api/transactions/customers
transactionsRouter.get('/customers', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  const activeOnly = c.req.query('activeOnly') !== 'false';

  try {
    let list;
    if (activeOnly) {
      list = await db
        .select()
        .from(schema.customers)
        .where(and(eq(schema.customers.organizationId, user.organizationId), eq(schema.customers.isActive, true)));
    } else {
      list = await db
        .select()
        .from(schema.customers)
        .where(eq(schema.customers.organizationId, user.organizationId));
    }

    return c.json({ success: true, data: list });
  } catch (err: any) {
    return c.json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } }, 500);
  }
});

// POST /api/transactions/customers
transactionsRouter.post('/customers', validateJson(customerCreateSchema), async (c) => {
  const db = c.var.db;
  const user = c.var.user;

  const parsed = c.req.valid('json');

  const [newCust] = await db
    .insert(schema.customers)
    .values({
      organizationId: user.organizationId,
      name: parsed.name,
      phone: parsed.phone,
      customerType: parsed.customerType,
      creditLimit: parsed.creditLimit ? String(parsed.creditLimit) : null,
      fleetCode: parsed.fleetCode,
      isActive: parsed.isActive,
      metadata: parsed.metadata,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return c.json({ success: true, data: newCust });
});

// PUT /api/transactions/customers/:id
transactionsRouter.put('/customers/:id', validateJson(customerCreateSchema), async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  const id = c.req.param('id');

  const parsed = c.req.valid('json');

  const [updatedCust] = await db
    .update(schema.customers)
    .set({
      name: parsed.name,
      phone: parsed.phone,
      customerType: parsed.customerType,
      creditLimit: parsed.creditLimit ? String(parsed.creditLimit) : null,
      fleetCode: parsed.fleetCode,
      isActive: parsed.isActive,
      metadata: parsed.metadata,
      updatedAt: new Date(),
    })
    .where(and(eq(schema.customers.id, id), eq(schema.customers.organizationId, user.organizationId)))
    .returning();

  if (!updatedCust) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Customer not found' } }, 404);
  }

  return c.json({ success: true, data: updatedCust });
});

// DELETE /api/transactions/customers/:id (Soft delete)
transactionsRouter.delete('/customers/:id', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  const id = c.req.param('id');

  try {
    const [deletedCust] = await db
      .update(schema.customers)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(and(eq(schema.customers.id, id), eq(schema.customers.organizationId, user.organizationId)))
      .returning();

    if (!deletedCust) {
      return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Customer not found' } }, 404);
    }

    return c.json({ success: true, data: deletedCust });
  } catch (err: any) {
    return c.json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } }, 500);
  }
});

// POST /api/expenses
transactionsRouter.post('/expenses', validateJson(shiftExpenseSchema), async (c) => {
  const db = c.var.db;
  const user = c.var.user;

  const parsed = c.req.valid('json');

  try {
    const editable = await ensureShiftNotLocked(db, parsed.shiftId);
    if (!editable) {
      return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Target shift is locked' } }, 403);
    }

    const [newExpense] = await db
      .insert(schema.expenses)
      .values({
        shiftId: parsed.shiftId,
        categoryId: parsed.categoryId,
        amount: String(parsed.amount),
        description: parsed.description,
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    // Check if shift is closed: recompile DSSR
    const [shift] = await db.select().from(schema.shifts).where(eq(schema.shifts.id, parsed.shiftId)).limit(1);
    if (shift.status === 'CLOSED') {
      await compileDssrSnapshot(db, parsed.shiftId);
    }

    return c.json({ success: true, data: newExpense });
  } catch (err: any) {
    return c.json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } }, 500);
  }
});

// POST /api/purchases
transactionsRouter.post('/purchases', validateJson(shiftPurchaseSchema), async (c) => {
  const db = c.var.db;
  const user = c.var.user;

  const parsed = c.req.valid('json');

  try {
    const editable = await ensureShiftNotLocked(db, parsed.shiftId);
    if (!editable) {
      return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Target shift is locked' } }, 403);
    }

    const docNum = `PURCH-${Date.now().toString().slice(-6)}`;
    const totalAmount = parsed.quantity * parsed.unitPrice;

    const [newPurchase] = await db
      .insert(schema.purchases)
      .values({
        documentNumber: docNum,
        shiftId: parsed.shiftId,
        supplierId: parsed.supplierId,
        invoiceNumber: parsed.invoiceNumber,
        amount: String(totalAmount),
        notes: parsed.notes,
        createdAt: new Date(),
      })
      .returning();

    // Create stock movement
    await db.insert(schema.stockMovements).values({
      shiftId: parsed.shiftId,
      productId: parsed.productId,
      movementType: 'Purchase',
      quantity: String(parsed.quantity),
      referenceType: 'PURCHASE',
      referenceId: newPurchase.id,
      notes: parsed.notes,
      createdAt: new Date(),
    });

    // If customer / supplier transaction is required, record it
    await db.insert(schema.supplierTransactions).values({
      shiftId: parsed.shiftId,
      supplierId: parsed.supplierId,
      transactionType: 'Purchase',
      amount: String(totalAmount),
      referenceType: 'PURCHASE',
      referenceId: newPurchase.id,
      notes: parsed.notes,
      createdAt: new Date(),
    });

    const [shift] = await db.select().from(schema.shifts).where(eq(schema.shifts.id, parsed.shiftId)).limit(1);
    if (shift.status === 'CLOSED') {
      await compileDssrSnapshot(db, parsed.shiftId);
    }

    return c.json({ success: true, data: newPurchase });
  } catch (err: any) {
    return c.json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } }, 500);
  }
});

// POST /api/collections
transactionsRouter.post('/collections', validateJson(shiftCollectionSchema), async (c) => {
  const db = c.var.db;
  const user = c.var.user;

  const parsed = c.req.valid('json');

  try {
    const editable = await ensureShiftNotLocked(db, parsed.shiftId);
    if (!editable) {
      return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Target shift is locked' } }, 403);
    }

    const docNum = `COLL-${Date.now().toString().slice(-6)}`;

    let targetCustomerId = parsed.customerId;
    if (!targetCustomerId) {
      const [defaultCust] = await db
        .select()
        .from(schema.customers)
        .where(eq(schema.customers.organizationId, user.organizationId))
        .limit(1);

      if (!defaultCust) {
        const [seeded] = await db.insert(schema.customers).values({
          organizationId: user.organizationId,
          name: 'General Cash Customer',
          customerType: 'Credit',
          isActive: true,
        }).returning();
        targetCustomerId = seeded.id;
      } else {
        targetCustomerId = defaultCust.id;
      }
    }

    const [newCollection] = await db
      .insert(schema.collections)
      .values({
        documentNumber: docNum,
        shiftId: parsed.shiftId,
        customerId: targetCustomerId,
        amount: String(parsed.amount),
        paymentMethod: parsed.paymentMethod,
        notes: parsed.notes,
        createdAt: new Date(),
      })
      .returning();

    // If customer was explicitly selected or we used seeded, create ledger entry
    if (targetCustomerId) {
      await db.insert(schema.customerTransactions).values({
        shiftId: parsed.shiftId,
        customerId: targetCustomerId,
        transactionType: parsed.paymentMethod === 'Credit' ? 'Credit Sale' : 'Collection',
        amount: String(parsed.amount),
        referenceType: 'COLLECTION',
        referenceId: newCollection.id,
        notes: parsed.notes,
        createdAt: new Date(),
      });
    }

    const [shift] = await db.select().from(schema.shifts).where(eq(schema.shifts.id, parsed.shiftId)).limit(1);
    if (shift.status === 'CLOSED') {
      await compileDssrSnapshot(db, parsed.shiftId);
    }

    return c.json({ success: true, data: newCollection });
  } catch (err: any) {
    return c.json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } }, 500);
  }
});

// GET /api/transactions/expenses
transactionsRouter.get('/expenses', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  try {
    const list = await db
      .select()
      .from(schema.expenses)
      .innerJoin(schema.shifts, eq(schema.expenses.shiftId, schema.shifts.id))
      .where(eq(schema.shifts.organizationId, user.organizationId));
    
    const enriched = await Promise.all(
      list.map(async (row) => {
        const e = row.expenses;
        const [cat] = await db.select().from(schema.expenseCategories).where(eq(schema.expenseCategories.id, e.categoryId)).limit(1);
        return {
          ...e,
          categoryName: cat?.name ?? 'General',
          shiftDate: row.shifts.openedAt,
        };
      })
    );
    return c.json({ success: true, data: enriched });
  } catch (err: any) {
    return c.json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } }, 500);
  }
});

// GET /api/transactions/purchases
transactionsRouter.get('/purchases', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  try {
    const list = await db
      .select()
      .from(schema.purchases)
      .innerJoin(schema.shifts, eq(schema.purchases.shiftId, schema.shifts.id))
      .where(eq(schema.shifts.organizationId, user.organizationId));
    
    const enriched = await Promise.all(
      list.map(async (row) => {
        const p = row.purchases;
        const [sup] = await db.select().from(schema.suppliers).where(eq(schema.suppliers.id, p.supplierId)).limit(1);
        return {
          ...p,
          supplierName: sup?.name ?? 'Unknown Supplier',
          shiftDate: row.shifts.openedAt,
        };
      })
    );
    return c.json({ success: true, data: enriched });
  } catch (err: any) {
    return c.json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } }, 500);
  }
});

// GET /api/transactions/collections
transactionsRouter.get('/collections', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  try {
    const list = await db
      .select()
      .from(schema.collections)
      .innerJoin(schema.shifts, eq(schema.collections.shiftId, schema.shifts.id))
      .where(eq(schema.shifts.organizationId, user.organizationId));
    
    const enriched = await Promise.all(
      list.map(async (row) => {
        const col = row.collections;
        const [cust] = col.customerId
          ? await db.select().from(schema.customers).where(eq(schema.customers.id, col.customerId)).limit(1)
          : [null];
        return {
          ...col,
          customerName: cust?.name ?? 'Walk-in Customer',
          shiftDate: row.shifts.openedAt,
        };
      })
    );
    return c.json({ success: true, data: enriched });
  } catch (err: any) {
    return c.json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } }, 500);
  }
});

// Helper to check if user has access to station
function hasStationAccess(user: any, stationId: string): boolean {
  if (user.role === 'Owner') return true;
  return user.assignedStationIds.includes(stationId);
}

// GET /api/transactions/inventory/status
transactionsRouter.get('/inventory/status', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  const stationId = c.req.query('stationId');

  if (!stationId) {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Missing stationId' } }, 400);
  }

  if (!hasStationAccess(user, stationId)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this station' } }, 403);
  }

  try {
    const stationTanks = await db
      .select()
      .from(schema.tanks)
      .where(and(eq(schema.tanks.stationId, stationId), eq(schema.tanks.organizationId, user.organizationId)));

    const enrichedTanks = await Promise.all(
      stationTanks.map(async (t) => {
        const [prod] = await db
          .select()
          .from(schema.products)
          .where(eq(schema.products.id, t.productId))
          .limit(1);

        const movements = await db
          .select({
            quantity: schema.stockMovements.quantity,
          })
          .from(schema.stockMovements)
          .innerJoin(schema.shifts, eq(schema.stockMovements.shiftId, schema.shifts.id))
          .where(
            and(
              eq(schema.shifts.stationId, stationId),
              eq(schema.stockMovements.productId, t.productId)
            )
          );

        const currentVolume = movements.reduce((sum, m) => sum + Number(m.quantity), 0);

        return {
          id: t.id,
          name: t.name,
          productId: t.productId,
          productName: prod?.name ?? 'Unknown',
          productCode: prod?.code ?? 'Unknown',
          capacity: Number(t.capacity),
          currentVolume: Math.max(0, currentVolume),
        };
      })
    );

    return c.json({ success: true, data: enrichedTanks });
  } catch (err: any) {
    return c.json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } }, 500);
  }
});

// GET /api/transactions/inventory/movements
transactionsRouter.get('/inventory/movements', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  const stationId = c.req.query('stationId');

  if (!stationId) {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Missing stationId' } }, 400);
  }

  if (!hasStationAccess(user, stationId)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this station' } }, 403);
  }

  try {
    const list = await db
      .select({
        movement: schema.stockMovements,
        shift: schema.shifts,
      })
      .from(schema.stockMovements)
      .innerJoin(schema.shifts, eq(schema.stockMovements.shiftId, schema.shifts.id))
      .where(
        and(
          eq(schema.shifts.stationId, stationId),
          eq(schema.shifts.organizationId, user.organizationId)
        )
      )
      .orderBy(desc(schema.stockMovements.createdAt));

    const enriched = await Promise.all(
      list.map(async (row) => {
        const m = row.movement;
        const [prod] = await db
          .select()
          .from(schema.products)
          .where(eq(schema.products.id, m.productId))
          .limit(1);

        return {
          ...m,
          quantity: Number(m.quantity),
          productName: prod?.name ?? 'Unknown',
          productCode: prod?.code ?? 'Unknown',
          shiftDate: row.shift.openedAt,
          shiftStatus: row.shift.status,
        };
      })
    );

    return c.json({ success: true, data: enriched });
  } catch (err: any) {
    return c.json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } }, 500);
  }
});

// GET /api/transactions/inventory/variances
transactionsRouter.get('/inventory/variances', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  const stationId = c.req.query('stationId');

  if (!stationId) {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Missing stationId' } }, 400);
  }

  if (!hasStationAccess(user, stationId)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this station' } }, 403);
  }

  try {
    const list = await db
      .select({
        variance: schema.stockVariances,
        shift: schema.shifts,
      })
      .from(schema.stockVariances)
      .innerJoin(schema.shifts, eq(schema.stockVariances.shiftId, schema.shifts.id))
      .where(
        and(
          eq(schema.shifts.stationId, stationId),
          eq(schema.shifts.organizationId, user.organizationId)
        )
      )
      .orderBy(desc(schema.stockVariances.createdAt));

    const enriched = await Promise.all(
      list.map(async (row) => {
        const v = row.variance;
        const [prod] = await db
          .select()
          .from(schema.products)
          .where(eq(schema.products.id, v.productId))
          .limit(1);

        return {
          ...v,
          expectedQuantity: Number(v.expectedQuantity),
          actualQuantity: Number(v.actualQuantity),
          varianceQuantity: Number(v.varianceQuantity),
          productName: prod?.name ?? 'Unknown',
          productCode: prod?.code ?? 'Unknown',
          shiftDate: row.shift.openedAt,
          shiftStatus: row.shift.status,
        };
      })
    );

    return c.json({ success: true, data: enriched });
  } catch (err: any) {
    return c.json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } }, 500);
  }
});

