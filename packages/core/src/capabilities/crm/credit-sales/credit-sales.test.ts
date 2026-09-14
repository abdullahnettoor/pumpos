import { describe, expect, it } from 'vitest';
import { FixedClock, InMemoryEventStore, InProcessEventDispatcher, SequentialIdGenerator, BusinessEvents } from '../../../kernel/index.js';
import type { ExecutionContext } from '../../../kernel/index.js';
import { RecordCreditSale } from './index.js';
import type { CustomerLedgerEntry, CustomerLedgerRepository } from '../collections/index.js';
import type { Customer, CustomerRepository } from '../customers/index.js';
import type { Shift, ShiftRepository } from '../../station-ops/shifts/index.js';
import type { BusinessDay, BusinessDayWriteRepository } from '../../station-ops/business-days/index.js';

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
  async findByIdWithoutLock(id: string) { return this.findById(id); }
  async save() {}
  async findOpenByStation() { return null; }
  async addStaffAssignments() {}
  async addTerminalLinks() {}
}
class BdRepo implements BusinessDayWriteRepository {
  constructor(readonly rows: BusinessDay[]) {}
  async findById(id: string) { return this.rows.find((r) => r.id === id) ?? null; }
  async save() {}
  async findOpenByStation(orgId: string, stationId: string) {
    return this.rows.find((r) => r.organizationId === orgId && r.stationId === stationId && r.status === 'OPEN') ?? null;
  }
  async findByStationAndDate(orgId: string, stationId: string, _date: string) {
    return this.rows.find((r) => r.organizationId === orgId && r.stationId === stationId) ?? null;
  }
  async lockStation() {}
  async lockById() {}
  async lockByStationAndDate() {}
}

function ctx(): ExecutionContext {
  return { organizationId: 'org-1', stationId: 'st-1', businessDayId: null, actorId: 'u', correlationId: null, clock: new FixedClock(new Date('2026-03-15T10:00:00Z')), ids: new SequentialIdGenerator('cs') };
}
function customer(): Customer {
  return { id: 'cust-1', organizationId: 'org-1', stationId: null, customerType: 'Fleet', name: 'Acme', phone: null, creditLimit: '100000', fleetCode: 'AC', isPrepaid: false, prepaidBalance: '0', settlementCycle: 'OPEN', metadata: null, isActive: true, createdAt: '', updatedAt: '' };
}
function shift(): Shift {
  return { id: 'sh-1', organizationId: 'org-1', stationId: 'st-1', businessDayId: 'bd-1', shiftTemplateId: 't', status: 'OPEN', openedBy: 'u', openedAt: '', closedBy: null, closedAt: null, lockedAt: null, openingCash: '0', closingCash: null, createdAt: '', updatedAt: '' };
}
function bday(): BusinessDay {
  return { id: 'bd-1', organizationId: 'org-1', stationId: 'st-1', businessDate: '2026-03-15', status: 'OPEN', openedBy: 'u', openedAt: '', closedBy: null, closedAt: null, createdAt: '', updatedAt: '' };
}

