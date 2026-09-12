import { describe, expect, it } from 'vitest';
import { FixedClock, InMemoryEventStore, InProcessEventDispatcher, SequentialIdGenerator, BusinessEvents } from '../../../kernel/index.js';
import type { ExecutionContext } from '../../../kernel/index.js';
import { GenerateDssr } from './generate-dssr.js';
import { CloseBusinessDayAndGenerateDssr } from './close-business-day.js';
import type { DssrDataReader, DssrSnapshot, DssrSnapshotRepository, DssrSourceData } from './ports.js';
import type { BusinessDay, BusinessDayRepository } from '../../station-ops/business-days/index.js';

class SnapRepo implements DssrSnapshotRepository {
  readonly rows: DssrSnapshot[] = [];
  async findByStationDate(orgId: string, stationId: string, date: string) {
    return this.rows.find((r) => r.organizationId === orgId && r.stationId === stationId && r.businessDate === date) ?? null;
  }
  async save(s: DssrSnapshot) {
    const i = this.rows.findIndex((r) => r.id === s.id);
    if (i >= 0) this.rows[i] = s; else this.rows.push(s);
  }
}
class BdRepo implements BusinessDayRepository {
  constructor(readonly rows: BusinessDay[]) {}
  async findById(id: string) { return this.rows.find((r) => r.id === id) ?? null; }
  async save(day: BusinessDay) {
    const index = this.rows.findIndex((row) => row.id === day.id);
    if (index >= 0) this.rows[index] = day;
  }
  async findOpenByStation() { return null; }
  async findByStationAndDate(orgId: string, stationId: string, date: string) {
    return this.rows.find((row) => row.organizationId === orgId && row.stationId === stationId && row.businessDate === date) ?? null;
  }
}
class Reader implements DssrDataReader {
  constructor(private readonly data: DssrSourceData) {}
  async readBusinessDay() { return this.data; }
}

function ctx(): ExecutionContext {
  return { organizationId: 'org-1', stationId: 'st-1', businessDayId: 'bd-1', actorId: 'u', correlationId: null, clock: new FixedClock(new Date('2026-03-15T20:00:00Z')), ids: new SequentialIdGenerator('d') };
}
function bday(): BusinessDay {
  return { id: 'bd-1', organizationId: 'org-1', stationId: 'st-1', businessDate: '2026-03-15', status: 'CLOSED', openedBy: 'u', openedAt: '', closedBy: 'u', closedAt: '', createdAt: '', updatedAt: '' };
}
function source(): DssrSourceData {
  return {
    shiftSummaries: [
      { shiftId: 'sh-1', snapshot: { totalVolume: 1000, totalTesting: 20, totalNetVolume: 980, totalFuelSalesValue: 98000, expectedDrawerCash: 5000, cashVariance: -50, readings: [{ nozzleId: 'n1', productId: 'p1', grossVolume: 1000, testingVolume: 20, netVolume: 980, salesValue: 98000 }] } },
    ],
    collections: [{ paymentMethod: 'Cash', amount: 2000 }, { paymentMethod: 'UPI', amount: 1000 }],
    expenses: [{ affectsDrawer: true, paidFrom: 'SHIFT_CASH', amount: 300, status: 'ACTIVE' }, { affectsDrawer: false, paidFrom: 'BANK', amount: 5000, status: 'ACTIVE' }, { affectsDrawer: true, paidFrom: 'SHIFT_CASH', amount: 999, status: 'VOIDED' }],
    income: [{ affectsDrawer: true, receivedInto: 'SHIFT_CASH', amount: 500, status: 'ACTIVE', categoryName: 'Tanker Rental' }, { affectsDrawer: false, receivedInto: 'BANK', amount: 1500, status: 'ACTIVE', categoryName: 'Commission', taxCategory: 'GST', taxableAmount: 1271.19, cgst: 114.41, sgst: 114.4, igst: 0, cess: 0 }, { affectsDrawer: true, receivedInto: 'SHIFT_CASH', amount: 999, status: 'VOIDED', categoryName: 'Scrap Sale', taxCategory: 'GST', taxableAmount: 846.61, cgst: 76.19, sgst: 76.2, igst: 0, cess: 0 }],
    purchases: [{ amount: 450000 }],
    supplierPayments: [{ affectsDrawer: false, paidFrom: 'BANK', amount: 200000 }],
    sales: [{ paymentMethod: 'Cash', saleType: 'Product', totalAmount: 500 }, { paymentMethod: 'Credit', saleType: 'Product', totalAmount: 1180 }],
    creditSales: [{ customerType: 'Regular', amount: 1000 }, { customerType: 'Fleet', amount: 4000 }],
    stockVariances: [{ tankName: 'T1', productName: 'Petrol', unit: 'Litre', inventoryType: 'BULK', expectedQuantity: 5000, actualQuantity: 4990, varianceQuantity: -10, reason: null }],
    saleItems: [{ productId: 'p2', quantity: 2, revenue: 1680, taxCategory: 'GST', taxableAmount: 1423.73, cgst: 128.14, sgst: 128.13, igst: 0, vat: 0, cess: 0 }],
    products: { p1: { name: 'Petrol', code: 'MS', costBasis: 88 }, p2: { name: 'Engine Oil', code: 'EO', costBasis: 400 } },
    nozzles: { n1: 'N1' },
  };
}

