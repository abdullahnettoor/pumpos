import { z } from 'zod';
import { BusinessEvents, err, eventFromContext, notFoundError, ok, validationError } from '../../../kernel/index.js';
import type { EventPublisher, ExecutionContext, Result, UseCase } from '../../../kernel/index.js';
import type { BusinessDayRepository } from '../../station-ops/business-days/index.js';
import type { DssrDataReader, DssrSnapshot, DssrSnapshotRepository, DssrSourceData } from './ports.js';

export interface GenerateDssrCommand {
  businessDayId: string;
  /** Regenerate even if a snapshot already exists (default false — DSSR is immutable). */
  force?: boolean;
}

const schema = z.object({
  businessDayId: z.string().min(1, 'businessDayId is required'),
  force: z.boolean().optional(),
});

export interface GenerateDssrDeps {
  businessDays: BusinessDayRepository;
  snapshots: DssrSnapshotRepository;
  reader: DssrDataReader;
  events: EventPublisher;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const isLive = (status: string) => status !== 'VOIDED';

interface FuelAgg {
  productId: string | null;
  productName: string;
  productCode: string;
  grossVolume: number;
  testingVolume: number;
  netVolume: number;
  salesValue: number;
}

function compose(source: DssrSourceData): Record<string, unknown> {
  // --- Fuel (from immutable shift summaries; net-of-testing drives sales) ---
  let grossVolume = 0;
  let testingVolume = 0;
  let netVolume = 0;
  let fuelSalesValue = 0;
  let totalCashVariance = 0;
  const nozzleAgg: Record<string, FuelAgg & { nozzleId: string; nozzleName: string }> = {};
  const productAgg: Record<string, FuelAgg> = {};
  const shifts: {
    shiftId: string;
    templateName: string | null;
    closedAt: string | null;
    expectedDrawerCash: number;
    cashVariance: number;
    netVolume: number;
  }[] = [];

  for (const s of source.shiftSummaries) {
    const snap = s.snapshot as Record<string, any>;
    const sGross = Number(snap.totalVolume ?? 0);
    const sTesting = Number(snap.totalTesting ?? 0);
    const sNet = Number(snap.totalNetVolume ?? sGross - sTesting);
    grossVolume += sGross;
    testingVolume += sTesting;
    netVolume += sNet;
    fuelSalesValue += Number(snap.totalFuelSalesValue ?? 0);
    totalCashVariance += Number(snap.cashVariance ?? 0);
    shifts.push({
      shiftId: s.shiftId,
      templateName: s.templateName ?? null,
      closedAt: s.closedAt ?? null,
      expectedDrawerCash: Number(snap.expectedDrawerCash ?? 0),
      cashVariance: Number(snap.cashVariance ?? 0),
      netVolume: sNet,
    });
    for (const r of (snap.readings ?? []) as Record<string, any>[]) {
      const gross = Number(r.grossVolume ?? r.volumeSold ?? 0);
      const testing = Number(r.testingVolume ?? 0);
      const net = Number(r.netVolume ?? gross - testing);
      const salesValue = Number(r.salesValue ?? 0);
      const nKey = String(r.nozzleId);
      const pKey = r.productId ? String(r.productId) : 'unknown';
      const prod = source.products[pKey];
      const productName = prod?.name ?? 'Unknown';
      const productCode = prod?.code ?? '';
      if (!nozzleAgg[nKey]) {
        nozzleAgg[nKey] = {
          nozzleId: nKey,
          nozzleName: source.nozzles[nKey] ?? 'Unknown',
          productId: r.productId ?? null,
          productName,
          productCode,
          grossVolume: 0,
          testingVolume: 0,
          netVolume: 0,
          salesValue: 0,
        };
      }
      nozzleAgg[nKey].grossVolume += gross;
      nozzleAgg[nKey].testingVolume += testing;
      nozzleAgg[nKey].netVolume += net;
      nozzleAgg[nKey].salesValue += salesValue;
      if (!productAgg[pKey]) {
        productAgg[pKey] = { productId: r.productId ?? null, productName, productCode, grossVolume: 0, testingVolume: 0, netVolume: 0, salesValue: 0 };
      }
      productAgg[pKey].grossVolume += gross;
      productAgg[pKey].testingVolume += testing;
      productAgg[pKey].netVolume += net;
      productAgg[pKey].salesValue += salesValue;
    }
  }

  // --- Merchandise sales (POS) by payment method ---
  const salesByMethod = { Cash: 0, Card: 0, UPI: 0, Credit: 0 } as Record<string, number>;
  for (const sale of source.sales) salesByMethod[sale.paymentMethod] = (salesByMethod[sale.paymentMethod] ?? 0) + sale.totalAmount;
  const merchandiseSalesValue = sum(source.sales.map((s) => s.totalAmount));

  // --- Collections by method ---
  const collectionsByMethod = { Cash: 0, Card: 0, UPI: 0, BankTransfer: 0 } as Record<string, number>;
  for (const col of source.collections) collectionsByMethod[col.paymentMethod] = (collectionsByMethod[col.paymentMethod] ?? 0) + col.amount;

  // --- Credit receivables created today, split normal vs fleet ---
  let normalCredit = 0;
  let fleetCredit = 0;
  for (const cs of source.creditSales) {
    if ((cs.customerType || '').toLowerCase() === 'fleet') fleetCredit += cs.amount;
    else normalCredit += cs.amount;
  }

  // --- Expenses (exclude voided), drawer vs business ---
  const liveExpenses = source.expenses.filter((e) => isLive(e.status));
  const drawerExpenses = sum(liveExpenses.filter((e) => e.affectsDrawer).map((e) => e.amount));
  const businessExpenses = sum(liveExpenses.filter((e) => !e.affectsDrawer).map((e) => e.amount));

  // --- Purchases & supplier payments ---
  const purchasesTotal = sum(source.purchases.map((p) => p.amount));
  const drawerSupplierPayments = sum(source.supplierPayments.filter((p) => p.affectsDrawer).map((p) => p.amount));
  const bankSupplierPayments = sum(source.supplierPayments.filter((p) => !p.affectsDrawer).map((p) => p.amount));

  // --- Tank dip / stock variance, split by unit basis (fuel = volume in L,
  // merchandise = item count) so the two never share a confusing unit column. ---
  const withStatus = (v: DssrSourceData['stockVariances'][number]) => ({
    ...v,
    status: v.varianceQuantity < 0 ? 'Loss' : v.varianceQuantity > 0 ? 'Gain' : 'OK',
  });
  const fuelStockVariance = source.stockVariances.filter((v) => v.inventoryType === 'BULK').map(withStatus);
  const merchandiseStockVariance = source.stockVariances.filter((v) => v.inventoryType !== 'BULK').map(withStatus);

  return {
    shiftsIncluded: source.shiftSummaries.length,
    fuel: {
      // `totalVolume` kept = gross, for back-compat; net drives sales value.
      totalVolume: grossVolume,
      totalGrossVolume: grossVolume,
      totalTestingVolume: testingVolume,
      totalNetVolume: netVolume,
      totalSalesValue: fuelSalesValue,
      byProduct: Object.values(productAgg),
      nozzles: Object.values(nozzleAgg),
    },
    merchandise: {
      salesValue: merchandiseSalesValue,
      byPaymentMethod: salesByMethod,
    },
    collections: {
      ...collectionsByMethod,
      total: sum(source.collections.map((c) => c.amount)),
    },
    credit: {
      normalCredit,
      fleetCredit,
      total: normalCredit + fleetCredit,
    },
    expenses: { drawer: drawerExpenses, business: businessExpenses, total: drawerExpenses + businessExpenses },
    purchases: { total: purchasesTotal },
    supplierPayments: { drawer: drawerSupplierPayments, bank: bankSupplierPayments, total: drawerSupplierPayments + bankSupplierPayments },
    fuelStockVariance,
    merchandiseStockVariance,
    drawer: { totalCashVariance },
    shifts,
  };
}

/**
 * Generate the Daily Station Sales Report — an immutable snapshot of a business
 * day composed from its closed-shift summaries plus all business-day-anchored
 * financials. Idempotent: re-running returns the existing snapshot unless
 * `force` is set. Run inside runInTransaction.
 */
export class GenerateDssr implements UseCase<GenerateDssrCommand, DssrSnapshot> {
  constructor(private readonly deps: GenerateDssrDeps) {}