describe('RecordCreditSale', () => {
  it('records a receivable on the customer ledger, business-day anchored, no shift link', async () => {
    const ledger = new LedgerRepo();
    const store = new InMemoryEventStore();
    const result = await new RecordCreditSale({
      ledger, customers: new CustomerRepo([customer()]), shifts: new ShiftRepo([shift()]),
      businessDays: new BdRepo([bday()]), events: new InProcessEventDispatcher({ store }),
    }).execute({ customerId: 'cust-1', amount: 4500, shiftId: 'sh-1', vehicleId: 'veh-1', productId: 'diesel-1', quantity: 50, unitPrice: 90 }, ctx());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.transactionType).toBe('Credit Sale');
      expect(result.data.amount).toBe('4500');
      expect(result.data.shiftId).toBe('sh-1');
      expect(result.data.businessDayId).toBe('bd-1');
      expect(result.data.quantity).toBe('50');
      expect(result.data.attendantId).toBe('u');
    }
    expect(store.events.map((e) => e.eventType)).toContain(BusinessEvents.CREDIT_SALE_CREATED);
  });

  it('a back-office (station-anchored) credit sale has no attendant attribution', async () => {
    const ledger = new LedgerRepo();
    const result = await new RecordCreditSale({
      ledger, customers: new CustomerRepo([customer()]), shifts: new ShiftRepo([shift()]),
      businessDays: new BdRepo([{ id: 'bd-1', organizationId: 'org-1', stationId: 'st-1', businessDate: '2026-03-15', status: 'OPEN' } as BusinessDay]),
      events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
    }).execute({ customerId: 'cust-1', amount: 1000, stationId: 'st-1', attendantId: 'att-9' }, ctx());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.shiftId).toBeNull();
      expect(result.data.attendantId).toBeNull();
    }
  });

  it('retains optional shift attribution for a credit sale after day close', async () => {
    const ledger = new LedgerRepo();
    const closedShift = { ...shift(), status: 'CLOSED' as const, closedAt: '2026-03-15T09:00:00Z' };
    const closedDay = { ...bday(), status: 'CLOSED' as const, closedAt: '2026-03-15T09:30:00Z' };
    const result = await new RecordCreditSale({
      ledger, customers: new CustomerRepo([customer()]), shifts: new ShiftRepo([closedShift]),
      businessDays: new BdRepo([closedDay]), events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
    }).execute({ customerId: 'cust-1', amount: 1000, shiftId: 'sh-1' }, ctx());

    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toMatchObject({ shiftId: 'sh-1', metadata: { lateEntry: true } });
  });

  it('rejects an unknown customer', async () => {
    const result = await new RecordCreditSale({
      ledger: new LedgerRepo(), customers: new CustomerRepo([]), shifts: new ShiftRepo([shift()]),
      businessDays: new BdRepo([]), events: new InProcessEventDispatcher({ store: new InMemoryEventStore() }),
    }).execute({ customerId: 'nope', amount: 100, shiftId: 'sh-1' }, ctx());
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tenant-scoped voids: shiftless entries must not be deletable cross-tenant.
// ---------------------------------------------------------------------------
import { VoidCreditSale, VoidOmcCardSale } from './index.js';

class ScopedLedgerRepo implements CustomerLedgerRepository {
  constructor(readonly rows: Array<CustomerLedgerEntry & { organizationId: string }>) {}
  async save(e: CustomerLedgerEntry) { this.rows.push({ ...e, organizationId: 'org-1' }); }
  async findById(id: string, organizationId: string) {
    return this.rows.find((r) => r.id === id && r.organizationId === organizationId) ?? null;
  }
  async delete(id: string, organizationId: string) {
    const i = this.rows.findIndex((r) => r.id === id && r.organizationId === organizationId);
    if (i >= 0) this.rows.splice(i, 1);
  }
}

function shiftlessEntry(over: Partial<CustomerLedgerEntry> = {}): CustomerLedgerEntry & { organizationId: string } {
  return {
    id: 'led-1', shiftId: null, businessDayId: 'bd-1', customerId: 'cust-1', vehicleId: null,
    productId: null, attendantId: null, duId: null, transactionType: 'Credit Sale', amount: '500',
    quantity: null, unitPrice: null, referenceType: 'CREDIT_SALE', referenceId: null, notes: null,
    metadata: {}, createdAt: '2026-03-15T09:00:00Z', organizationId: 'org-1', ...over,
  } as CustomerLedgerEntry & { organizationId: string };
}

describe('VoidCreditSale tenant scoping', () => {
  it('voids a shiftless credit sale within the owning organization', async () => {
    const ledger = new ScopedLedgerRepo([shiftlessEntry()]);
    const store = new InMemoryEventStore();
    const r = await new VoidCreditSale({ ledger, shifts: new ShiftRepo([]), events: new InProcessEventDispatcher({ store }) })
      .execute({ id: 'led-1' }, ctx());
    expect(r.success).toBe(true);
    expect(ledger.rows).toHaveLength(0);
  });

  it('refuses to void a shiftless credit sale from another organization', async () => {
    const ledger = new ScopedLedgerRepo([shiftlessEntry({ organizationId: 'org-2' } as any)]);
    const store = new InMemoryEventStore();
    const r = await new VoidCreditSale({ ledger, shifts: new ShiftRepo([]), events: new InProcessEventDispatcher({ store }) })
      .execute({ id: 'led-1' }, ctx());
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.code).toBe('NOT_FOUND');
    expect(ledger.rows).toHaveLength(1);
  });

  it('refuses to void a shiftless OMC card sale from another organization', async () => {
    const ledger = new ScopedLedgerRepo([
      shiftlessEntry({ organizationId: 'org-2', transactionType: 'OMC Sale', referenceType: 'OMC_CARD_SALE' } as any),
    ]);
    const store = new InMemoryEventStore();
    const r = await new VoidOmcCardSale({ ledger, shifts: new ShiftRepo([]), events: new InProcessEventDispatcher({ store }) })
      .execute({ id: 'led-1' }, ctx());
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.code).toBe('NOT_FOUND');
    expect(ledger.rows).toHaveLength(1);
  });
});
