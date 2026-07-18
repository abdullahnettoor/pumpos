import { Hono } from 'hono';
import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { schema, type DbClient } from '@pump/db';
import { canOpenShift, canCloseShift, canReopenShift, isAuthorizedForStation, isAttendant, type Role } from '@pump/shared';
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
import { loadStationClock } from '../infra/station-clock.js';
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
  DrizzleCreditSalesReader,
  DrizzleStockMovementWriter,
  DrizzleShiftSummaryWriter,
} from '../infra/repositories/station-ops-repositories.js';
import { LedgerPostingService } from '../infra/ledger-posting.js';

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

  // Fetch every independent slice in ONE parallel batch instead of ~8 serial
  // round-trips (the Hyperdrive latency was stacking to multi-second responses).
  const [
    templateRows,
    closedUserRows,
    openedUserRows,
    nrRows,
    hoRows,
    teRows,
    expenses,
    purchases,
    collections,
    creditSaleRows,
  ] = await Promise.all([
    db.select().from(schema.shiftTemplates).where(eq(schema.shiftTemplates.id, shift.shiftTemplateId)).limit(1),
    shift.closedBy
      ? db.select().from(schema.users).where(eq(schema.users.id, shift.closedBy)).limit(1)
      : Promise.resolve([] as any[]),
    shift.openedBy
      ? db.select().from(schema.users).where(eq(schema.users.id, shift.openedBy)).limit(1)
      : Promise.resolve([] as any[]),
    db
      .select({ nr: schema.nozzleReadings, nz: schema.nozzles, prod: schema.products })
      .from(schema.nozzleReadings)
      .leftJoin(schema.nozzles, eq(schema.nozzles.id, schema.nozzleReadings.nozzleId))
      .leftJoin(schema.products, eq(schema.products.id, schema.nozzles.productId))
      .where(eq(schema.nozzleReadings.shiftId, shift.id)),
    db
      .select({ h: schema.attendantHandovers, userName: schema.users.fullName, duName: schema.dispenserUnits.name, duCode: schema.dispenserUnits.code })
      .from(schema.attendantHandovers)
      .leftJoin(schema.users, eq(schema.users.id, schema.attendantHandovers.userId))
      .leftJoin(schema.dispenserUnits, eq(schema.dispenserUnits.id, schema.attendantHandovers.duId))
      .where(eq(schema.attendantHandovers.shiftId, shift.id)),
    db
      .select({ e: schema.handoverTerminalEntries, label: schema.paymentTerminals.label, provider: schema.paymentTerminals.provider })
      .from(schema.handoverTerminalEntries)
      .leftJoin(schema.paymentTerminals, eq(schema.paymentTerminals.id, schema.handoverTerminalEntries.terminalId))
      .where(eq(schema.handoverTerminalEntries.shiftId, shift.id)),
    db
      .select({ e: schema.expenses, categoryName: schema.expenseCategories.name })
      .from(schema.expenses)
      .leftJoin(schema.expenseCategories, eq(schema.expenseCategories.id, schema.expenses.categoryId))
      .where(eq(schema.expenses.shiftId, shift.id)),
    db.select({ p: schema.purchases, supplierName: schema.suppliers.name })
      .from(schema.purchases)
      .leftJoin(schema.suppliers, eq(schema.suppliers.id, schema.purchases.supplierId))
      .where(eq(schema.purchases.shiftId, shift.id)),
    db.select().from(schema.collections).where(eq(schema.collections.shiftId, shift.id)),
    db
      .select({
        id: schema.customerTransactions.id,
        amount: schema.customerTransactions.amount,
        quantity: schema.customerTransactions.quantity,
        unitPrice: schema.customerTransactions.unitPrice,
        notes: schema.customerTransactions.notes,
        duId: schema.customerTransactions.duId,
        attendantId: schema.customerTransactions.attendantId,
        customerId: schema.customerTransactions.customerId,
        vehicleId: schema.customerTransactions.vehicleId,
        productId: schema.customerTransactions.productId,
        customerName: schema.customers.name,
        productName: schema.products.name,
        productCode: schema.products.code,
        unit: schema.products.unit,
        vehicleNumber: schema.customerVehicles.registrationNumber,
      })
      .from(schema.customerTransactions)
      .leftJoin(schema.customers, eq(schema.customers.id, schema.customerTransactions.customerId))
      .leftJoin(schema.products, eq(schema.products.id, schema.customerTransactions.productId))
      .leftJoin(schema.customerVehicles, eq(schema.customerVehicles.id, schema.customerTransactions.vehicleId))
      .where(
        and(
          eq(schema.customerTransactions.shiftId, shift.id),
          eq(schema.customerTransactions.transactionType, 'Credit Sale'),
          eq(schema.customerTransactions.referenceType, 'CREDIT_SALE'),
        ),
      ),
  ]);

  const template = templateRows[0];
  const closedByName = closedUserRows[0]?.fullName ?? 'System';
  const openedByName = openedUserRows[0]?.fullName ?? 'System';
  const expensesEnriched = (expenses ?? []).map((r: any) => ({ ...r.e, categoryName: r.categoryName ?? 'General' }));
  const purchasesEnriched = (purchases ?? []).map((r: any) => ({ ...r.p, supplierName: r.supplierName ?? 'Unknown Supplier' }));
  const nozzleReadings = nrRows.map(({ nr, nz, prod }) => {
    const gross = Number(nr.volumeSold ?? 0);
    const testing = Math.min(Math.max(Number(nr.testingVolume ?? 0), 0), gross);
    return {
      nozzleId: nr.nozzleId,
      nozzleName: nz?.name ?? 'Unknown',
      productName: prod?.name ?? 'Unknown',
      productCode: prod?.code ?? '',
      openingReading: Number(nr.openingReading),
      closingReading: Number(nr.closingReading ?? nr.openingReading),
      volumeSold: gross,
      testingVolume: testing,
      netVolume: gross - testing,
      unitPrice: Number(nr.unitPrice ?? 0),
      unit: prod?.unit ?? 'L',
    };
  });
  // Natural nozzle order (N1, N2, ... N10) for the summary tables.
  nozzleReadings.sort((a, b) => String(a.nozzleName).localeCompare(String(b.nozzleName), undefined, { numeric: true }));
  const totalTestingVolume = nozzleReadings.reduce((a, r) => a + r.testingVolume, 0);
  const totalNetVolumeSold = nozzleReadings.reduce((a, r) => a + r.netVolume, 0) || Number(snap.totalNetVolume ?? 0);
  const totalVolumeSold = nozzleReadings.reduce((a, r) => a + r.volumeSold, 0) || Number(snap.totalVolume ?? 0);

  // Product-wise fuel sales (aggregate nozzles by product) for the summary.
  const fuelByProductMap = new Map<string, { productName: string; productCode: string; unit: string; grossVolume: number; testingVolume: number; netVolume: number; salesValue: number }>();
  for (const r of nozzleReadings) {
    const key = r.productCode || r.productName;
    if (!fuelByProductMap.has(key)) {
      fuelByProductMap.set(key, { productName: r.productName, productCode: r.productCode, unit: r.unit, grossVolume: 0, testingVolume: 0, netVolume: 0, salesValue: 0 });
    }
    const agg = fuelByProductMap.get(key)!;
    agg.grossVolume += r.volumeSold;
    agg.testingVolume += r.testingVolume;
    agg.netVolume += r.netVolume;
    agg.salesValue += r.netVolume * r.unitPrice;
  }
  const fuelByProduct = Array.from(fuelByProductMap.values());

  const handovers = hoRows.map(({ h, userName, duName, duCode }) => ({
    ...h,
    attendantName: userName ?? 'Unknown',
    duCode: duCode ?? duName ?? '',
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

  const openingCash = Number(snap.openingCash ?? shift.openingCash ?? 0);
  const closingCash = Number(snap.closingCash ?? shift.closingCash ?? 0);

  // Non-cash collection channels, summed LIVE from this shift's collection rows
  // (card / UPI / bank transfer). Bank-deposited collections never touched the
  // drawer and were previously not surfaced; "Credit" is not a collection method
  // (collections are Cash | Card | UPI | BankTransfer), which is why the old
  // "creditCollections" figure was always zero.
  const collSum = (method: string) =>
    (collections ?? []).reduce((s: number, c: any) => s + (c.paymentMethod === method ? Number(c.amount || 0) : 0), 0);

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
    fuelByProduct,
    totalVolumeSold,
    totalTestingVolume,
    totalNetVolumeSold,
    handovers,
    terminalBreakdown,
    expenses: expensesEnriched,
    purchases: purchasesEnriched,
    collections,
    creditSales: (creditSaleRows ?? []).map((r: any) => ({
      id: r.id,
      amount: Number(r.amount),
      quantity: r.quantity != null ? Number(r.quantity) : null,
      unitPrice: r.unitPrice != null ? Number(r.unitPrice) : null,
      notes: r.notes ?? null,
      duId: r.duId ?? null,
      attendantId: r.attendantId ?? null,
      customerId: r.customerId,
      vehicleId: r.vehicleId ?? null,
      productId: r.productId ?? null,
      customerName: r.customerName ?? 'Customer',
      productName: r.productName ?? null,
      productCode: r.productCode ?? null,
      unit: r.unit ?? 'L',
      vehicleNumber: r.vehicleNumber ?? null,
    })),
    creditSalesTotal: (creditSaleRows ?? []).reduce((sum: number, r: any) => sum + Number(r.amount), 0),
    expectedCash: Number(snap.expectedDrawerCash ?? openingCash),
    cashVariance: Number(snap.cashVariance ?? 0),
    cashSalesSum: Number(recon.cashSales ?? 0),
    cashCollectionsSum: Number(recon.cashCollections ?? collSum('Cash')),
    cardCollectionsSum: collSum('Card'),
    upiCollectionsSum: collSum('UPI'),
    bankCollectionsSum: collSum('BankTransfer'),
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

  // Business day + active shift are independent — fetch together.
  const [businessDayRows, activeShiftRows] = await Promise.all([
    db
      .select()
      .from(schema.businessDays)
      .where(and(eq(schema.businessDays.stationId, stationId), eq(schema.businessDays.status, 'OPEN')))
      .orderBy(desc(schema.businessDays.businessDate))
      .limit(1),
    db
      .select()
      .from(schema.shifts)
      .where(and(eq(schema.shifts.stationId, stationId), eq(schema.shifts.status, 'OPEN')))
      .limit(1),
  ]);
  const businessDay = businessDayRows[0];
  const dbActiveShift = activeShiftRows[0];

  let activeShift: any = null;
  if (dbActiveShift) {
    const [templateRows2, openedByRows2, nozzleReadingRows] = await Promise.all([
      db.select().from(schema.shiftTemplates).where(eq(schema.shiftTemplates.id, dbActiveShift.shiftTemplateId)).limit(1),
      db.select().from(schema.users).where(eq(schema.users.id, dbActiveShift.openedBy)).limit(1),
      db
        .select({ nr: schema.nozzleReadings, nz: schema.nozzles, prod: schema.products, tnk: schema.tanks, du: schema.dispenserUnits })
        .from(schema.nozzleReadings)
        .leftJoin(schema.nozzles, eq(schema.nozzles.id, schema.nozzleReadings.nozzleId))
        .leftJoin(schema.products, eq(schema.products.id, schema.nozzles.productId))
        .leftJoin(schema.tanks, eq(schema.tanks.id, schema.nozzles.tankId))
        .leftJoin(schema.dispenserUnits, eq(schema.dispenserUnits.id, schema.nozzles.duId))
        .where(eq(schema.nozzleReadings.shiftId, dbActiveShift.id)),
    ]);
    const template = templateRows2[0];
    const openedByUser = openedByRows2[0];

    const nozzleReadings = nozzleReadingRows.map(({ nr, nz, prod, tnk, du }) => ({
      ...nr,
      nozzleName: nz?.name ?? 'Unknown',
      productId: nz?.productId ?? null,
      productName: prod?.name ?? 'Unknown',
      productCode: prod?.code ?? 'Unknown',
      unit: prod?.unit ?? 'L',
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
    const [
      attributedSaleRows,
      creditLineRows,
      assignmentRows,
      handoverRows,
      handoverEntryRows,
      terminalLinkRows,
    ] = await Promise.all([
      db
        .select({
          attendantId: schema.sales.attendantId,
          paymentMethod: schema.sales.paymentMethod,
          total: sql<string>`COALESCE(SUM(${schema.sales.totalAmount}), 0)`,
          nonCash: sql<string>`COALESCE(SUM(${schema.sales.nonCashAmount}), 0)`,
        })
        .from(schema.sales)
        .where(and(eq(schema.sales.shiftId, dbActiveShift.id), ne(schema.sales.saleType, 'Fuel')))
        .groupBy(schema.sales.attendantId, schema.sales.paymentMethod),
      db
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
        ),
      db
        .select({ sa: schema.shiftStaffAssignments, staffUser: schema.users, du: schema.dispenserUnits })
        .from(schema.shiftStaffAssignments)
        .leftJoin(schema.users, eq(schema.users.id, schema.shiftStaffAssignments.userId))
        .leftJoin(schema.dispenserUnits, eq(schema.dispenserUnits.id, schema.shiftStaffAssignments.duId))
        .where(eq(schema.shiftStaffAssignments.shiftId, dbActiveShift.id)),
      db.select().from(schema.attendantHandovers).where(eq(schema.attendantHandovers.shiftId, dbActiveShift.id)),
      db
        .select()
        .from(schema.handoverTerminalEntries)
        .where(eq(schema.handoverTerminalEntries.shiftId, dbActiveShift.id)),
      db
        .select({ link: schema.shiftTerminalLinks, term: schema.paymentTerminals, du: schema.dispenserUnits })
        .from(schema.shiftTerminalLinks)
        .leftJoin(schema.paymentTerminals, eq(schema.paymentTerminals.id, schema.shiftTerminalLinks.terminalId))
        .leftJoin(schema.dispenserUnits, eq(schema.dispenserUnits.id, schema.shiftTerminalLinks.duId))
        .where(eq(schema.shiftTerminalLinks.shiftId, dbActiveShift.id)),
    ]);

    // Per-(attendant, DU) fuel-on-credit LINE ITEMS declared in the DU handover.
    // These are the credit chits; each handover derives its credit total from
    // its own lines (and the receivable is already metered via the nozzle, so
    // it is NOT added to expectedSales — it sits on the declared side).
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
      const nonCash = Number(r.nonCash) || 0;
      a.merchandiseTotal += amt;
      if (r.paymentMethod === 'Cash') {
        // Option B: a cash-recorded merch sale may have a non-cash (card/UPI)
        // portion that went to the terminal — only the cash remainder hits the drawer.
        a.merchandiseCash += amt - nonCash;
        a.merchandiseCard += nonCash;
      } else if (r.paymentMethod === 'Card') a.merchandiseCard += amt;
      else if (r.paymentMethod === 'UPI') a.merchandiseUpi += amt;
      else if (r.paymentMethod === 'Credit') a.merchandiseCredit += amt;
    }
    // Only the cash the attendant actually holds folds into their handover expected.
    for (const a of attributedMap.values()) a.expectedExtra = a.merchandiseCash;
    const emptyAttr = { merchandiseCash: 0, merchandiseCard: 0, merchandiseUpi: 0, merchandiseCredit: 0, merchandiseTotal: 0, expectedExtra: 0 };
    const attributedFor = (userId: string | null | undefined) => (userId && attributedMap.get(userId)) || emptyAttr;

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

    const handovers = handoverRows.map((h) => ({
      ...h,
      attendantName: assignmentRows.find((a) => a.sa.userId === h.userId)?.staffUser?.fullName ?? 'Attendant',
      duName: assignmentRows.find((a) => a.du?.id === h.duId)?.du?.name ?? null,
      terminalEntries: handoverEntryRows.filter((e) => e.handoverId === h.id),
      attributed: attributedFor(h.userId),
      creditSales: creditSalesFor(h.userId, h.duId),
      creditTotal: creditSalesFor(h.userId, h.duId).reduce((s: number, l: any) => s + Number(l.amount), 0),
    }));

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

    // Merchandise tracker data folded into the status payload so the panel
    // renders without a second round-trip (mirrors the /merchandise-handovers
    // and /merchandise-sales endpoints; the panel seeds its queries from these).
    const [merchHandoverRows, merchandiseSales] = lite
      ? [[] as any[], [] as any[]]
      : await Promise.all([
          db
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
            .where(and(eq(schema.sales.shiftId, dbActiveShift.id), eq(schema.sales.captureMechanism, 'MERCH_HANDOVER')))
            .orderBy(desc(schema.sales.createdAt)),
          db
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
            .where(and(eq(schema.sales.shiftId, dbActiveShift.id), ne(schema.sales.saleType, 'Fuel'), ne(schema.sales.captureMechanism, 'MERCH_HANDOVER')))
            .orderBy(desc(schema.sales.createdAt)),
        ]);
    const merchSaleIds = merchHandoverRows.map((h) => h.id);
    const merchItemRows = merchSaleIds.length
      ? await db
          .select({ saleId: schema.saleItems.saleId, productId: schema.saleItems.productId, productName: schema.products.name, quantity: schema.saleItems.quantity, unitPrice: schema.saleItems.unitPrice, lineTotal: schema.saleItems.lineTotal })
          .from(schema.saleItems)
          .leftJoin(schema.products, eq(schema.products.id, schema.saleItems.productId))
          .where(inArray(schema.saleItems.saleId, merchSaleIds))
      : [];
    const merchItemsBySale = merchItemRows.reduce((acc: Record<string, any[]>, it) => { (acc[it.saleId] ||= []).push(it); return acc; }, {});
    const merchandiseHandovers = merchHandoverRows.map((h) => ({ ...h, items: merchItemsBySale[h.id] ?? [] }));

    activeShift = {
      ...dbActiveShift,
      templateName: template?.name ?? 'Custom',
      openedByName: openedByUser?.fullName ?? 'System',
      nozzleReadings,
      staffAssignments,
      handovers,
      terminalLinks,
      merchandiseHandovers,
      merchandiseSales,
      // Authoritative cash reconciliation (same figures CloseShift will use), so
      // the closing wizard's expected drawer includes non-attendant merch cash
      // and reads the true station-level short/surplus. Skipped in lite mode.
      reconciliation: lite ? undefined : await new DrizzleShiftReconciliationReader(db).totalsForShift(dbActiveShift.id),
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
    const [lastTemplateRows, lastClosedByRows, lastSummaryRows] = await Promise.all([
      db.select().from(schema.shiftTemplates).where(eq(schema.shiftTemplates.id, dbLastShift.shiftTemplateId)).limit(1),
      dbLastShift.closedBy
        ? db.select().from(schema.users).where(eq(schema.users.id, dbLastShift.closedBy)).limit(1)
        : Promise.resolve([] as any[]),
      db.select().from(schema.shiftSummaries).where(eq(schema.shiftSummaries.shiftId, dbLastShift.id)).limit(1),
    ]);
    const template = lastTemplateRows[0];
    const closedByName = lastClosedByRows[0]?.fullName ?? 'System';
    const summary = lastSummaryRows[0];
    if (currentStatus === 'CLOSED' && gracePeriodExpiresAt && canReopenShift(user.role) && !dbActiveShift) canReopenLastShift = true;
    lastShift = { ...dbLastShift, status: currentStatus, lockedAt, templateName: template?.name ?? 'Custom', closedByName };
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
  const nozzles = nozzleRows.map(({ nz, prod, tnk }) => ({ ...nz, productName: prod?.name ?? 'Unknown', productCode: prod?.code ?? 'Unknown', unit: prod?.unit ?? 'L', tankName: tnk?.name ?? 'Unknown' }));
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

// GET /api/shifts/my-assignment — the caller's own active shift assignment(s):
// assigned dispenser unit(s), their nozzles (opening readings) + linked
// terminals, and any existing draft handover. Self-scoped: only the caller's
// data is ever returned, so it is safe for the restricted Attendant role.
shiftsRouter.get('/my-assignment', async (c) => {
  const db = c.var.db;
  const user = c.var.user;

  // Active (OPEN) shifts where this user is assigned to at least one DU.
  const assignmentRows = await db
    .select({ sa: schema.shiftStaffAssignments, shift: schema.shifts, du: schema.dispenserUnits })
    .from(schema.shiftStaffAssignments)
    .innerJoin(schema.shifts, eq(schema.shifts.id, schema.shiftStaffAssignments.shiftId))
    .leftJoin(schema.dispenserUnits, eq(schema.dispenserUnits.id, schema.shiftStaffAssignments.duId))
    .where(
      and(
        eq(schema.shiftStaffAssignments.userId, user.id),
        eq(schema.shifts.organizationId, user.organizationId),
        eq(schema.shifts.status, 'OPEN'),
      ),
    );

  if (assignmentRows.length === 0) {
    return c.json({ success: true, data: null });
  }

  // An attendant works one active shift at a time; anchor on the first.
  const shift = assignmentRows[0].shift;
  const myRows = assignmentRows.filter((r) => r.sa.shiftId === shift.id && r.sa.duId);
  const duIds = [...new Set(myRows.map((r) => r.sa.duId as string))];

  const [templateRows, stationRows, nozzleRows, terminalRows, myHandovers, myEntries, creditSaleRows] = await Promise.all([
    db.select().from(schema.shiftTemplates).where(eq(schema.shiftTemplates.id, shift.shiftTemplateId)).limit(1),
    db.select().from(schema.stations).where(eq(schema.stations.id, shift.stationId)).limit(1),
    duIds.length
      ? db
          .select({ nr: schema.nozzleReadings, nz: schema.nozzles, prod: schema.products, tnk: schema.tanks })
          .from(schema.nozzleReadings)
          .innerJoin(schema.nozzles, eq(schema.nozzles.id, schema.nozzleReadings.nozzleId))
          .leftJoin(schema.products, eq(schema.products.id, schema.nozzles.productId))
          .leftJoin(schema.tanks, eq(schema.tanks.id, schema.nozzles.tankId))
          .where(and(eq(schema.nozzleReadings.shiftId, shift.id), inArray(schema.nozzles.duId, duIds)))
      : Promise.resolve([] as any[]),
    db
      .select({ link: schema.shiftTerminalLinks, term: schema.paymentTerminals })
      .from(schema.shiftTerminalLinks)
      .leftJoin(schema.paymentTerminals, eq(schema.paymentTerminals.id, schema.shiftTerminalLinks.terminalId))
      .where(eq(schema.shiftTerminalLinks.shiftId, shift.id)),
    db
      .select()
      .from(schema.attendantHandovers)
      .where(and(eq(schema.attendantHandovers.shiftId, shift.id), eq(schema.attendantHandovers.userId, user.id))),
    db.select().from(schema.handoverTerminalEntries).where(eq(schema.handoverTerminalEntries.shiftId, shift.id)),
    db
      .select({ ct: schema.customerTransactions, customerName: schema.customers.name, productName: schema.products.name })
      .from(schema.customerTransactions)
      .leftJoin(schema.customers, eq(schema.customers.id, schema.customerTransactions.customerId))
      .leftJoin(schema.products, eq(schema.products.id, schema.customerTransactions.productId))
      .where(
        and(
          eq(schema.customerTransactions.shiftId, shift.id),
          eq(schema.customerTransactions.attendantId, user.id),
          eq(schema.customerTransactions.transactionType, 'Credit Sale'),
          eq(schema.customerTransactions.referenceType, 'CREDIT_SALE'),
        ),
      ),
  ]);

  const dispenserUnits = duIds.map((duId) => {
    const du = myRows.find((r) => r.sa.duId === duId)?.du;
    const nozzles = (nozzleRows as any[])
      .filter((r) => r.nz.duId === duId)
      .map(({ nr, nz, prod, tnk }) => ({
        nozzleId: nz.id,
        nozzleName: nz.name,
        productId: nz.productId,
        productName: prod?.name ?? 'Unknown',
        productCode: prod?.code ?? null,
        unit: prod?.unit ?? 'L',
        tankName: tnk?.name ?? null,
        openingReading: Number(nr.openingReading),
        closingReading: nr.closingReading != null ? Number(nr.closingReading) : null,
        testingVolume: nr.testingVolume != null ? Number(nr.testingVolume) : null,
        unitPrice: nr.unitPrice != null ? Number(nr.unitPrice) : null,
      }));
    // Only terminals bound to THIS dispenser unit — shift-wide / other-DU
    // machines are not shown to the attendant (mirrors the desktop drawer).
    const terminals = terminalRows
      .filter((r) => r.link.duId === duId)
      .map(({ link, term }) => ({
        terminalId: link.terminalId,
        label: term?.label ?? 'Terminal',
        supportsCard: term?.supportsCard ?? true,
        supportsUpi: term?.supportsUpi ?? true,
      }));
    const handover = myHandovers.find((h) => h.duId === duId) ?? null;
    const terminalEntries = handover ? myEntries.filter((e) => e.handoverId === handover.id) : [];
    const creditSales = (creditSaleRows as any[])
      .filter((r) => r.ct.duId === duId)
      .map(({ ct, customerName, productName }) => ({
        id: ct.id,
        customerId: ct.customerId,
        customerName: customerName ?? 'Customer',
        vehicleId: ct.vehicleId,
        productId: ct.productId,
        productName: productName ?? null,
        quantity: ct.quantity != null ? Number(ct.quantity) : null,
        unitPrice: ct.unitPrice != null ? Number(ct.unitPrice) : null,
        amount: Number(ct.amount),
        notes: ct.notes ?? null,
      }));
    return { duId, duName: du?.name ?? 'Unknown', duCode: du?.code ?? null, nozzles, terminals, handover, terminalEntries, creditSales };
  });

  return c.json({
    success: true,
    data: {
      userId: user.id,
      shift: {
        id: shift.id,
        status: shift.status,
        openedAt: shift.openedAt,
        stationId: shift.stationId,
        templateName: templateRows[0]?.name ?? null,
      },
      station: stationRows[0] ? { id: stationRows[0].id, name: stationRows[0].name, code: stationRows[0].code } : null,
      dispenserUnits,
    },
  });
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
  // Attendants derive userId from their own session, so only shiftId + duId are
  // required from them; operational roles must name the attendant (userId).
  if (!shiftId || !duId || (!userId && !isAttendant(user.role))) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'shiftId, userId and duId are required' } }, 400);
  }
  const [shift] = await db.select().from(schema.shifts).where(eq(schema.shifts.id, shiftId)).limit(1);
  if (!shift || shift.organizationId !== user.organizationId) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Shift not found' } }, 404);
  }
  if (shift.status === 'LOCKED') {
    return c.json({ success: false, error: { code: 'INVARIANT_VIOLATION', message: 'Shift is locked' } }, 409);
  }
  // Caller must be authorized for the shift's station.
  if (!isAuthorizedForStation(user, { organizationId: user.organizationId, stationId: shift.stationId })) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this station' } }, 403);
  }
  // Attendants may only record their OWN handover, and only for a dispenser unit
  // they are assigned to on this shift. Operational roles may record on behalf of
  // any attendant (the userId from the body stands).
  let effectiveUserId: string = userId ?? user.id;
  if (isAttendant(user.role)) {
    effectiveUserId = user.id;
    const [assigned] = await db
      .select({ id: schema.shiftStaffAssignments.id })
      .from(schema.shiftStaffAssignments)
      .where(
        and(
          eq(schema.shiftStaffAssignments.shiftId, shiftId),
          eq(schema.shiftStaffAssignments.userId, user.id),
          eq(schema.shiftStaffAssignments.duId, duId),
        ),
      )
      .limit(1);
    if (!assigned) {
      return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Not assigned to this dispenser unit' } }, 403);
    }
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
    userId: effectiveUserId,
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
    .where(and(eq(schema.attendantHandovers.shiftId, shiftId), eq(schema.attendantHandovers.userId, effectiveUserId), eq(schema.attendantHandovers.duId, duId)));
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
  const readings: { nozzleId: string; closingReading: number; testingVolume?: number }[] = Array.isArray(body.nozzleReadings) ? body.nozzleReadings : [];
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
    const gross = closing - opening;
    const setFields: { closingReading: string; volumeSold: string; testingVolume?: string } = {
      closingReading: String(closing),
      volumeSold: String(gross),
    };
    // Only overwrite testing when the caller explicitly sent a value; otherwise
    // preserve the previously-saved testing (a reading-only re-save must not
    // silently zero the calibration volume).
    if (r.testingVolume !== undefined && r.testingVolume !== null) {
      setFields.testingVolume = String(Math.min(Math.max(Number(r.testingVolume), 0), gross));
    }
    await db
      .update(schema.nozzleReadings)
      .set(setFields)
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
  const clock = await loadStationClock(db, body?.stationId);
  const result = await runInTransaction(db, (tx, events) =>
    new OpenShift({
      shifts: new DrizzleShiftRepository(tx),
      businessDays: new DrizzleBusinessDayRepository(tx),
      nozzles: new DrizzleNozzleRepository(tx),
      nozzleReadings: new DrizzleNozzleReadingRepository(tx),
      fuelPrices: new DrizzleFuelPriceRepository(tx),
      events,
    }).execute(body, buildContext(user, { stationId: body?.stationId, ...clock })),
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
  const result = await runInTransaction(db, async (tx, events) => {
    const r = await new CloseShift({
      shifts: new DrizzleShiftRepository(tx),
      nozzles: new DrizzleNozzleRepository(tx),
      nozzleReadings: new DrizzleNozzleReadingRepository(tx),
      reconciliation: new DrizzleShiftReconciliationReader(tx),
      creditSales: new DrizzleCreditSalesReader(tx),
      stockMovements: new DrizzleStockMovementWriter(tx),
      summaries: new DrizzleShiftSummaryWriter(tx),
      events,
    }).execute(command, buildContext(user));
    if (r.success) {
      const snap = r.data.snapshot as any;
      await new LedgerPostingService(tx).postShiftClose(
        user.organizationId,
        { id: r.data.shift.id, stationId: r.data.shift.stationId, businessDayId: r.data.shift.businessDayId },
        { cashSales: Number(snap?.reconciliation?.cashSales ?? 0) },
      );
    }
    return r;
  });
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
  const result = await runInTransaction(db, async (tx, events) => {
    const r = await new ReopenShift({
      shifts: new DrizzleShiftRepository(tx),
      summaries: new DrizzleShiftSummaryWriter(tx),
      events,
    }).execute(body, buildContext(user));
    // Roll back the shift-close money postings; they will be re-posted on re-close.
    if (r.success && body?.shiftId) await new LedgerPostingService(tx).reverseShiftClose(body.shiftId);
    return r;
  });
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
  const clock = await loadStationClock(db, body?.stationId);
  const result = await runInTransaction(db, (tx, events) =>
    new OpenBusinessDay({ repository: new DrizzleBusinessDayRepository(tx), events }).execute(body, buildContext(user, { stationId: body?.stationId, ...clock })),
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
      businessDate: schema.businessDays.businessDate,
      templateName: schema.shiftTemplates.name,
    })
    .from(schema.shiftSummaries)
    .innerJoin(schema.shifts, eq(schema.shifts.id, schema.shiftSummaries.shiftId))
    .leftJoin(schema.businessDays, eq(schema.businessDays.id, schema.shifts.businessDayId))
    .leftJoin(schema.shiftTemplates, eq(schema.shiftTemplates.id, schema.shifts.shiftTemplateId))
    .where(and(eq(schema.shifts.stationId, stationId), eq(schema.shifts.organizationId, user.organizationId)))
    .orderBy(desc(schema.shiftSummaries.generatedAt));

  const data = await Promise.all(
    rows.map(async (r) => ({
      shiftId: r.shift.id,
      status: r.shift.status,
      openedAt: r.shift.openedAt,
      closedAt: r.shift.closedAt,
      businessDayId: r.shift.businessDayId,
      businessDate: r.businessDate,
      templateName: r.templateName ?? null,
      generatedAt: r.generatedAt,
      snapshotData: await projectShiftSummary(db, r.shift, r.snapshotData),
    })),
  );
  return c.json({ success: true, data });
});
