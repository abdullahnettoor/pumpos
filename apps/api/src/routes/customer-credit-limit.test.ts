import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { schema } from '@pump/db';
import type { Role } from '@pump/shared';
import { transactionsRouter } from './transactions.js';

/**
 * Changing a Customer's credit limit is narrower than editing the Customer
 * (#409): `PUT /transactions/customers/:id` is open to the Accountant, but the
 * limit is an Owner / Manager decision. The use-case refuses it, so the route
 * answers 403 whatever client sent it, while the rest of the edit still works.
 */

const ORG = 'org-1';
const CUSTOMER = 'customer-1';
const now = new Date('2026-03-15T10:00:00Z');

const customerRow = {
  id: CUSTOMER,
  organizationId: ORG,
  stationId: null,
  customerType: 'Credit',
  name: 'Acme Fleet',
  phone: null,
  creditLimit: '50000.00',
  fleetCode: null,
  isPrepaid: false,
  prepaidBalance: '0',
  settlementCycle: 'OPEN',
  metadata: null,
  isActive: true,
  createdAt: now,
  updatedAt: now,
};

function fakeDb(writes: Array<{ table: unknown; values: any }>) {
  const rows = new Map<unknown, unknown[]>([
    [
      schema.organizations,
      [
        {
          subscriptionPlan: 'CORE',
          subscriptionStatus: 'ACTIVE',
          accessUntil: null,
          suspendedAt: null,
        },
      ],
    ],
    [schema.customers, [customerRow]],
  ]);
  const chain = (): any => {
    let table: unknown = null;
    const self: any = {};
    const step = (fn?: (a: unknown) => void) => (a: unknown) => {
      fn?.(a);
      return self;
    };
    Object.assign(self, {
      from: step((t) => {
        table = t;
      }),
      where: step(),
      orderBy: step(),
      limit: step(),
      innerJoin: step(),
      leftJoin: step(),
      groupBy: step(),
      for: step(),
      then: (res: (v: unknown[]) => void, rej?: (e: unknown) => void) =>
        Promise.resolve(rows.get(table) ?? []).then(res, rej),
    });
    return self;
  };
  const db: any = {
    select: () => chain(),
    insert: (table: unknown) => ({
      values: (values: any) => {
        writes.push({ table, values });
        const done: any = Promise.resolve([]);
        done.onConflictDoUpdate = () => Promise.resolve([]);
        done.onConflictDoNothing = () => Promise.resolve([]);
        done.returning = () => Promise.resolve([]);
        return done;
      },
    }),
    execute: async () => [],
    transaction: async (run: (tx: unknown) => Promise<unknown>) => run(db),
  };
  return db;
}

async function put(role: Role, body: Record<string, unknown>) {
  const writes: Array<{ table: unknown; values: any }> = [];
  const app = new Hono<{ Variables: { db: any; user: any } }>();
  app.use('*', async (c, next) => {
    c.set('db', fakeDb(writes));
    c.set('user', {
      id: 'user-1',
      email: 'user@example.com',
      fullName: 'Someone',
      organizationId: ORG,
      role,
      assignedStationIds: ['station-1'],
    });
    await next();
  });
  app.route('/transactions', transactionsRouter);
  const res = await app.request(`/transactions/customers/${CUSTOMER}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as any;
  const saved = writes.find((w) => w.table === schema.customers)?.values;
  const event = writes.find((w) => w.table === schema.events)?.values;
  const eventRow = Array.isArray(event) ? event[0] : event;
  return { status: res.status, code: json?.error?.code ?? null, saved, event: eventRow };
}

describe('PUT /transactions/customers/:id — credit limit', () => {
  it.each(['Owner', 'Manager'] as const)('lets a %s change the limit', async (role) => {
    const r = await put(role, { creditLimit: 75000 });
    expect(r.status).toBe(200);
    expect(r.saved.creditLimit).toBe('75000');
  });

  it('refuses an Accountant changing the limit with 403 FORBIDDEN, writing nothing', async () => {
    const r = await put('Accountant', { creditLimit: 75000 });
    expect({ status: r.status, code: r.code }).toEqual({ status: 403, code: 'FORBIDDEN' });
    expect(r.saved).toBeUndefined();
    expect(r.event).toBeUndefined();
  });

  it('refuses an Accountant removing the limit', async () => {
    const r = await put('Accountant', { creditLimit: null });
    expect({ status: r.status, code: r.code }).toEqual({ status: 403, code: 'FORBIDDEN' });
  });

  it('still lets an Accountant edit other fields, including a form that re-sends the same limit', async () => {
    const r = await put('Accountant', { phone: '9876543210', creditLimit: 50000 });
    expect(r.status).toBe(200);
    expect(r.saved).toMatchObject({ phone: '9876543210', creditLimit: '50000' });
  });

  it('refuses a negative limit, even from an Owner', async () => {
    const r = await put('Owner', { creditLimit: -5 });
    expect({ status: r.status, code: r.code }).toEqual({ status: 400, code: 'VALIDATION_ERROR' });
    expect(r.saved).toBeUndefined();
  });

  it('puts the limit change and note on the CUSTOMER_UPDATED event', async () => {
    const r = await put('Manager', { creditLimit: 75000, note: 'Raised after audit' });
    expect(r.status).toBe(200);
    expect(r.event?.payload).toEqual({
      customerId: CUSTOMER,
      creditLimit: { from: '50000.00', to: '75000' },
      note: 'Raised after audit',
    });
  });
});