describe('GenerateDssr', () => {
  it('composes an immutable snapshot from shift summaries + business-day financials', async () => {
    const snapshots = new SnapRepo();
    const store = new InMemoryEventStore();
    const result = await new GenerateDssr({
      businessDays: new BdRepo([bday()]), snapshots, reader: new Reader(source()),
      events: new InProcessEventDispatcher({ store }),
    }).execute({ businessDayId: 'bd-1' }, ctx());
    expect(result.success).toBe(true);
    if (result.success) {
      const d = result.data.snapshotData as any;
      expect(d.shiftsIncluded).toBe(1);
      expect(d.fuel.totalVolume).toBe(1000);
      expect(d.fuel.totalNetVolume).toBe(980);
      expect(d.fuel.totalTestingVolume).toBe(20);
      expect(d.fuel.totalSalesValue).toBe(98000);
      expect(d.fuel.byProduct[0].productName).toBe('Petrol');
      expect(d.fuel.nozzles[0].nozzleName).toBe('N1');
      expect(d.merchandise.salesValue).toBe(1680);
      expect(d.merchandise.byPaymentMethod.Credit).toBe(1180);
      expect(d.collections.Cash).toBe(2000);
      expect(d.collections.total).toBe(3000);
      expect(d.credit.normalCredit).toBe(1000);
      expect(d.credit.fleetCredit).toBe(4000);
      expect(d.expenses.drawer).toBe(300); // voided excluded
      expect(d.expenses.business).toBe(5000);
      expect(d.income.drawer).toBe(500); // voided excluded
      expect(d.income.business).toBe(1500);
      expect(d.income.total).toBe(2000);
      // FI4: only live GST income contributes to the output-GST-on-income lines.
      expect(d.income.tax.entries).toBe(1);
      expect(d.income.tax.taxable).toBe(1271.19);
      expect(d.income.tax.total).toBe(228.81);
      // T5: output GST on merchandise, extracted from the MRP-inclusive line.
      expect(d.salesTax.gst.taxable).toBe(1423.73);
      expect(d.salesTax.gst.total).toBe(256.27);
      expect(d.salesTax.vat.vat).toBe(0);
      expect(d.purchases.total).toBe(450000);
      expect(d.supplierPayments.bank).toBe(200000);
      expect(d.fuelStockVariance[0].status).toBe('Loss');
      expect(d.merchandiseStockVariance.length).toBe(0);
      expect(d.drawer.totalCashVariance).toBe(-50);
      // P&L (FB2): fuel COGS = 980 L × 88; merch COGS = 2 × 400.
      expect(d.pnl.revenueFuel).toBe(98000);
      expect(d.pnl.revenueMerch).toBe(1680);
      expect(d.pnl.revenue).toBe(99680);
      expect(d.pnl.cogsFuel).toBe(86240);
      expect(d.pnl.cogsMerch).toBe(800);
      expect(d.pnl.cogs).toBe(87040);
      expect(d.pnl.grossMargin).toBe(12640);
      expect(d.pnl.expenses).toBe(5300);
      expect(d.pnl.otherIncome).toBe(2000);
      expect(d.pnl.netProfit).toBe(9340);
      // Per-product margin (FB3): fuel 98000 - 86240 = 11760; merch 1680 - 800 = 880.
      expect(d.pnl.byProduct).toHaveLength(2);
      const fuelRow = d.pnl.byProduct.find((r: any) => r.kind === 'fuel');
      const merchRow = d.pnl.byProduct.find((r: any) => r.kind === 'merchandise');
      expect(fuelRow.margin).toBe(11760);
      expect(merchRow.margin).toBe(880);
      expect(d.pnl.byProduct[0].kind).toBe('fuel'); // sorted by margin desc
    }
    expect(store.events.map((e) => e.eventType)).toContain(BusinessEvents.DSSR_GENERATED);
  });

  it('is idempotent — returns the existing snapshot without regenerating', async () => {
    const snapshots = new SnapRepo();
    const deps = {
      businessDays: new BdRepo([bday()]), snapshots, reader: new Reader(source()),
      events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
    };
    const first = await new GenerateDssr(deps).execute({ businessDayId: 'bd-1' }, ctx());
    const second = await new GenerateDssr(deps).execute({ businessDayId: 'bd-1' }, ctx());
    expect(first.success && second.success).toBe(true);
    if (first.success && second.success) expect(second.data.id).toBe(first.data.id);
    expect(snapshots.rows).toHaveLength(1);
  });

  it('rejects an unknown business day', async () => {
    const result = await new GenerateDssr({
      businessDays: new BdRepo([]), snapshots: new SnapRepo(), reader: new Reader(source()),
      events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
    }).execute({ businessDayId: 'nope' }, ctx());
    expect(result.success).toBe(false);
  });

  it('rejects a Business Day from another Station in the execution context', async () => {
    const result = await new GenerateDssr({
      businessDays: new BdRepo([bday()]), snapshots: new SnapRepo(), reader: new Reader(source()),
      events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
    }).execute({ businessDayId: 'bd-1' }, { ...ctx(), stationId: 'station-2' });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
  });

  it('includes a later Business Day Tank Dip without changing its Shift Summary', async () => {
    const data = source();
    data.stockVariances = [];
    const immutableSummary = structuredClone(data.shiftSummaries[0].snapshot);
    data.stockVariances.push({ tankName: 'T2', productName: 'Diesel', unit: 'Litre', inventoryType: 'BULK', expectedQuantity: 8000, actualQuantity: 7990, varianceQuantity: -10, reason: 'Post-close dip' });

    const result = await new GenerateDssr({
      businessDays: new BdRepo([bday()]), snapshots: new SnapRepo(), reader: new Reader(data),
      events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
    }).execute({ businessDayId: 'bd-1' }, ctx());

    expect(result.success).toBe(true);
    if (result.success) expect((result.data.snapshotData as any).fuelStockVariance).toEqual([
      expect.objectContaining({ tankName: 'T2', varianceQuantity: -10, reason: 'Post-close dip' }),
    ]);
    expect(data.shiftSummaries[0].snapshot).toEqual(immutableSummary);
  });
});

