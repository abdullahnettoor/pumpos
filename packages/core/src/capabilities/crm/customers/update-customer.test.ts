import { describe, expect, it } from 'vitest';
import {
  BusinessEvents,
  FixedClock,
  InMemoryEventStore,
  InProcessEventDispatcher,
  SequentialIdGenerator,
} from '../../../kernel/index.js';
import type { ExecutionContext } from '../../../kernel/index.js';
import { UpdateCustomer } from './index.js';
import type { Customer, CustomerRepository, UpdateCustomerCommand } from './index.js';

class Repo implements CustomerRepository {
  saved: Customer[] = [];
  constructor(readonly rows: Customer[]) {}
  async findById(id: string) {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async save(c: Customer) {
    this.saved.push(c);
  }
  async existsByName() {
    return false;
  }
  async listByOrganization() {
    return this.rows;
  }
}

const customer = (over: Partial<Customer> = {}): Customer => ({
  id: 'cust-1',
  organizationId: 'org-1',
  stationId: null,
  customerType: 'Credit',
  name: 'Acme',
  phone: null,
  creditLimit: '50000.00',
  fleetCode: null,
  isPrepaid: false,
  prepaidBalance: '0',
  settlementCycle: 'OPEN',
  metadata: null,
  isActive: true,
  createdAt: '',
  updatedAt: '',
  ...over,
});

/** `role: undefined` = no actor snapshot (a system caller). */
const ctx = (role?: string | null, kind: 'tenant_user' | 'system' = 'tenant_user') =>
  ({
    organizationId: 'org-1',
    stationId: null,
    businessDayId: null,
    actorId: 'u',
    correlationId: null,
    ...(role === undefined
      ? {}
      : { actorSnapshot: { kind, displayName: 'Someone', role, subjectId: 'u' } }),
    clock: new FixedClock(new Date('2026-03-15T10:00:00Z')),
    ids: new SequentialIdGenerator('ev'),
  }) satisfies ExecutionContext;

function setup(existing: Customer = customer()) {
  const repo = new Repo([existing]);
  const store = new InMemoryEventStore();
  const useCase = new UpdateCustomer({
    repository: repo,
    events: new InProcessEventDispatcher({ store }),
  });
  const run = (input: Partial<UpdateCustomerCommand>, c: ExecutionContext) =>
    useCase.execute({ id: 'cust-1', ...input }, c);
  return { repo, store, run };
}

describe('UpdateCustomer — credit limit', () => {
  it.each(['Owner', 'Manager'])('lets a %s change the limit', async (role) => {
    const { repo, run } = setup();
    const result = await run({ creditLimit: 75000 }, ctx(role));
    expect(result.success).toBe(true);
    expect(repo.saved[0]?.creditLimit).toBe('75000');
  });

  it.each(['Accountant', 'Staff', 'Attendant', null])(
    'refuses %s changing the limit, and saves nothing',
    async (role) => {
      const { repo, store, run } = setup();
      const result = await run({ creditLimit: 75000 }, ctx(role));
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('FORBIDDEN');
      expect(repo.saved).toHaveLength(0);
      expect(store.events).toHaveLength(0);
    },
  );

  it('refuses an Accountant removing the limit too', async () => {
    const { run } = setup();
    const result = await run({ creditLimit: null }, ctx('Accountant'));
    expect(result.success).toBe(false);
  });

  it('still lets an Accountant edit everything else', async () => {
    const { repo, run } = setup();
    const result = await run({ name: 'Acme Fleet', phone: '9876543210' }, ctx('Accountant'));
    expect(result.success).toBe(true);
    expect(repo.saved[0]).toMatchObject({
      name: 'Acme Fleet',
      phone: '9876543210',
      creditLimit: '50000.00',
    });
  });

  it('does not treat re-sending the same limit as a change (the desktop form always sends it)', async () => {
    const { run } = setup();
    expect((await run({ name: 'Acme 2', creditLimit: 50000 }, ctx('Accountant'))).success).toBe(
      true,
    );
    expect((await run({ creditLimit: '50000' }, ctx('Accountant'))).success).toBe(true);
  });

  it('reads 0 and none as the same "no limit"', async () => {
    const { run } = setup(customer({ creditLimit: null }));
    expect((await run({ creditLimit: 0 }, ctx('Accountant'))).success).toBe(true);
    const zero = setup(customer({ creditLimit: '0.00' }));
    expect((await zero.run({ creditLimit: null }, ctx('Accountant'))).success).toBe(true);
  });

  it('does not restrict a system caller (no tenant user is acting)', async () => {
    const { run } = setup();
    expect((await run({ creditLimit: 1 }, ctx())).success).toBe(true);
    expect((await run({ creditLimit: 2 }, ctx('system-job', 'system'))).success).toBe(true);
  });

  it('refuses a negative limit', async () => {
    const { repo, run } = setup();
    const result = await run({ creditLimit: -1 }, ctx('Owner'));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
    expect(repo.saved).toHaveLength(0);
  });

  it.each([
    ['text that is not a number', 'abc'],
    ['blank text', ''],
    ['more than 2 decimals', 10.005],
    ['more than numeric(12,2) holds', 10_000_000_000],
    ['negative text', '-5'],
  ])('refuses %s', async (_label, creditLimit) => {
    const { repo, run } = setup();
    const result = await run({ creditLimit: creditLimit as number }, ctx('Owner'));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
    expect(repo.saved).toHaveLength(0);
  });

  it('accepts numeric text and 0 / null', async () => {
    const { repo, run } = setup();
    expect((await run({ creditLimit: '1200.50' }, ctx('Owner'))).success).toBe(true);
    expect((await run({ creditLimit: 0 }, ctx('Owner'))).success).toBe(true);
    expect((await run({ creditLimit: null }, ctx('Owner'))).success).toBe(true);
    expect(repo.saved.map((c) => c.creditLimit)).toEqual(['1200.5', '0', null]);
  });
});

describe('UpdateCustomer — event payload', () => {
  it('records the limit change and the note on the event, not on the Customer', async () => {
    const { repo, store, run } = setup();
    const result = await run({ creditLimit: 75000, note: '  Raised after audit  ' }, ctx('Owner'));
    expect(result.success).toBe(true);
    const event = store.events.find((e) => e.eventType === BusinessEvents.CUSTOMER_UPDATED);
    expect(event?.payload).toEqual({
      customerId: 'cust-1',
      creditLimit: { from: '50000.00', to: '75000' },
      note: 'Raised after audit',
    });
    expect(JSON.stringify(repo.saved[0])).not.toContain('Raised after audit');
  });

  it('leaves note and limit out when there is nothing to record', async () => {
    const { store, run } = setup();
    await run({ name: 'Acme 2', note: '   ' }, ctx('Accountant'));
    expect(store.events[0]?.payload).toEqual({ customerId: 'cust-1' });
  });

  it('refuses a note longer than 500 characters', async () => {
    const { run } = setup();
    const result = await run({ creditLimit: 1, note: 'x'.repeat(501) }, ctx('Owner'));
    expect(result.success).toBe(false);
  });
});
