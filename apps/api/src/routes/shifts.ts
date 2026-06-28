import { Hono } from 'hono';
import { and, desc, eq, ne, sql } from 'drizzle-orm';
import { schema, type DbClient } from '@pump/db';
import { canOpenShift, canCloseShift, canReopenShift, isAuthorizedForStation, type Role } from '@pump/shared';
import {
  OpenShift,
  RecordNozzleReadings,
  CloseShift,
  ReopenShift,
  LockShift,
  OpenBusinessDay,
  CloseBusinessDay,
  type Result,
} from '@pump/core';
import { buildContext } from '../infra/context.js';
import { runInTransaction } from '../infra/transaction.js';
import {
  DrizzleNozzleRepository,
  DrizzleFuelPriceRepository,
} from '../infra/repositories/setup-repositories.js';
import {
  DrizzleBusinessDayRepository,
  DrizzleShiftRepository,
  DrizzleNozzleReadingRepository,
  DrizzleShiftReconciliationReader,
  DrizzleStockMovementWriter,
  DrizzleShiftSummaryWriter,
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

export const shiftsRouter = new Hono<{ Variables: Variables }>();

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

function canManageDay(role: Role): boolean {
  return role === 'Owner' || role === 'Manager';
}

/**
 * Project an immutable v2 shift-summary snapshot into the shape the Shift Summary
 * view consumes (legacy-compatible field names + enriched nozzle/handover/txn
 * data). The stored snapshot remains the canonical financial record; this is a
 * read-time presentation projection.
 */
async function projectShiftSummary(
  db: DbClient,
  shift: typeof schema.shifts.$inferSelect,
  rawSnapshot: any,
): Promise<Record<string, unknown>> {
  const snap = rawSnapshot ?? {};
  const recon = snap.reconciliation ?? {};

  const [template] = await db
    .select()
    .from(schema.shiftTemplates)
    .where(eq(schema.shiftTemplates.id, shift.shiftTemplateId))
    .limit(1);

  let closedByName = 'System';
  if (shift.closedBy) {
    const [u] = await db.select().from(schema.users).where(eq(schema.users.id, shift.closedBy)).limit(1);
    closedByName = u?.fullName ?? 'System';
  }
  let openedByName = 'System';
  if (shift.openedBy) {
    const [u] = await db.select().from(schema.users).where(eq(schema.users.id, shift.openedBy)).limit(1);
    openedByName = u?.fullName ?? 'System';
  }

  const nrRows = await db
    .select({ nr: schema.nozzleReadings, nz: schema.nozzles, prod: schema.products })
    .from(schema.nozzleReadings)
    .leftJoin(schema.nozzles, eq(schema.nozzles.id, schema.nozzleReadings.nozzleId))
    .leftJoin(schema.products, eq(schema.products.id, schema.nozzles.productId))
    .where(eq(schema.nozzleReadings.shiftId, shift.id));
  const nozzleReadings = nrRows.map(({ nr, nz, prod }) => ({
    nozzleId: nr.nozzleId,
    nozzleName: nz?.name ?? 'Unknown',
    productName: prod?.name ?? 'Unknown',
    productCode: prod?.code ?? '',
    openingReading: Number(nr.openingReading),
    closingReading: Number(nr.closingReading ?? nr.openingReading),
    volumeSold: Number(nr.volumeSold ?? 0),
    unitPrice: Number(nr.unitPrice ?? 0),
  }));
  const totalVolumeSold = nozzleReadings.reduce((a, r) => a + r.volumeSold, 0) || Number(snap.totalVolume ?? 0);

  const hoRows = await db
    .select({ h: schema.attendantHandovers, userName: schema.users.fullName, duName: schema.dispenserUnits.name })
    .from(schema.attendantHandovers)
    .leftJoin(schema.users, eq(schema.users.id, schema.attendantHandovers.userId))
    .leftJoin(schema.dispenserUnits, eq(schema.dispenserUnits.id, schema.attendantHandovers.duId))
    .where(eq(schema.attendantHandovers.shiftId, shift.id));
  const teRows = await db
    .select({ e: schema.handoverTerminalEntries, label: schema.paymentTerminals.label, provider: schema.paymentTerminals.provider })
    .from(schema.handoverTerminalEntries)
    .leftJoin(schema.paymentTerminals, eq(schema.paymentTerminals.id, schema.handoverTerminalEntries.terminalId))
    .where(eq(schema.handoverTerminalEntries.shiftId, shift.id));
  const handovers = hoRows.map(({ h, userName, duName }) => ({
    ...h,
    attendantName: userName ?? 'Unknown',
    duCode: duName ?? '',
    terminalEntries: teRows
      .filter(({ e }) => e.handoverId === h.id)
      .map(({ e, label, provider }) => ({ ...e, terminalLabel: label ?? 'Unknown', provider: provider ?? null })),
  }));

  // Per-terminal rollup across the shift — aggregates card/UPI per machine AND
  // traces which attendant(s) declared each batch (who handled which POS).
  const terminalBreakdownMap = new Map<string, any>();
  for (const { e, label, provider } of teRows) {
    const ho = handovers.find((h) => h.id === e.handoverId);
    if (!terminalBreakdownMap.has(e.terminalId)) {
      terminalBreakdownMap.set(e.terminalId, {
        terminalId: e.terminalId,
        terminalLabel: label ?? 'Unknown',
        provider: provider ?? null,
        card: 0,
        upi: 0,
        entries: [] as any[],
      });
    }
    const agg = terminalBreakdownMap.get(e.terminalId);
    agg.card += Number(e.cardAmount);
    agg.upi += Number(e.upiAmount);
    agg.entries.push({
      attendantName: ho?.attendantName ?? 'Unknown',
      duCode: ho?.duCode ?? '',
      card: Number(e.cardAmount),
      upi: Number(e.upiAmount),
      batchRef: e.batchRef ?? null,
    });
  }
  const terminalBreakdown = Array.from(terminalBreakdownMap.values());

  const [expenses, purchases, collections] = await Promise.all([
    db.select().from(schema.expenses).where(eq(schema.expenses.shiftId, shift.id)),
    db.select().from(schema.purchases).where(eq(schema.purchases.shiftId, shift.id)),
    db.select().from(schema.collections).where(eq(schema.collections.shiftId, shift.id)),
  ]);

  const openingCash = Number(snap.openingCash ?? shift.openingCash ?? 0);
  const closingCash = Number(snap.closingCash ?? shift.closingCash ?? 0);

  return {
    ...snap,
    shiftId: shift.id,
    templateName: template?.name ?? 'Custom',
    openedAt: shift.openedAt,
    closedAt: shift.closedAt,
    openedBy: shift.openedBy,
    closedBy: shift.closedBy,
    openedByName,
    closedByName,
    openingCash,
    closingCash,
    cashNetChange: closingCash - openingCash,
    nozzleReadings,
    totalVolumeSold,
    handovers,
    terminalBreakdown,
    expenses,
    purchases,
    collections,
    expectedCash: Number(snap.expectedDrawerCash ?? openingCash),
    cashVariance: Number(snap.cashVariance ?? 0),
    cashSalesSum: Number(recon.cashSales ?? 0),
    cashCollectionsSum: Number(recon.cashCollections ?? 0),
    cardCollectionsSum: Number(recon.cardCollections ?? 0),
    upiCollectionsSum: Number(recon.upiCollections ?? 0),
    creditSalesSum: Number(recon.creditCollections ?? 0),
    cashExpensesSum: Number(recon.drawerExpenses ?? 0),
  };
}

// GET /api/shifts/status?stationId=...
shiftsRouter.get('/status', async (c) => {
  const user = c.var.user;
  const stationId = c.req.query('stationId');
  const lite = c.req.query('lite') === 'true';
  if (!stationId) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'stationId is required' } }, 400);
  }
  if (!isAuthorizedForStation(user, { organizationId: user.organizationId, stationId })) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this station' } }, 403);
  }
  const db = c.var.db;
  const orgId = user.organizationId;

  const [station] = await db
    .select()
    .from(schema.stations)
    .where(and(eq(schema.stations.id, stationId), eq(schema.stations.organizationId, orgId)))
    .limit(1);
  if (!station) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Station not found' } }, 404);
  }
  const settings = (station.settings as any) ?? {};
  const graceMinutes = settings.shift_grace_minutes ?? 15;
  const lockGraceDays = settings.shift_lock_grace_days ?? 3;
  const now = Date.now();

  const [businessDay] = await db
    .select()
    .from(schema.businessDays)
    .where(and(eq(schema.businessDays.stationId, stationId), eq(schema.businessDays.status, 'OPEN')))
    .limit(1);

  // --- Active (OPEN) shift, enriched ---
  const [dbActiveShift] = await db
    .select()
    .from(schema.shifts)
    .where(and(eq(schema.shifts.stationId, stationId), eq(schema.shifts.status, 'OPEN')))
    .limit(1);

  let activeShift: any = null;
  if (dbActiveShift) {
    const [template] = await db.select().from(schema.shiftTemplates).where(eq(schema.shiftTemplates.id, dbActiveShift.shiftTemplateId)).limit(1);
    const [openedByUser] = await db.select().from(schema.users).where(eq(schema.users.id, dbActiveShift.openedBy)).limit(1);

    const nozzleReadingRows = await db
      .select({ nr: schema.nozzleReadings, nz: schema.nozzles, prod: schema.products, tnk: schema.tanks, du: schema.dispenserUnits })
      .from(schema.nozzleReadings)
      .leftJoin(schema.nozzles, eq(schema.nozzles.id, schema.nozzleReadings.nozzleId))
      .leftJoin(schema.products, eq(schema.products.id, schema.nozzles.productId))
      .leftJoin(schema.tanks, eq(schema.tanks.id, schema.nozzles.tankId))
      .leftJoin(schema.dispenserUnits, eq(schema.dispenserUnits.id, schema.nozzles.duId))
      .where(eq(schema.nozzleReadings.shiftId, dbActiveShift.id));
    const nozzleReadings = nozzleReadingRows.map(({ nr, nz, prod, tnk, du }) => ({
      ...nr,
      nozzleName: nz?.name ?? 'Unknown',
      productId: nz?.productId ?? null,
      productName: prod?.name ?? 'Unknown',
      productCode: prod?.code ?? 'Unknown',
      tankName: tnk?.name ?? 'Unknown',
      duId: nz?.duId ?? null,
      duName: du?.name ?? 'Unknown',
      duCode: du?.code ?? 'Unknown',
    }));

    // --- Per-attendant attributed sales (for handover reconciliation) ---
    // Non-fuel merchandise sales (any payment method) and pure fleet fuel-on-credit
    // (referenceType CREDIT_SALE, i.e. not the ledger debit of a merchandise credit
    // sale) recorded by each attendant during this shift. These fold into the
    // attendant's expectedSales so their handover variance covers total
    // accountability, not just metered fuel.
    const attributedSaleRows = await db
      .select({
        attendantId: schema.sales.attendantId,
        paymentMethod: schema.sales.paymentMethod,
        total: sql<string>`COALESCE(SUM(${schema.sales.totalAmount}), 0)`,
      })
      .from(schema.sales)
      .where(and(eq(schema.sales.shiftId, dbActiveShift.id), ne(schema.sales.saleType, 'Fuel')))
      .groupBy(schema.sales.attendantId, schema.sales.paymentMethod);

    // Per-(attendant, DU) fuel-on-credit LINE ITEMS declared in the DU handover.
    // These are the credit chits; each handover derives its credit total from
    // its own lines (and the receivable is already metered via the nozzle, so
    // it is NOT added to expectedSales — it sits on the declared side).
    const creditLineRows = await db
      .select({
        ct: schema.customerTransactions,
        customerName: schema.customers.name,
        productName: schema.products.name,
        productCode: schema.products.code,
      })
      .from(schema.customerTransactions)
      .leftJoin(schema.customers, eq(schema.customers.id, schema.customerTransactions.customerId))
      .leftJoin(schema.products, eq(schema.products.id, schema.customerTransactions.productId))
      .where(
        and(
          eq(schema.customerTransactions.shiftId, dbActiveShift.id),
          eq(schema.customerTransactions.transactionType, 'Credit Sale'),
          eq(schema.customerTransactions.referenceType, 'CREDIT_SALE'),
        ),
      );
    const creditByUserDu = new Map<string, any[]>();
    for (const r of creditLineRows) {
      const key = `${r.ct.attendantId ?? ''}::${r.ct.duId ?? ''}`;
      const list = creditByUserDu.get(key) ?? [];
      list.push({
        id: r.ct.id,
        customerId: r.ct.customerId,
        customerName: r.customerName ?? 'Customer',
        vehicleId: r.ct.vehicleId,
        productId: r.ct.productId,
        productName: r.productName ?? null,
        productCode: r.productCode ?? null,
        quantity: r.ct.quantity != null ? Number(r.ct.quantity) : null,
        unitPrice: r.ct.unitPrice != null ? Number(r.ct.unitPrice) : null,
        amount: Number(r.ct.amount),
        notes: r.ct.notes ?? null,
      });
      creditByUserDu.set(key, list);
    }
    const creditSalesFor = (userId: string | null | undefined, duId: string | null | undefined) =>
      creditByUserDu.get(`${userId ?? ''}::${duId ?? ''}`) ?? [];

    // Merchandise (standalone) attribution per attendant. Merchandise reconciles
    // at shift close (drawer), NOT in the DU handover, so expectedExtra carries
    // merchandise only — fuel credit is handled via the credit lines above.
    const attributedMap = new Map<string, { merchandiseCash: number; merchandiseCard: number; merchandiseUpi: number; merchandiseCredit: number; merchandiseTotal: number; expectedExtra: number }>();
    const ensureAttr = (id: string | null) => {
      if (!id) return null;
      let a = attributedMap.get(id);
      if (!a) {
        a = { merchandiseCash: 0, merchandiseCard: 0, merchandiseUpi: 0, merchandiseCredit: 0, merchandiseTotal: 0, expectedExtra: 0 };
        attributedMap.set(id, a);
      }
      return a;
    };
    for (const r of attributedSaleRows) {
      const a = ensureAttr(r.attendantId);
      if (!a) continue;
      const amt = Number(r.total) || 0;
      a.merchandiseTotal += amt;
      if (r.paymentMethod === 'Cash') a.merchandiseCash += amt;
      else if (r.paymentMethod === 'Card') a.merchandiseCard += amt;
      else if (r.paymentMethod === 'UPI') a.merchandiseUpi += amt;
      else if (r.paymentMethod === 'Credit') a.merchandiseCredit += amt;
    }
    for (const a of attributedMap.values()) a.expectedExtra = a.merchandiseTotal;
    const emptyAttr = { merchandiseCash: 0, merchandiseCard: 0, merchandiseUpi: 0, merchandiseCredit: 0, merchandiseTotal: 0, expectedExtra: 0 };
    const attributedFor = (userId: string | null | undefined) => (userId && attributedMap.get(userId)) || emptyAttr;

    const assignmentRows = await db
      .select({ sa: schema.shiftStaffAssignments, staffUser: schema.users, du: schema.dispenserUnits })
      .from(schema.shiftStaffAssignments)
      .leftJoin(schema.users, eq(schema.users.id, schema.shiftStaffAssignments.userId))
      .leftJoin(schema.dispenserUnits, eq(schema.dispenserUnits.id, schema.shiftStaffAssignments.duId))
      .where(eq(schema.shiftStaffAssignments.shiftId, dbActiveShift.id));
    const staffAssignments = assignmentRows.map(({ sa, staffUser, du }) => {
      const creditSales = creditSalesFor(sa.userId, sa.duId);
      return {
        ...sa,
        userName: staffUser?.fullName ?? 'Unknown',
        duName: du?.name ?? 'Unknown',
        duCode: du?.code ?? 'Unknown',
        attributed: attributedFor(sa.userId),
        creditSales,
        creditTotal: creditSales.reduce((s: number, l: any) => s + Number(l.amount), 0),
      };
    });

    const handoverRows = await db.select().from(schema.attendantHandovers).where(eq(schema.attendantHandovers.shiftId, dbActiveShift.id));
    const handoverEntryRows = await db
      .select()
      .from(schema.handoverTerminalEntries)
      .where(eq(schema.handoverTerminalEntries.shiftId, dbActiveShift.id));
    const handovers = handoverRows.map((h) => ({
      ...h,
      terminalEntries: handoverEntryRows.filter((e) => e.handoverId === h.id),
      attributed: attributedFor(h.userId),
      creditSales: creditSalesFor(h.userId, h.duId),
      creditTotal: creditSalesFor(h.userId, h.duId).reduce((s: number, l: any) => s + Number(l.amount), 0),
    }));

    const terminalLinkRows = await db
      .select({ link: schema.shiftTerminalLinks, term: schema.paymentTerminals, du: schema.dispenserUnits })
      .from(schema.shiftTerminalLinks)
      .leftJoin(schema.paymentTerminals, eq(schema.paymentTerminals.id, schema.shiftTerminalLinks.terminalId))
      .leftJoin(schema.dispenserUnits, eq(schema.dispenserUnits.id, schema.shiftTerminalLinks.duId))
      .where(eq(schema.shiftTerminalLinks.shiftId, dbActiveShift.id));
    const terminalLinks = terminalLinkRows.map(({ link, term, du }) => ({
      id: link.id,
      terminalId: link.terminalId,
      duId: link.duId,
      label: term?.label ?? 'Unknown',
      provider: term?.provider ?? null,
      terminalCode: term?.terminalCode ?? null,
      supportsCard: term?.supportsCard ?? true,
      supportsUpi: term?.supportsUpi ?? true,
      duName: du?.name ?? null,
      duCode: du?.code ?? null,
    }));

    activeShift = {
      ...dbActiveShift,
      templateName: template?.name ?? 'Custom',
      openedByName: openedByUser?.fullName ?? 'System',
      nozzleReadings,
      staffAssignments,
      handovers,
      terminalLinks,
    };
  }

  // --- Last non-open shift + its summary ---
  const [dbLastShift] = await db
    .select()
    .from(schema.shifts)
    .where(and(eq(schema.shifts.stationId, stationId), ne(schema.shifts.status, 'OPEN')))
    .orderBy(desc(schema.shifts.closedAt), desc(schema.shifts.createdAt))
    .limit(1);

  let lastShift: any = null;
  let lastDssr: any = null;
  let canReopenLastShift = false;
  let gracePeriodExpiresAt: string | null = null;

  if (dbLastShift) {
    let currentStatus = dbLastShift.status;
    let lockedAt = dbLastShift.lockedAt;
    if (currentStatus === 'CLOSED' && dbLastShift.closedAt) {
      const closedTime = new Date(dbLastShift.closedAt).getTime();
      const lockExpiryTime = closedTime + lockGraceDays * 24 * 60 * 60 * 1000;
      if (now > lockExpiryTime) {
        lockedAt = new Date(lockExpiryTime);
        currentStatus = 'LOCKED';
      } else {
        const reopenExpiryTime = closedTime + graceMinutes * 60 * 1000;
        if (now <= reopenExpiryTime) gracePeriodExpiresAt = new Date(reopenExpiryTime).toISOString();
      }
    }
    const [template] = await db.select().from(schema.shiftTemplates).where(eq(schema.shiftTemplates.id, dbLastShift.shiftTemplateId)).limit(1);
    let closedByName = 'System';
    if (dbLastShift.closedBy) {
      const [closedByUser] = await db.select().from(schema.users).where(eq(schema.users.id, dbLastShift.closedBy)).limit(1);
      closedByName = closedByUser?.fullName ?? 'System';
    }
    if (currentStatus === 'CLOSED' && gracePeriodExpiresAt && canReopenShift(user.role)) canReopenLastShift = true;
    lastShift = { ...dbLastShift, status: currentStatus, lockedAt, templateName: template?.name ?? 'Custom', closedByName };
    const [summary] = await db.select().from(schema.shiftSummaries).where(eq(schema.shiftSummaries.shiftId, dbLastShift.id)).limit(1);
    lastDssr = summary ? { ...summary, snapshotData: await projectShiftSummary(db, dbLastShift, summary.snapshotData) } : null;
  }

  // --- Recent closed (not lock-expired) shifts ---
  const dbClosedShifts = await db
    .select({ shift: schema.shifts, templateName: schema.shiftTemplates.name })
    .from(schema.shifts)
    .leftJoin(schema.shiftTemplates, eq(schema.shifts.shiftTemplateId, schema.shiftTemplates.id))
    .where(and(eq(schema.shifts.stationId, stationId), eq(schema.shifts.status, 'CLOSED')))
    .orderBy(desc(schema.shifts.closedAt));
  const recentClosedShifts: any[] = [];
  for (const item of dbClosedShifts) {
    const s = item.shift;
    if (s.closedAt) {
      const lockExpiryTime = new Date(s.closedAt).getTime() + lockGraceDays * 24 * 60 * 60 * 1000;
      if (now <= lockExpiryTime) recentClosedShifts.push({ ...s, templateName: item.templateName ?? 'Custom' });
    }
  }

  // v2 fields (businessDay, readings) kept alongside legacy-compatible fields.
  const base = {
    businessDay: businessDay ?? null,
    shift: dbActiveShift ?? null,
    readings: activeShift?.nozzleReadings ?? [],
    activeShift,
    lastShift,
    lastDssr,
    canReopenLastShift,
    gracePeriodExpiresAt,
    recentClosedShifts,
  };

  if (lite) {
    return c.json({ success: true, data: base });
  }

  const templates = await db
    .select()
    .from(schema.shiftTemplates)
    .where(and(eq(schema.shiftTemplates.organizationId, orgId), eq(schema.shiftTemplates.isActive, true)));
  const nozzleRows = await db
    .select({ nz: schema.nozzles, prod: schema.products, tnk: schema.tanks })
    .from(schema.nozzles)
    .leftJoin(schema.products, eq(schema.products.id, schema.nozzles.productId))
    .leftJoin(schema.tanks, eq(schema.tanks.id, schema.nozzles.tankId))
    .where(and(eq(schema.nozzles.stationId, stationId), eq(schema.nozzles.organizationId, orgId)));
  const nozzles = nozzleRows.map(({ nz, prod, tnk }) => ({ ...nz, productName: prod?.name ?? 'Unknown', productCode: prod?.code ?? 'Unknown', tankName: tnk?.name ?? 'Unknown' }));
  const staff = await db
    .select()
    .from(schema.users)
    .where(and(eq(schema.users.organizationId, orgId), eq(schema.users.status, 'ACTIVE')));
  const dispensers = await db
    .select()
    .from(schema.dispenserUnits)
    .where(and(eq(schema.dispenserUnits.stationId, stationId), eq(schema.dispenserUnits.status, 'ACTIVE')));

  const terminals = await db
    .select()
    .from(schema.paymentTerminals)
    .where(and(eq(schema.paymentTerminals.stationId, stationId), eq(schema.paymentTerminals.isActive, true)));

  return c.json({ success: true, data: { ...base, templates, nozzles, staff, dispensers, terminals } });
});