  async execute(input: GenerateDssrCommand, ctx: ExecutionContext): Promise<Result<DssrSnapshot>> {
    const p = schema.safeParse(input);
    if (!p.success) return err(validationError('Invalid GenerateDssr command', { issues: p.error.flatten() }));

    const businessDay = await this.deps.businessDays.findById(p.data.businessDayId);
    if (!businessDay || businessDay.organizationId !== ctx.organizationId) return err(notFoundError('BusinessDay', p.data.businessDayId));

    const existing = await this.deps.snapshots.findByStationDate(ctx.organizationId, businessDay.stationId, businessDay.businessDate);
    if (existing && !p.data.force) return ok(existing);

    const source = await this.deps.reader.readBusinessDay(businessDay.id);
    const now = ctx.clock.now().toISOString();
    const snapshotData: Record<string, unknown> = {
      generatedAt: now,
      businessDayId: businessDay.id,
      businessDate: businessDay.businessDate,
      stationId: businessDay.stationId,
      organizationId: ctx.organizationId,
      status: businessDay.status,
      ...compose(source),
    };

    const snapshot: DssrSnapshot = {
      id: existing?.id ?? ctx.ids.newId(),
      organizationId: ctx.organizationId,
      stationId: businessDay.stationId,
      businessDate: businessDay.businessDate,
      snapshotData,
      generatedAt: now,
    };
    await this.deps.snapshots.save(snapshot);

    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.DSSR_GENERATED,
        aggregateType: 'BusinessDay',
        aggregateId: businessDay.id,
        stationId: businessDay.stationId,
        businessDayId: businessDay.id,
        payload: { businessDayId: businessDay.id, businessDate: businessDay.businessDate, shiftsIncluded: source.shiftSummaries.length },
      }),
    ]);

    return ok(snapshot);
  }
}
