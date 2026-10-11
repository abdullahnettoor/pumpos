import { CASH_VARIANCE_MODEL_TWO_LEVEL, isTwoLevelVarianceSnapshot } from '@pump/shared';
import { netNozzleVolume, shiftSummaryNetVolume } from './shift-summary-sql.js';
import { sql } from 'drizzle-orm';
import { schema, type DbClient } from '@pump/db';
import { byNaturalField } from '@pump/shared';
import { rowJson, rowJsonNullable } from './sql-json.js';
import {
  creditSaleLinesJson,
  omcCardSalesTotal,
  productSalePaymentsJson,
} from './repositories/shift-recon-sql.js';
import {
  RefreshShiftSummary,
  composeShiftPayments,
  composeShiftProductSales,
  composeShiftTotalSales,
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
          'prod', ${rowJsonNullable(S.products, 'prod')},
          'duName', du.name
        ) ORDER BY nr.created_at, nr.id)
        FROM nozzle_readings nr
        LEFT JOIN nozzles nz ON nz.id = nr.nozzle_id
        LEFT JOIN dispenser_units du ON du.id = nz.du_id
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
      -- Product Sales: every non-fuel sale of the Shift (bulk Handover and billed),
      -- grouped by product id, plus the sales' own total. Tank-linked Fuel sales
      -- are excluded because Fuel Sales come from nozzle readings.
      COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'productId', t.product_id,
          'productName', t.name,
          'productType', t.product_type,
          'quantity', t.quantity,
          'lineTotal', t.line_total
        ) ORDER BY t.name, t.product_id)
        FROM (
          SELECT si.product_id, p.name, p.product_type,
            SUM(si.quantity)::float8 AS quantity,
            SUM(si.line_total)::float8 AS line_total
          FROM sales s
          JOIN sale_items si ON si.sale_id = s.id
          LEFT JOIN products p ON p.id = si.product_id
          WHERE s.shift_id = ${shift.id} AND s.sale_type <> 'Fuel'
          GROUP BY si.product_id, p.name, p.product_type
        ) t), '[]'::jsonb) AS product_rows,
      (SELECT COALESCE(SUM(s.total_amount), 0)::float8 FROM sales s
        WHERE s.shift_id = ${shift.id} AND s.sale_type <> 'Fuel') AS product_total,
      -- Expenses, collections and purchases have no Shift (ADR 0005, #308):
      -- a Shift Summary never shows them.
      ${creditSaleLinesJson(shift.id)} AS credit_rows,
      -- OMC Card Sales settle to the OMC Wallet: their own payment bucket (ADR 0001).
      ${omcCardSalesTotal(shift.id)} AS omc_card_total,
      -- Product Sales no Handover declares (counter staff card/UPI, credit): the
      -- rest of the payment split, so it adds up to total sales.
      ${productSalePaymentsJson(shift.id)} AS product_payments
  `)) as unknown as [Record<string, any>];

  const templateRows = row.template ? [row.template] : [];
  const closedUserRows = row.closed_user ? [row.closed_user] : [];
  const openedUserRows = row.opened_user ? [row.opened_user] : [];
  const nrRows: any[] = row.nr_rows ?? [];
  const hoRows: any[] = row.ho_rows ?? [];
  const teRows: any[] = row.te_rows ?? [];
  const creditSaleRows: any[] = row.credit_rows ?? [];
  const productRows: any[] = row.product_rows ?? [];

  const template = templateRows[0];
  const closedByName = closedUserRows[0]?.fullName ?? 'System';
  const openedByName = openedUserRows[0]?.fullName ?? 'System';
  const nozzleReadings = nrRows.map(({ nr, nz, prod, duName }) => {
    const gross = Math.max(0, Number(nr.volumeSold ?? 0));
    const net = netNozzleVolume(gross, nr.testingVolume);
    const testing = gross - net;
    return {
      nozzleId: nr.nozzleId,
      nozzleName: nz?.name ?? 'Unknown',
      // The Dispenser Unit the nozzle belonged to when the Shift was summarised
      // (null for an unknown nozzle), so the page never maps through today's setup.
      duName: duName ?? null,
      productName: prod?.name ?? 'Unknown',
      productCode: prod?.code ?? '',
      openingReading: Number(nr.openingReading),
      closingReading: Number(nr.closingReading ?? nr.openingReading),
      volumeSold: gross,
      testingVolume: testing,
      netVolume: net,
      unitPrice: Number(nr.unitPrice ?? 0),
      unit: prod?.unit ?? 'L',
    };
  });
  // Natural nozzle order (N1, N2, ... N10) for the summary tables.
  nozzleReadings.sort(byNaturalField((r) => String(r.nozzleName)));
  const totalTestingVolume = nozzleReadings.reduce((a, r) => a + r.testingVolume, 0);
  const totalNetVolumeSold = shiftSummaryNetVolume(snap, nozzleReadings);
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

  // Sales figures every reader of the Shift Summary shares (core compose), so the
  // page, its Shift rows and the day totals can never disagree on "total sales".
  const creditSalesTotal = creditSaleRows.reduce(
    (sum: number, r: any) => sum + Number(r.amount),
    0,
  );
  const fuelSalesValue =
    snap.totalFuelSalesValue != null
      ? Number(snap.totalFuelSalesValue)
      : fuelByProduct.reduce((a, f) => a + f.salesValue, 0);
  const productSales = composeShiftProductSales(productRows, Number(row.product_total ?? 0));
  const payments = composeShiftPayments({
    cashSales: Number(recon.cashSales ?? 0),
    handovers: hoRows.map(({ h }) => h),
    creditSalesTotal,
    omcCardTotal: Number(row.omc_card_total ?? 0),
    productSalePayments: row.product_payments ?? undefined,
  });

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
    creditSalesTotal,
    productSales,
    totalProductSalesValue: productSales.total,
    totalSalesValue: composeShiftTotalSales(fuelSalesValue, productSales.total),
    payments,
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

/** Legacy snapshot fallback shared with DSSR and all aggregate readers. */
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
