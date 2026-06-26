import { describe, expect, it } from 'vitest';
import {
  FixedClock,
  InMemoryEventStore,
  InProcessEventDispatcher,
  SequentialIdGenerator,
  BusinessEvents,
} from '../../../kernel/index.js';
import type { DocumentNumberGenerator, ExecutionContext } from '../../../kernel/index.js';
import { RecordCollection } from './index.js';
import type { Collection, CollectionRepository, CustomerLedgerEntry, CustomerLedgerRepository } from './index.js';
import type { Customer, CustomerRepository } from '../customers/index.js';
import type { Shift, ShiftRepository } from '../../station-ops/shifts/index.js';
import type { BusinessDay, BusinessDayRepository } from '../../station-ops/business-days/index.js';

class CollRepo implements CollectionRepository {
  readonly rows: Collection[] = [];
  async save(c: Collection) { this.rows.push(c); }
}
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
class ShiftRepo implements ShiftRepository {
  constructor(readonly rows: Shift[]) {}
  async findById(id: string) { return this.rows.find((r) => r.id === id) ?? null; }
  async save() {}
  async findOpenByStation() { return null; }
  async addStaffAssignments() {}
  async addTerminalLinks() {}
}
class BdRepo implements BusinessDayRepository {
  constructor(readonly rows: BusinessDay[]) {}
  async findById(id: string) { return this.rows.find((r) => r.id === id) ?? null; }
  async save() {}
  async findOpenByStation(orgId: string, stationId: string) {
    return this.rows.find((r) => r.organizationId === orgId && r.stationId === stationId && r.status === 'OPEN') ?? null;
  }
}
const docNumbers: DocumentNumberGenerator = { async next() { return 'COLL-000001'; } };

function ctx(): ExecutionContext {
  return { organizationId: 'org-1', stationId: 'st-1', businessDayId: null, actorId: 'u', correlationId: null, clock: new FixedClock(new Date('2026-03-15T10:00:00Z')), ids: new SequentialIdGenerator('c') };
}
function customer(): Customer {
  return { id: 'cust-1', organizationId: 'org-1', stationId: null, customerType: 'Credit', name: 'Ravi', phone: null, creditLimit: '100000', fleetCode: null, isPrepaid: false, prepaidBalance: '0', metadata: null, isActive: true, createdAt: '', updatedAt: '' };
}
function shift(): Shift {
  return { id: 'sh-1', organizationId: 'org-1', stationId: 'st-1', businessDayId: 'bd-1', shiftTemplateId: 't', status: 'OPEN', openedBy: 'u', openedAt: '', closedBy: null, closedAt: null, lockedAt: null, openingCash: '0', closingCash: null, createdAt: '', updatedAt: '' };
}
function bday(): BusinessDay {
  return { id: 'bd-9', organizationId: 'org-1', stationId: 'st-1', businessDate: '2026-03-15', status: 'OPEN', openedBy: 'u', openedAt: '', closedBy: null, closedAt: null, createdAt: '', updatedAt: '' };
}

describe('RecordCollection (decoupled)', () => {
  it('CASH at counter attaches to shift + drawer', async () => {
    const collections = new CollRepo();
    const ledger = new LedgerRepo();
    const store = new InMemoryEventStore();
    const result = await new RecordCollection({
      collections, ledger, customers: new CustomerRepo([customer()]), shifts: new ShiftRepo([shift()]),
      businessDays: new BdRepo([]), docNumbers, events: new InProcessEventDispatcher({ store }),
    }).execute({ customerId: 'cust-1', amount: 5000, paymentMethod: 'Cash', shiftId: 'sh-1' }, ctx());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.shiftId).toBe('sh-1');
      expect(result.data.businessDayId).toBe('bd-1');
    }
    expect(ledger.rows[0].transactionType).toBe('Collection');
    expect(store.events[0].eventType).toBe(BusinessEvents.CREDIT_PAYMENT_RECEIVED);
  });

  it('BANK TRANSFER (no shift) is business-day anchored with no shift link', async () => {
    const collections = new CollRepo();
    const ledger = new LedgerRepo();
    const result = await new RecordCollection({
      collections, ledger, customers: new CustomerRepo([customer()]), shifts: new ShiftRepo([]),
      businessDays: new BdRepo([bday()]), docNumbers, events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
    }).execute({ customerId: 'cust-1', amount: 5000, paymentMethod: 'BankTransfer', stationId: 'st-1' }, ctx());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.shiftId).toBeNull();
      expect(result.data.businessDayId).toBe('bd-9');
    }
    expect(ledger.rows[0].shiftId).toBeNull();
  });

  it('CARD during a shift does NOT touch the drawer (shiftId null)', async () => {
    const collections = new CollRepo();
    const result = await new RecordCollection({
      collections, ledger: new LedgerRepo(), customers: new CustomerRepo([customer()]), shifts: new ShiftRepo([shift()]),
      businessDays: new BdRepo([]), docNumbers, events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
    }).execute({ customerId: 'cust-1', amount: 1000, paymentMethod: 'Card', shiftId: 'sh-1' }, ctx());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.shiftId).toBeNull();
      expect(result.data.businessDayId).toBe('bd-1');
    }
  });
});
