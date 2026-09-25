import { CASH_VARIANCE_MODEL_TWO_LEVEL, isTwoLevelVarianceSnapshot } from '@pump/shared';
import { sql } from 'drizzle-orm';
import { schema, type DbClient } from '@pump/db';
import { byNaturalField } from '@pump/shared';
import { rowJson, rowJsonNullable } from './sql-json.js';
import { creditSaleLinesJson } from './repositories/shift-recon-sql.js';
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

  // Fetch every slice in ONE statement (#229): each sub-select renders rows as
  // jsonb in exactly the shape the previous drizzle builders produced (camelCase
  // keys, numerics as strings, ISO timestamps), so the shaping code below is
  // untouched. The former 10-select Promise.all was serialized on the wire by
  // the max:1 driver — ten round-trips inside the close transaction.
  const S = schema;
  const [row] = (await db.execute(sql`
    SELECT
      (SELECT ${rowJson(S.shiftTemplates, 't')} FROM shift_templates t
        WHERE t.id = ${shift.shiftTemplateId}) AS template,
      (SELECT ${rowJson(S.users, 'u')} FROM users u
        WHERE u.id = ${shift.closedBy ?? null}::uuid) AS closed_user,
      (SELECT ${rowJson(S.users, 'u')} FROM users u
        WHERE u.id = ${shift.openedBy ?? null}::uuid) AS opened_user,
      COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'nr', ${rowJson(S.nozzleReadings, 'nr')},
          'nz', ${rowJsonNullable(S.nozzles, 'nz')},
          'prod', ${rowJsonNullable(S.products, 'prod')}
        ) ORDER BY nr.created_at, nr.id)
        FROM nozzle_readings nr
        LEFT JOIN nozzles nz ON nz.id = nr.nozzle_id
        LEFT JOIN products prod ON prod.id = nz.product_id
        WHERE nr.shift_id = ${shift.id}), '[]'::jsonb) AS nr_rows,
      COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'h', ${rowJson(S.attendantHandovers, 'h')},
          'userName', u.full_name,
          'duName', du.name,
          'duCode', du.code
        ) ORDER BY h.created_at, h.id)
        FROM attendant_handovers h
        LEFT JOIN users u ON u.id = h.user_id
        LEFT JOIN dispenser_units du ON du.id = h.du_id
        WHERE h.shift_id = ${shift.id}), '[]'::jsonb) AS ho_rows,
      COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'e', ${rowJson(S.handoverTerminalEntries, 'e')},
          'label', pt.label,
          'provider', pt.provider
        ) ORDER BY e.created_at, e.id)
        FROM handover_terminal_entries e
        LEFT JOIN payment_terminals pt ON pt.id = e.terminal_id
        WHERE e.shift_id = ${shift.id}), '[]'::jsonb) AS te_rows,
      -- Expenses, collections and purchases have no Shift (ADR 0005, #308):
      -- a Shift Summary never shows them.
      ${creditSaleLinesJson(shift.id)} AS credit_rows
  `)) as unknown as [Record<string, any>];

  const templateRows = row.template ? [row.template] : [];
  const closedUserRows = row.closed_user ? [row.closed_user] : [];
  const openedUserRows = row.opened_user ? [row.opened_user] : [];
  const nrRows: any[] = row.nr_rows ?? [];
  const hoRows: any[] = row.ho_rows ?? [];
  const teRows: any[] = row.te_rows ?? [];
  const creditSaleRows: any[] = row.credit_rows ?? [];

  const template = templateRows[0];
  const closedByName = closedUserRows[0]?.fullName ?? 'System';
  const openedByName = openedUserRows[0]?.fullName ?? 'System';
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

  const openingCash = Number(snap.openingCash ?? 0);
  const twoLevel = isTwoLevelVarianceSnapshot(snap);
  const drawers: any[] = Array.isArray(snap.drawers) ? snap.drawers : (recon.drawers ?? []);
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
    fuelByProduct,
    totalVolumeSold,
    totalTestingVolume,
    totalNetVolumeSold,
    handovers,
    terminalBreakdown,
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
    cashDrops: Number(snap.cashDrops ?? 0),
    // Handover drops vs drops recorded at close, shown on separate lines (#287).
    // Pre-#287 snapshots only carry the combined figure: treat it as Handover.
    handoverCashDrops: Number(snap.handoverCashDrops ?? snap.cashDrops ?? 0),
    closeCashDrops: Number(snap.closeCashDrops ?? 0),
    // Per-Drawer reconciliation (ADR 0005, #278).
    drawers,
    // Two-level variance (#287): attendant (Handover) vs office count.
    // Pre-#287 snapshots: cashVariance already includes attendant shortages,
    // so no separate attendant/office split is shown (snapshots are immutable).
    cashVarianceModel: twoLevel ? CASH_VARIANCE_MODEL_TWO_LEVEL : 1,
    attendantVariance: twoLevel ? Number(snap.attendantVariance ?? 0) : null,
    officeCountVariance: twoLevel
      ? Number(snap.officeCountVariance ?? snap.cashVariance ?? 0)
      : null,
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
