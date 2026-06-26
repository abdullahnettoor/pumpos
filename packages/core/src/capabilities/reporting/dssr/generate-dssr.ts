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

function compose(source: DssrSourceData): Record<string, unknown> {
  // --- Fuel (from immutable shift summaries) ---
  let fuelVolume = 0;
  let fuelSalesValue = 0;
  let totalCashVariance = 0;
  const nozzleAgg: Record<string, { nozzleId: string; productId: string | null; totalVolume: number; totalSalesValue: number }> = {};
  const shifts: { shiftId: string; expectedDrawerCash: number; cashVariance: number; totalVolume: number }[] = [];

  for (const s of source.shiftSummaries) {
    const snap = s.snapshot as Record<string, any>;
    fuelVolume += Number(snap.totalVolume ?? 0);
    fuelSalesValue += Number(snap.totalFuelSalesValue ?? 0);
    totalCashVariance += Number(snap.cashVariance ?? 0);
    shifts.push({
      shiftId: s.shiftId,
      expectedDrawerCash: Number(snap.expectedDrawerCash ?? 0),
      cashVariance: Number(snap.cashVariance ?? 0),
      totalVolume: Number(snap.totalVolume ?? 0),
    });
    for (const r of (snap.readings ?? []) as Record<string, any>[]) {
      const key = String(r.nozzleId);
      if (!nozzleAgg[key]) nozzleAgg[key] = { nozzleId: key, productId: r.productId ?? null, totalVolume: 0, totalSalesValue: 0 };
      nozzleAgg[key].totalVolume += Number(r.volumeSold ?? 0);
      nozzleAgg[key].totalSalesValue += Number(r.salesValue ?? 0);
    }
  }

  // --- Merchandise sales (POS) by payment method ---
  const salesByMethod = { Cash: 0, Card: 0, UPI: 0, Credit: 0 } as Record<string, number>;
  for (const sale of source.sales) salesByMethod[sale.paymentMethod] = (salesByMethod[sale.paymentMethod] ?? 0) + sale.totalAmount;
  const merchandiseSalesValue = sum(source.sales.map((s) => s.totalAmount));

  // --- Collections by method ---
  const collectionsByMethod = { Cash: 0, Card: 0, UPI: 0, BankTransfer: 0 } as Record<string, number>;
  for (const col of source.collections) collectionsByMethod[col.paymentMethod] = (collectionsByMethod[col.paymentMethod] ?? 0) + col.amount;

  // --- Expenses (exclude voided), drawer vs business ---
  const liveExpenses = source.expenses.filter((e) => isLive(e.status));
  const drawerExpenses = sum(liveExpenses.filter((e) => e.affectsDrawer).map((e) => e.amount));
  const businessExpenses = sum(liveExpenses.filter((e) => !e.affectsDrawer).map((e) => e.amount));

  // --- Purchases & supplier payments ---
  const purchasesTotal = sum(source.purchases.map((p) => p.amount));
  const drawerSupplierPayments = sum(source.supplierPayments.filter((p) => p.affectsDrawer).map((p) => p.amount));
  const bankSupplierPayments = sum(source.supplierPayments.filter((p) => !p.affectsDrawer).map((p) => p.amount));

  return {
    shiftsIncluded: source.shiftSummaries.length,
    fuel: {
      totalVolume: fuelVolume,
      totalSalesValue: fuelSalesValue,
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
    expenses: { drawer: drawerExpenses, business: businessExpenses, total: drawerExpenses + businessExpenses },
    purchases: { total: purchasesTotal },
    supplierPayments: { drawer: drawerSupplierPayments, bank: bankSupplierPayments, total: drawerSupplierPayments + bankSupplierPayments },
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
