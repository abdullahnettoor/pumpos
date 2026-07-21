import { describe, expect, it } from 'vitest';
import { FixedClock, InMemoryEventStore, InProcessEventDispatcher, SequentialIdGenerator, BusinessEvents } from '../../../kernel/index.js';
import type { ExecutionContext } from '../../../kernel/index.js';
import { SetCustomerOpeningBalance } from './set-opening-balance.js';
import type { CustomerLedgerEntry, CustomerLedgerRepository } from '../collections/index.js';
import type { Customer, CustomerRepository } from './index.js';
import type { BusinessDay, BusinessDayRepository } from '../../station-ops/business-days/index.js';

class LedgerRepo implements CustomerLedgerRepository {
  readonly rows: CustomerLedgerEntry[] = [];
  async save(e: CustomerLedgerEntry) { this.rows.push(e); }
}
class CustomerRepo implements CustomerRepository {
  constructor(readonly rows: Customer[]) {}
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
  return { organizationId: 'org-1', stationId: 'st-1', businessDayId: null, actorId: 'u', correlationId: null, clock: new FixedClock(new Date('2026-03-15T10:00:00Z')), ids: new SequentialIdGenerator('ob') };
}
function customer(): Customer {
  return { id: 'cust-1', organizationId: 'org-1', stationId: null, customerType: 'Credit', name: 'Acme', phone: null, creditLimit: '100000', fleetCode: null, isPrepaid: false, prepaidBalance: '0', settlementCycle: 'OPEN', metadata: null, isActive: true, createdAt: '', updatedAt: '' };
}
function bday(): BusinessDay {
  return { id: 'bd-1', organizationId: 'org-1', stationId: 'st-1', businessDate: '2026-03-14', status: 'OPEN', openedBy: 'u', openedAt: '', closedBy: null, closedAt: null, createdAt: '', updatedAt: '' };
}

describe('SetCustomerOpeningBalance', () => {
  it('records an opening receivable, business-day anchored, distinct from a credit sale', async () => {
    const ledger = new LedgerRepo();
    const store = new InMemoryEventStore();
    const result = await new SetCustomerOpeningBalance({
      ledger, customers: new CustomerRepo([customer()]), businessDays: new BdRepo([bday()]),
      events: new InProcessEventDispatcher({ store }),
    }).execute({ customerId: 'cust-1', amount: 12000, stationId: 'st-1', asOfDate: '2026-03-14' }, ctx());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.transactionType).toBe('Opening Balance');
      expect(result.data.referenceType).toBe('OPENING_BALANCE');
      expect(result.data.amount).toBe('12000');
      expect(result.data.businessDayId).toBe('bd-1');
      expect(result.data.shiftId).toBeNull();
    }
    expect(store.events.map((e) => e.eventType)).toContain(BusinessEvents.CUSTOMER_OPENING_BALANCE_SET);
  });

  it('rejects a non-positive amount', async () => {
    const result = await new SetCustomerOpeningBalance({
      ledger: new LedgerRepo(), customers: new CustomerRepo([customer()]), businessDays: new BdRepo([bday()]),
      events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
    }).execute({ customerId: 'cust-1', amount: 0, stationId: 'st-1' }, ctx());
    expect(result.success).toBe(false);
  });

  it('404s for a customer in another organization', async () => {
    const result = await new SetCustomerOpeningBalance({
      ledger: new LedgerRepo(), customers: new CustomerRepo([]), businessDays: new BdRepo([bday()]),
      events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
    }).execute({ customerId: 'cust-1', amount: 500, stationId: 'st-1' }, ctx());
    expect(result.success).toBe(false);
  });
});
