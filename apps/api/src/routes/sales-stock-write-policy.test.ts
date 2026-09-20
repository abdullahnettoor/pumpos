import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import type { Role } from '@pump/shared';
import { transactionsRouter } from './transactions.js';
import { dssrRouter } from './dssr.js';
import { WRITE_POLICY_DECLARATIONS } from '../infra/write-policy-declarations.js';

/**
 * Sales, stock and reporting under Restricted Access.
 *
 * The fuel has already left the tank and the money has already changed hands
 * by the time PumpOS hears about it. Refusing to record that does not undo it;
 * it just means the Business Day cannot be closed and the variance can never
 * be explained. So everything that describes work already done stays open —
 * sales, purchases, stock counts, handovers, invoices, the DSSR — while
 * anything that starts new work is handled by the other families.
 */

type Subscription = { status: string; accessUntil?: string | null };

function fakeDb(subscription: Subscription) {
  let queue: unknown[][] = [];
  const rows = () => [
    [
      {
        subscriptionPlan: 'CORE',
        subscriptionStatus: subscription.status,
        accessUntil: subscription.accessUntil ? new Date(subscription.accessUntil) : null,
      },
    ],
    [{ value: 1 }],
    [],
    [],
  ];
  const chainable = (result: unknown[]): any => {
    const chain: any = {
      from: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit: () => chain,
      innerJoin: () => chain,
      leftJoin: () => chain,
      groupBy: () => chain,
      for: () => chain,
      then: (resolve: (v: unknown[]) => void, reject?: (e: unknown) => void) =>
        Promise.resolve(result).then(resolve, reject),
    };
    return chain;
  };
  const db: any = {
    select: () => {
      if (queue.length === 0) queue = rows();
      return chainable(queue.shift() ?? []);
    },
    insert: () => ({ values: () => chainable([{ id: 'row-1' }]) }),
    update: () => chainable([{ id: 'row-1' }]),
    delete: () => chainable([{ id: 'row-1' }]),
    execute: async () => [],
    transaction: async (run: (tx: unknown) => Promise<unknown>) => run(db),
  };
  return db;
}

async function request(
  method: string,
  path: string,
  options: { subscription: Subscription; role?: Role; body?: unknown },
): Promise<{ status: number; code: string | null }> {
  const app = new Hono<{ Variables: { db: any; user: any } }>();
  app.use('*', async (c, next) => {
    c.set('db', fakeDb(options.subscription));
    c.set('user', {
      id: 'user-1',
      email: 'manager@example.com',
      fullName: 'Manager',
      organizationId: 'org-1',
      role: options.role ?? 'Manager',
      assignedStationIds: ['station-1'],
    });
    await next();
  });
  app.route('/transactions', transactionsRouter);
  app.route('/dssr', dssrRouter);

  const res = await app.request(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options.body ?? { stationId: 'station-1' }),
  });
  const body = (await res.json().catch(() => null)) as any;
  return { status: res.status, code: body?.error?.code ?? null };
}

const RESTRICTED: Subscription = { status: 'RESTRICTED' };
const SUSPENDED: Subscription = { status: 'SUSPENDED' };
const LAPSED_GRACE: Subscription = {
  status: 'PAST_DUE',
  accessUntil: new Date(Date.now() - 86_400_000).toISOString(),
};

/** Recording work that has already physically happened. */
const RECORDING: ReadonlyArray<[string, string, string]> = [
  ['POST', '/transactions/sales', 'the fuel or goods have already left'],
  ['POST', '/transactions/purchases', 'the tanker has already been decanted'],
  ['POST', '/transactions/inventory/count', 'the dip reading explains the day’s variance'],
  ['POST', '/transactions/shifts/shift-1/merchandise-handover', 'the attendant already holds the cash'],
  ['POST', '/transactions/sales/sale-1/invoice', 'the customer is entitled to their invoice'],
  ['DELETE', '/transactions/merchandise-handovers/sale-1', 'correcting a mis-keyed handover'],
  ['DELETE', '/transactions/credit-sales/sale-1', 'correcting a mis-keyed credit sale'],
  ['DELETE', '/transactions/omc-card-sales/sale-1', 'correcting a mis-keyed card sale'],
  ['POST', '/dssr/daily/generate', 'the DSSR is the closing snapshot of the day'],
];