// GET /api/shifts/handovers?shiftId=...  (legacy-compatible read)
shiftsRouter.get('/handovers', async (c) => {
  const db = c.var.db;
  const shiftId = c.req.query('shiftId');
  if (!shiftId) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'shiftId is required' } }, 400);
  }
  const rows = await db
    .select({ h: schema.attendantHandovers, userName: schema.users.fullName, duName: schema.dispenserUnits.name })
    .from(schema.attendantHandovers)
    .leftJoin(schema.users, eq(schema.users.id, schema.attendantHandovers.userId))
    .leftJoin(schema.dispenserUnits, eq(schema.dispenserUnits.id, schema.attendantHandovers.duId))
    .where(eq(schema.attendantHandovers.shiftId, shiftId));
  const entryRows = await db
    .select()
    .from(schema.handoverTerminalEntries)
    .where(eq(schema.handoverTerminalEntries.shiftId, shiftId));
  return c.json({ success: true, data: rows.map(({ h, userName, duName }) => ({ ...h, userName: userName ?? 'Unknown', duName: duName ?? 'Unknown', terminalEntries: entryRows.filter((e) => e.handoverId === h.id) })) });
});

// POST /api/shifts/handovers  (legacy-compatible attendant cash/card/UPI/credit declaration)
shiftsRouter.post('/handovers', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  const body = await c.req.json().catch(() => ({}));
  const { shiftId, userId, duId } = body ?? {};
  if (!shiftId || !userId || !duId) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'shiftId, userId and duId are required' } }, 400);
  }
  const [shift] = await db.select().from(schema.shifts).where(eq(schema.shifts.id, shiftId)).limit(1);
  if (!shift || shift.organizationId !== user.organizationId) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Shift not found' } }, 404);
  }
  if (shift.status === 'LOCKED') {
    return c.json({ success: false, error: { code: 'INVARIANT_VIOLATION', message: 'Shift is locked' } }, 409);
  }
  // Per-terminal card/UPI breakdown. When present, the card/UPI aggregates are
  // derived from these rows so the two can never drift apart.
  const terminalEntries: { terminalId: string; duId?: string | null; cardAmount: number; upiAmount: number; batchRef?: string | null }[] =
    Array.isArray(body.terminalEntries) ? body.terminalEntries : [];
  const hasTerminalEntries = terminalEntries.length > 0;
  const derivedCard = terminalEntries.reduce((acc, e) => acc + Number(e.cardAmount ?? 0), 0);
  const derivedUpi = terminalEntries.reduce((acc, e) => acc + Number(e.upiAmount ?? 0), 0);
  const values = {
    organizationId: user.organizationId,
    stationId: shift.stationId,
    shiftId,
    userId,
    duId,
    cashHandedOver: String(body.cashHandedOver ?? 0),
    cardHandedOver: String(hasTerminalEntries ? derivedCard : body.cardHandedOver ?? 0),
    upiHandedOver: String(hasTerminalEntries ? derivedUpi : body.upiHandedOver ?? 0),
    creditHandedOver: String(body.creditHandedOver ?? 0),
    testingVolume: String(body.testingVolume ?? 0),
    expectedSales: String(body.expectedSales ?? 0),
    varianceAmount: String(body.varianceAmount ?? 0),
  };
  // One handover per (shift, user, du): replace if re-declared. Per-terminal
  // entries cascade-delete with the old handover row.
  await db
    .delete(schema.attendantHandovers)
    .where(and(eq(schema.attendantHandovers.shiftId, shiftId), eq(schema.attendantHandovers.userId, userId), eq(schema.attendantHandovers.duId, duId)));
  const [row] = await db.insert(schema.attendantHandovers).values(values).returning();

  if (hasTerminalEntries) {
    await db.insert(schema.handoverTerminalEntries).values(
      terminalEntries
        .filter((e) => e?.terminalId)
        .map((e) => ({
          organizationId: user.organizationId,
          stationId: shift.stationId,
          handoverId: row.id,
          shiftId,
          terminalId: e.terminalId,
          duId: e.duId ?? duId ?? null,
          cardAmount: String(e.cardAmount ?? 0),
          upiAmount: String(e.upiAmount ?? 0),
          batchRef: e.batchRef ?? null,
        })),
    );
  }

  // Persist the closing nozzle readings declared in the handover so the shift
  // close picks up the volumes (volume = closing - opening).
  const readings: { nozzleId: string; closingReading: number }[] = Array.isArray(body.nozzleReadings) ? body.nozzleReadings : [];
  for (const r of readings) {
    if (!r?.nozzleId || r.closingReading == null) continue;
    const [existing] = await db
      .select()
      .from(schema.nozzleReadings)
      .where(and(eq(schema.nozzleReadings.shiftId, shiftId), eq(schema.nozzleReadings.nozzleId, r.nozzleId)))
      .limit(1);
    if (!existing) continue;
    const opening = Number(existing.openingReading);
    const closing = Number(r.closingReading);
    if (closing < opening) continue;
    await db
      .update(schema.nozzleReadings)
      .set({ closingReading: String(closing), volumeSold: String(closing - opening) })
      .where(eq(schema.nozzleReadings.id, existing.id));
  }

  return c.json({ success: true, data: row });
});

