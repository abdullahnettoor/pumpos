import { describe, expect, it } from 'vitest';
import { FixedClock, InMemoryEventStore, InProcessEventDispatcher, SequentialIdGenerator, BusinessEvents } from '../../kernel/index.js';
import type { ExecutionContext } from '../../kernel/index.js';
import { SetSupplierOpeningBalance } from './set-supplier-opening-balance.js';
import type { SupplierTransaction, SupplierTransactionRepository } from './ports.js';
import type { Supplier, SupplierRepository } from '../crm/suppliers/index.js';
import type { BusinessDay, BusinessDayRepository } from '../station-ops/business-days/index.js';

class TxnRepo implements SupplierTransactionRepository {
  readonly rows: SupplierTransaction[] = [];
  async save(t: SupplierTransaction) { this.rows.push(t); }
}
class SupplierRepo implements SupplierRepository {
  constructor(readonly rows: Supplier[]) {}
  async findById(id: string) { return this.rows.find((r) => r.id === id) ?? null; }
  async save() {}
  async existsByName() { return false; }
  async listByOrganization() { return this.rows; }
}
class BdRepo implements BusinessDayRepository {
  constructor(readonly rows: BusinessDay[]) {}
  async findById(id: string) { return this.rows.find((r) => r.id === id) ?? null; }
  async save() {}
  async findOpenByStation() { return null; }
  async findByStationAndDate(orgId: string, stationId: string) {
    return this.rows.find((r) => r.organizationId === orgId && r.stationId === stationId) ?? null;
  }
}

function ctx(): ExecutionContext {
  return { organizationId: 'org-1', stationId: 'st-1', businessDayId: null, actorId: 'u', correlationId: null, clock: new FixedClock(new Date('2026-03-15T10:00:00Z')), ids: new SequentialIdGenerator('sob') };
}
function supplier(): Supplier {
  return { id: 'sup-1', organizationId: 'org-1', stationId: null, name: 'IOCL', phone: null, metadata: null, isActive: true, createdAt: '', updatedAt: '' };
}
function bday(): BusinessDay {
  return { id: 'bd-1', organizationId: 'org-1', stationId: 'st-1', businessDate: '2026-03-14', status: 'OPEN', openedBy: 'u', openedAt: '', closedBy: null, closedAt: null, createdAt: '', updatedAt: '' };
}

describe('SetSupplierOpeningBalance', () => {
  it('records an opening payable, business-day anchored, not a purchase or payment', async () => {
    const txns = new TxnRepo();
    const store = new InMemoryEventStore();
    const result = await new SetSupplierOpeningBalance({
      supplierTxns: txns, suppliers: new SupplierRepo([supplier()]), businessDays: new BdRepo([bday()]),
      events: new InProcessEventDispatcher({ store }),
    }).execute({ supplierId: 'sup-1', amount: 250000, stationId: 'st-1', asOfDate: '2026-03-14' }, ctx());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.transactionType).toBe('Opening Balance');
      expect(result.data.referenceType).toBe('OPENING_BALANCE');
      expect(result.data.amount).toBe('250000');
      expect(result.data.affectsDrawer).toBe(false);
      expect(result.data.businessDayId).toBe('bd-1');
      expect(result.data.shiftId).toBeNull();
    }
    expect(store.events.map((e) => e.eventType)).toContain(BusinessEvents.SUPPLIER_OPENING_BALANCE_SET);
  });

  it('rejects a non-positive amount', async () => {
    const result = await new SetSupplierOpeningBalance({
      supplierTxns: new TxnRepo(), suppliers: new SupplierRepo([supplier()]), businessDays: new BdRepo([bday()]),
      events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
    }).execute({ supplierId: 'sup-1', amount: -5, stationId: 'st-1' }, ctx());
    expect(result.success).toBe(false);
  });
});