describe('recording completed work under Restricted Access', () => {
  it.each(RECORDING)('allows %s %s — %s', async (method, path) => {
    const result = await request(method, path, { subscription: RESTRICTED });

    expect(result.code).not.toBe('SUBSCRIPTION_RESTRICTED');
  });

  it('lets a full day of trade be recorded and reported without one refusal', async () => {
    // The workflow end to end: sell, take a delivery, count stock, settle the
    // attendant, then produce the day's report.
    const workflow: ReadonlyArray<[string, string]> = [
      ['POST', '/transactions/sales'],
      ['POST', '/transactions/purchases'],
      ['POST', '/transactions/inventory/count'],
      ['POST', '/transactions/shifts/shift-1/merchandise-handover'],
      ['POST', '/dssr/daily/generate'],
    ];
    const refusals: string[] = [];
    for (const [method, path] of workflow) {
      const result = await request(method, path, { subscription: RESTRICTED });
      if (result.code === 'SUBSCRIPTION_RESTRICTED') refusals.push(`${method} ${path}`);
    }

    expect(refusals).toEqual([]);
  });

  it('keeps recording open once the Payment Grace Period has lapsed', async () => {
    const result = await request('POST', '/transactions/sales', { subscription: LAPSED_GRACE });

    expect(result.code).not.toBe('SUBSCRIPTION_RESTRICTED');
  });
});

describe('a suspended Organization', () => {
  it.each(RECORDING)('cannot %s %s', async (method, path) => {
    const result = await request(method, path, { subscription: SUSPENDED });

    expect(result.status).toBe(403);
    expect(result.code).toBe('ORGANIZATION_SUSPENDED');
  });
});

describe('the rest of the rules still decide', () => {
  it('never yields an access-policy code while the subscription is healthy', async () => {
    // Business Day anchoring, Day Seal, stock movement and Role rules run in
    // the handler exactly as before; the request fails there on its own terms.
    const result = await request('POST', '/transactions/sales', {
      subscription: { status: 'ACTIVE' },
    });

    expect(['SUBSCRIPTION_RESTRICTED', 'ORGANIZATION_SUSPENDED']).not.toContain(result.code);
  });
});

describe('this family is completely covered', () => {
  const OPERATIONS = RECORDING.map(([method, path]) =>
    // Route patterns, not the concrete ids used to drive the requests above.
    `${method} ${path
      .replace('/sale-1/invoice', '/:id/invoice')
      .replace('/shifts/shift-1/', '/shifts/:id/')
      .replace('/merchandise-handovers/sale-1', '/merchandise-handovers/:saleId')
      .replace('/credit-sales/sale-1', '/credit-sales/:id')
      .replace('/omc-card-sales/sale-1', '/omc-card-sales/:id')}`,
  );

  it('declares every route in the assigned family', () => {
    const missing = OPERATIONS.filter((op) => !WRITE_POLICY_DECLARATIONS[op]);

    expect(missing).toEqual([]);
  });

  it('classifies all of them as finishing open work', () => {
    const wrong = OPERATIONS.filter(
      (op) => WRITE_POLICY_DECLARATIONS[op]?.restricted !== 'FINISH_OPEN_WORK',
    );

    expect(wrong).toEqual([]);
  });

  it('guards every one of them', () => {
    const routes = [
      ...transactionsRouter.routes.map((r) => `${r.method} /transactions${r.path}`),
      ...dssrRouter.routes.map((r) => `${r.method} /dssr${r.path}`),
    ];
    const unguarded = OPERATIONS.filter(
      (op) => routes.filter((candidate) => candidate === op).length < 2,
    );

    expect(unguarded).toEqual([]);
  });
});