// POST /api/shifts/open
shiftsRouter.post('/open', async (c) => {
  const user = c.var.user;
  if (!canOpenShift(user.role)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions to open a shift' } }, 403);
  }
  const body = await c.req.json().catch(() => ({}));
  if (!isAuthorizedForStation(user, { organizationId: user.organizationId, stationId: body?.stationId })) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this station' } }, 403);
  }
  const db = c.var.db;
  const result = await runInTransaction(db, (tx, events) =>
    new OpenShift({
      shifts: new DrizzleShiftRepository(tx),
      businessDays: new DrizzleBusinessDayRepository(tx),
      nozzles: new DrizzleNozzleRepository(tx),
      nozzleReadings: new DrizzleNozzleReadingRepository(tx),
      fuelPrices: new DrizzleFuelPriceRepository(tx),
      events,
    }).execute(body, buildContext(user, { stationId: body?.stationId })),
  );
  return sendResult(c, result);
});

// PUT /api/shifts/readings
shiftsRouter.put('/readings', async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => ({}));
  const db = c.var.db;
  const result = await runInTransaction(db, (tx, events) =>
    new RecordNozzleReadings({
      shifts: new DrizzleShiftRepository(tx),
      nozzleReadings: new DrizzleNozzleReadingRepository(tx),
      events,
    }).execute(body, buildContext(user)),
  );
  return sendResult(c, result);
});

