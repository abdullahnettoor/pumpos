import { describe, expect, it } from 'vitest';
import { BusinessEvents } from '../../../kernel/index.js';
import type { DocumentNumberGenerator } from '../../../kernel/index.js';
import { RecordCollection } from './index.js';
import type { Collection, CollectionRepository } from './index.js';
import type { Customer, CustomerRepository } from '../customers/index.js';
import {
  AccountRepo,
  eventBus,
  officeCtx,
  terminal,
  TerminalLookup,
} from '../../finance/__fixtures__/office.js';

class CollRepo implements CollectionRepository {
  readonly rows: Collection[] = [];
  async save(c: Collection) {
    this.rows.push(c);
  }
}
class CustomerRepo implements CustomerRepository {
  constructor(readonly rows: Customer[]) {}
  async findById(id: string) {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async save() {}
  async existsByName() {
    return false;
  }
  async listByOrganization() {
    return this.rows;
  }
}
const docNumbers: DocumentNumberGenerator = {
  async next() {
    return 'COLL-000001';
  },
};

function customer(): Customer {
  return {
    id: 'cust-1',
    organizationId: 'org-1',
    stationId: null,
    customerType: 'Credit',
    name: 'Ravi',
    phone: null,
    creditLimit: '100000',
    fleetCode: null,
    isPrepaid: false,
    prepaidBalance: '0',
    settlementCycle: 'OPEN',
    metadata: null,
    isActive: true,
    createdAt: '',
    updatedAt: '',
  };
}

function run(input: Record<string, unknown>, terminals?: TerminalLookup, now?: string) {
  const collections = new CollRepo();
  const { store, events } = eventBus();
  const result = new RecordCollection({
    collections,
    customers: new CustomerRepo([customer()]),
    accounts: new AccountRepo(),
    terminals,
    docNumbers,
    events,
  }).execute(
    { customerId: 'cust-1', amount: 5000, paymentMethod: 'Cash', ...input } as any,
    officeCtx(now),
  );
  return { result, collections, store };
}

describe('RecordCollection (Office Record, ADR 0005)', () => {
  it('records a cash collection into Cash in Hand on the Entry Date, never a shift', async () => {
    const { result, collections, store } = run({ fundingAccountId: 'cash' });
    const r = await result;
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(collections.rows[0]).toMatchObject({
      stationId: 'st-1',
      entryDate: '2026-03-15',
      fundingAccountId: 'cash',
      terminalId: null,
    });
    const [event] = store.events;
    expect(event.eventType).toBe(BusinessEvents.CREDIT_PAYMENT_RECEIVED);
    expect(event.businessDayId).toBeNull();
    expect(event.payload).toMatchObject({ entryDate: '2026-03-15', fundingAccountId: 'cash' });
    expect(event.payload).not.toHaveProperty('shiftId');
    expect((event.metadata as any).presentation.templateId).toBe('credit-payment-received.v2');
  });

  it('dates a 03:00 collection on the 15th the 15th, despite a 06:00 Day Start', async () => {
    const r = await run({ fundingAccountId: 'cash' }, undefined, '2026-03-14T21:30:00Z').result;
    expect(r.success && r.data.entryDate).toBe('2026-03-15');
  });

  it('refuses an account that does not suit the method', async () => {
    const cashIntoBank = await run({ fundingAccountId: 'hdfc' }).result;
    expect(cashIntoBank.success).toBe(false);
    const upiIntoCash = await run({ paymentMethod: 'UPI', fundingAccountId: 'cash' }).result;
    expect(upiIntoCash.success).toBe(false);
    const neftIntoBank = await run({ paymentMethod: 'BankTransfer', fundingAccountId: 'hdfc' })
      .result;
    expect(neftIntoBank.success).toBe(true);
  });

  it('routes a UPI collection through a terminal to its clearing account (#276)', async () => {
    const terminals = new TerminalLookup([terminal('pos-1', { clearingAccountId: 'clearing' })]);
    const r = await run({ paymentMethod: 'UPI', terminalId: 'pos-1' }, terminals).result;
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.terminalId).toBe('pos-1');
      expect(r.data.fundingAccountId).toBe('clearing');
    }
  });

  it('rejects a terminal from another station (#276)', async () => {
    const terminals = new TerminalLookup([terminal('pos-9', { stationId: 'st-2' })]);
    const r = await run({ paymentMethod: 'Card', terminalId: 'pos-9' }, terminals).result;
    expect(r.success).toBe(false);
  });

  it('rejects an unknown customer', async () => {
    const r = await run({ customerId: 'nope', fundingAccountId: 'cash' }).result;
    expect(r.success).toBe(false);
  });
});
