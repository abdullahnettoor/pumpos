import { describe, expect, it } from 'vitest';
import { FixedClock, InMemoryEventStore, InProcessEventDispatcher, SequentialIdGenerator, BusinessEvents } from '../../../kernel/index.js';
import type { ExecutionContext } from '../../../kernel/index.js';
import { GenerateDssr } from './generate-dssr.js';
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
  async save() {}
  async findOpenByStation() { return null; }
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
    purchases: [{ amount: 450000 }],
    supplierPayments: [{ affectsDrawer: false, paidFrom: 'BANK', amount: 200000 }],
    sales: [{ paymentMethod: 'Cash', saleType: 'Product', totalAmount: 500 }, { paymentMethod: 'Credit', saleType: 'Product', totalAmount: 1180 }],
    creditSales: [{ customerType: 'Regular', amount: 1000 }, { customerType: 'Fleet', amount: 4000 }],
    stockVariances: [{ tankName: 'T1', productName: 'Petrol', unit: 'Litre', inventoryType: 'BULK', expectedQuantity: 5000, actualQuantity: 4990, varianceQuantity: -10, reason: null }],
    saleItems: [{ productId: 'p2', quantity: 2 }],
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
      expect(d.pnl.netProfit).toBe(7340);
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
});