// POST /api/shifts/close
shiftsRouter.post('/close', async (c) => {
  const user = c.var.user;
  if (!canCloseShift(user.role)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions to close a shift' } }, 403);
  }
  const body = await c.req.json().catch(() => ({}));
  const command = { shiftId: body?.shiftId, ...(body?.payload ?? {}) };
  const db = c.var.db;
  const result = await runInTransaction(db, (tx, events) =>
    new CloseShift({
      shifts: new DrizzleShiftRepository(tx),
      nozzles: new DrizzleNozzleRepository(tx),
      nozzleReadings: new DrizzleNozzleReadingRepository(tx),
      reconciliation: new DrizzleShiftReconciliationReader(tx),
      stockMovements: new DrizzleStockMovementWriter(tx),
      summaries: new DrizzleShiftSummaryWriter(tx),
      events,
    }).execute(command, buildContext(user)),
  );
  return sendResult(c, result);
});

// POST /api/shifts/reopen
shiftsRouter.post('/reopen', async (c) => {
  const user = c.var.user;
  if (!canManageDay(user.role)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Only Owners/Managers can reopen a shift' } }, 403);
  }
  const body = await c.req.json().catch(() => ({}));
  const db = c.var.db;
  const result = await runInTransaction(db, (tx, events) =>
    new ReopenShift({
      shifts: new DrizzleShiftRepository(tx),
      summaries: new DrizzleShiftSummaryWriter(tx),
      events,
    }).execute(body, buildContext(user)),
  );
  return sendResult(c, result);
});

