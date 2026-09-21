import { and, eq } from 'drizzle-orm';
import { schema, type DbClient } from '@pump/db';
import { byNaturalField } from '@pump/shared';
import {
  RefreshShiftSummary,
  type EventPublisher,
  type Shift,
  type ShiftSummaryProjector,
} from '@pump/core';
import { buildContext } from './context.js';
import type { AuthenticatedPrincipal } from './authenticated-principal.js';
import {
  DrizzleShiftRepository,
  DrizzleShiftSummaryWriter,
} from './repositories/station-ops-repositories.js';

/** The shift fields the projection needs (drizzle row or core Shift entity). */
export interface ProjectableShift {
  id: string;
  shiftTemplateId: string;
  openedBy: string | null;
  closedBy: string | null;
  openedAt: Date | string | null;
  closedAt: Date | string | null;
  openingCash: string | null;
  closingCash: string | null;
}

/**
 * Project an immutable v2 shift-summary snapshot into the shape the Shift Summary
 * view consumes (legacy-compatible field names + enriched nozzle/handover/txn
 * data). The stored snapshot remains the canonical financial record; this is a
 * read-time presentation projection.
 */
export async function projectShiftSummary(
  db: DbClient,
  shift: ProjectableShift,
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
    db
      .select()
      .from(schema.shiftTemplates)
      .where(eq(schema.shiftTemplates.id, shift.shiftTemplateId))
      .limit(1),
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
      .select({
        h: schema.attendantHandovers,
        userName: schema.users.fullName,
        duName: schema.dispenserUnits.name,
        duCode: schema.dispenserUnits.code,
      })
      .from(schema.attendantHandovers)
      .leftJoin(schema.users, eq(schema.users.id, schema.attendantHandovers.userId))
      .leftJoin(schema.dispenserUnits, eq(schema.dispenserUnits.id, schema.attendantHandovers.duId))
      .where(eq(schema.attendantHandovers.shiftId, shift.id)),
    db
      .select({
        e: schema.handoverTerminalEntries,
        label: schema.paymentTerminals.label,
        provider: schema.paymentTerminals.provider,
      })
      .from(schema.handoverTerminalEntries)
      .leftJoin(
        schema.paymentTerminals,
        eq(schema.paymentTerminals.id, schema.handoverTerminalEntries.terminalId),
      )
      .where(eq(schema.handoverTerminalEntries.shiftId, shift.id)),
    db
      .select({ e: schema.expenses, categoryName: schema.expenseCategories.name })
      .from(schema.expenses)
      .leftJoin(
        schema.expenseCategories,
        eq(schema.expenseCategories.id, schema.expenses.categoryId),
      )
      .where(eq(schema.expenses.shiftId, shift.id)),
    db
      .select({ p: schema.purchases, supplierName: schema.suppliers.name })
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
      .leftJoin(
        schema.customerVehicles,
        eq(schema.customerVehicles.id, schema.customerTransactions.vehicleId),
      )
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
  const expensesEnriched = (expenses ?? []).map((r: any) => ({
    ...r.e,
    categoryName: r.categoryName ?? 'General',
  }));
  const purchasesEnriched = (purchases ?? []).map((r: any) => ({
    ...r.p,
    supplierName: r.supplierName ?? 'Unknown Supplier',
  }));
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
  nozzleReadings.sort(byNaturalField((r) => String(r.nozzleName)));
  const totalTestingVolume = nozzleReadings.reduce((a, r) => a + r.testingVolume, 0);
  const totalNetVolumeSold =
    nozzleReadings.reduce((a, r) => a + r.netVolume, 0) || Number(snap.totalNetVolume ?? 0);
  const totalVolumeSold =
    nozzleReadings.reduce((a, r) => a + r.volumeSold, 0) || Number(snap.totalVolume ?? 0);

  // Product-wise fuel sales (aggregate nozzles by product) for the summary.
  const fuelByProductMap = new Map<
    string,
    {
      productName: string;
      productCode: string;
      unit: string;
      grossVolume: number;
      testingVolume: number;
      netVolume: number;
      salesValue: number;
    }
  >();
  for (const r of nozzleReadings) {
    const key = r.productCode || r.productName;
    if (!fuelByProductMap.has(key)) {
      fuelByProductMap.set(key, {
        productName: r.productName,
        productCode: r.productCode,
        unit: r.unit,
        grossVolume: 0,
        testingVolume: 0,
        netVolume: 0,
        salesValue: 0,
      });
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
      .map(({ e, label, provider }) => ({
        ...e,
        terminalLabel: label ?? 'Unknown',
        provider: provider ?? null,
      })),
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
    (collections ?? []).reduce(
      (s: number, c: any) => s + (c.paymentMethod === method ? Number(c.amount || 0) : 0),
      0,
    );

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
    creditSalesTotal: (creditSaleRows ?? []).reduce(
      (sum: number, r: any) => sum + Number(r.amount),
      0,
    ),
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

/** Adapter for the core ShiftSummaryProjector port. */
export class DrizzleShiftSummaryProjector implements ShiftSummaryProjector {
  constructor(private readonly db: DbClient) {}
  project(shift: Shift, baseSnapshot: Record<string, unknown>): Promise<Record<string, unknown>> {
    return projectShiftSummary(this.db, shift, baseSnapshot);
  }
}

/**
 * Refresh a closed shift's stored summary snapshot after a late-attributed
 * transaction. Call inside the SAME runInTransaction as the write, after the
 * use-case succeeded, passing the record's resolved shiftId (or null when the
 * write was business-day-anchored). No-ops for open shifts / missing summaries,
 * so it is safe to call unconditionally. Throws on failure so the enclosing
 * transaction rolls back rather than leaving a stale snapshot committed.
 */
export async function refreshShiftSummaryForShift(
  tx: DbClient,
  events: EventPublisher,
  user: AuthenticatedPrincipal,
  shiftId: string | null | undefined,
): Promise<void> {
  if (!shiftId) return;
  const r = await new RefreshShiftSummary({
    shifts: new DrizzleShiftRepository(tx),
    summaries: new DrizzleShiftSummaryWriter(tx),
    projector: new DrizzleShiftSummaryProjector(tx),
    events,
  }).execute({ shiftId }, buildContext(user));
  if (!r.success) {
    throw new Error(`Failed to refresh shift summary for shift ${shiftId}: ${r.error.message}`);
  }
}
