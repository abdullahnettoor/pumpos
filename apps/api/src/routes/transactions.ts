import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { schema, DbClient } from '@pump/db';
import {
  shiftExpenseSchema,
  shiftPurchaseSchema,
  shiftCollectionSchema,
  Role,
} from '@pump/shared';

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
export async function compileDssrSnapshot(db: DbClient, shiftId: string) {
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

  // Compute cash calculations
  const openingCashNum = Number(shift.openingCash);
  const closingCashNum = Number(shift.closingCash ?? 0);

  // Cash collections = sum of collections with paymentMethod = 'Cash'
  const cashCollectionsSum = collections
    .filter((c) => c.paymentMethod === 'Cash')
    .reduce((sum, c) => sum + Number(c.amount), 0);

  const cardCollectionsSum = collections
    .filter((c) => c.paymentMethod === 'Card')
    .reduce((sum, c) => sum + Number(c.amount), 0);

  const upiCollectionsSum = collections
    .filter((c) => c.paymentMethod === 'UPI')
    .reduce((sum, c) => sum + Number(c.amount), 0);

  const creditSalesSum = collections
    .filter((c) => c.paymentMethod === 'Credit')
    .reduce((sum, c) => sum + Number(c.amount), 0);

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
      for (const item of defaults) {
        await db.insert(schema.expenseCategories).values({
          organizationId: user.organizationId,
          name: item.name,
          isSystem: item.isSystem,
        });
      }
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

// GET /api/shifts/suppliers
transactionsRouter.get('/suppliers', async (c) => {
  const db = c.var.db;
  const user = c.var.user;

  try {
    let list = await db
      .select()
      .from(schema.suppliers)
      .where(and(eq(schema.suppliers.organizationId, user.organizationId), eq(schema.suppliers.isActive, true)));

    if (list.length === 0) {
      // Seed standard suppliers
      const defaults = ['Indian Oil Corporation Ltd', 'Bharat Petroleum Corporation Ltd', 'Local Lubricants Distributor'];
      for (const name of defaults) {
        await db.insert(schema.suppliers).values({
          organizationId: user.organizationId,
          name,
          isActive: true,
        });
      }
      list = await db
        .select()
        .from(schema.suppliers)
        .where(and(eq(schema.suppliers.organizationId, user.organizationId), eq(schema.suppliers.isActive, true)));
    }

    return c.json({ success: true, data: list });
  } catch (err: any) {
    return c.json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } }, 500);
  }
});

// GET /api/shifts/customers
transactionsRouter.get('/customers', async (c) => {
  const db = c.var.db;
  const user = c.var.user;

  try {
    let list = await db
      .select()
      .from(schema.customers)
      .where(and(eq(schema.customers.organizationId, user.organizationId), eq(schema.customers.isActive, true)));

    if (list.length === 0) {
      // Seed standard customers
      const defaults = [
        { name: 'KSRTC State Bus Depot', customerType: 'Credit' },
        { name: 'V-Trans Logistics fleet', customerType: 'Fleet' },
        { name: 'Local Public School Bus', customerType: 'Credit' },
      ];
      for (const item of defaults) {
        await db.insert(schema.customers).values({
          organizationId: user.organizationId,
          name: item.name,
          customerType: item.customerType as any,
          isActive: true,
        });
      }
      list = await db
        .select()
        .from(schema.customers)
        .where(and(eq(schema.customers.organizationId, user.organizationId), eq(schema.customers.isActive, true)));
    }

    return c.json({ success: true, data: list });
  } catch (err: any) {
    return c.json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } }, 500);
  }
});

// POST /api/expenses
transactionsRouter.post('/expenses', async (c) => {
  const db = c.var.db;
  const user = c.var.user;

  try {
    const body = await c.req.json();
    const parsed = shiftExpenseSchema.parse(body);

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
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: err.message } }, 400);
  }
});

// POST /api/purchases
transactionsRouter.post('/purchases', async (c) => {
  const db = c.var.db;
  const user = c.var.user;

  try {
    const body = await c.req.json();
    const parsed = shiftPurchaseSchema.parse(body);

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
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: err.message } }, 400);
  }
});

// POST /api/collections
transactionsRouter.post('/collections', async (c) => {
  const db = c.var.db;
  const user = c.var.user;

  try {
    const body = await c.req.json();
    const parsed = shiftCollectionSchema.parse(body);

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
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: err.message } }, 400);
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