// POST /api/shifts/lock
shiftsRouter.post('/lock', async (c) => {
  const user = c.var.user;
  if (!canManageDay(user.role)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Only Owners/Managers can lock a shift' } }, 403);
  }
  const body = await c.req.json().catch(() => ({}));
  const db = c.var.db;
  const result = await runInTransaction(db, (tx, events) =>
    new LockShift({ shifts: new DrizzleShiftRepository(tx), events }).execute(body, buildContext(user)),
  );
  return sendResult(c, result);
});

// POST /api/shifts/business-day/open
shiftsRouter.post('/business-day/open', async (c) => {
  const user = c.var.user;
  if (!canManageDay(user.role)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Only Owners/Managers can open a business day' } }, 403);
  }
  const body = await c.req.json().catch(() => ({}));
  const db = c.var.db;
  const result = await runInTransaction(db, (tx, events) =>
    new OpenBusinessDay({ repository: new DrizzleBusinessDayRepository(tx), events }).execute(body, buildContext(user, { stationId: body?.stationId })),
  );
  return sendResult(c, result);
});

// POST /api/shifts/business-day/close
shiftsRouter.post('/business-day/close', async (c) => {
  const user = c.var.user;
  if (!canManageDay(user.role)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Only Owners/Managers can close a business day' } }, 403);
  }
  const body = await c.req.json().catch(() => ({}));
  const db = c.var.db;
  const result = await runInTransaction(db, (tx, events) =>
    new CloseBusinessDay({ repository: new DrizzleBusinessDayRepository(tx), events }).execute(body, buildContext(user)),
  );
  return sendResult(c, result);
});

// GET /api/shifts/shift-summaries?stationId=...
shiftsRouter.get('/shift-summaries', async (c) => {
  const user = c.var.user;
  const stationId = c.req.query('stationId');
  if (!stationId) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'stationId is required' } }, 400);
  }
  const db = c.var.db;
  const rows = await db
    .select({
      shift: schema.shifts,
      snapshotData: schema.shiftSummaries.snapshotData,
      generatedAt: schema.shiftSummaries.generatedAt,
    })
    .from(schema.shiftSummaries)
    .innerJoin(schema.shifts, eq(schema.shifts.id, schema.shiftSummaries.shiftId))
    .where(and(eq(schema.shifts.stationId, stationId), eq(schema.shifts.organizationId, user.organizationId)))
    .orderBy(desc(schema.shiftSummaries.generatedAt));

  const data = await Promise.all(
    rows.map(async (r) => ({
      shiftId: r.shift.id,
      status: r.shift.status,
      openedAt: r.shift.openedAt,
      closedAt: r.shift.closedAt,
      businessDayId: r.shift.businessDayId,
      generatedAt: r.generatedAt,
      snapshotData: await projectShiftSummary(db, r.shift, r.snapshotData),
    })),
  );
  return c.json({ success: true, data });
});