describe('CloseBusinessDayAndGenerateDssr', () => {
  const openDay = (): BusinessDay => ({ ...bday(), status: 'OPEN', closedBy: null, closedAt: null });

  it('closes the day and generates its DSSR', async () => {
    const businessDays = new BdRepo([openDay()]);
    const snapshots = new SnapRepo();
    const result = await new CloseBusinessDayAndGenerateDssr({
      businessDays, businessDayLock: { lockStation: async () => {}, lockById: async () => {}, lockByStationAndDate: async () => {} }, openShifts: { hasOpenShift: async () => false }, snapshots, dssrData: new Reader(source()),
      events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
    }).execute({ businessDayId: 'bd-1', stationId: 'st-1' }, ctx());
    expect(result.success).toBe(true);
    expect(businessDays.rows[0].status).toBe('CLOSED');
    expect(snapshots.rows).toHaveLength(1);
  });

  it('rejects closure while the day has an open Shift', async () => {
    const businessDays = new BdRepo([openDay()]);
    const result = await new CloseBusinessDayAndGenerateDssr({
      businessDays, businessDayLock: { lockStation: async () => {}, lockById: async () => {}, lockByStationAndDate: async () => {} }, openShifts: { hasOpenShift: async () => true }, snapshots: new SnapRepo(), dssrData: new Reader(source()),
      events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
    }).execute({ businessDayId: 'bd-1', stationId: 'st-1' }, ctx());
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('INVARIANT_VIOLATION');
    expect(businessDays.rows[0].status).toBe('OPEN');
  });

  it('locks the Business Day before checking for an open Shift', async () => {
    const calls: string[] = [];
    const result = await new CloseBusinessDayAndGenerateDssr({
      businessDays: new BdRepo([openDay()]),
      businessDayLock: { lockStation: async () => { calls.push('station-lock'); }, lockById: async () => { calls.push('day-lock'); }, lockByStationAndDate: async () => {} },
      openShifts: { hasOpenShift: async () => { calls.push('check'); return true; } },
      snapshots: new SnapRepo(),
      dssrData: new Reader(source()),
      events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
    }).execute({ businessDayId: 'bd-1', stationId: 'st-1' }, ctx());

    expect(result.success).toBe(false);
    expect(calls).toEqual(['station-lock', 'day-lock', 'check']);
  });

  it('preserves an existing immutable DSSR during close', async () => {
    const snapshots = new SnapRepo();
    snapshots.rows.push({ id: 'existing', organizationId: 'org-1', stationId: 'st-1', businessDate: '2026-03-15', generatedAt: 'earlier', snapshotData: { marker: 'original' } });
    const result = await new CloseBusinessDayAndGenerateDssr({
      businessDays: new BdRepo([openDay()]), businessDayLock: { lockStation: async () => {}, lockById: async () => {}, lockByStationAndDate: async () => {} }, openShifts: { hasOpenShift: async () => false }, snapshots, dssrData: new Reader(source()),
      events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
    }).execute({ businessDayId: 'bd-1', stationId: 'st-1' }, ctx());
    expect(result.success).toBe(true);
    expect(snapshots.rows).toEqual([expect.objectContaining({ id: 'existing', generatedAt: 'earlier', snapshotData: { marker: 'original' } })]);
  });
});
