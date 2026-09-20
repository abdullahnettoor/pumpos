import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import type { Role } from '@pump/shared';
import { transactionsRouter } from './transactions.js';
import { financeRouter } from './finance.js';
import { WRITE_POLICY_DECLARATIONS } from '../infra/write-policy-declarations.js';

/**
 * Financial operations under Restricted Access.
 *
 * The line here is between *recording money that has already moved* and
 * *changing how money is organised*. Cash a customer handed over, an expense
 * already paid out of the drawer, a card batch the acquirer has already
 * settled — all of that has happened, and refusing to record it only breaks
 * the reconciliation. Creating accounts, restating opening balances or adding
 * categories can wait until the bill is paid.
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
  app.route('/finance', financeRouter);

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

/** Money that has already moved. */
const ENTRIES: ReadonlyArray<[string, string, string]> = [
  ['POST', '/transactions/collections', 'the customer has already handed over the cash'],
  ['POST', '/transactions/expenses', 'the money has already left the drawer'],
  ['POST', '/transactions/expenses/expense-1/void', 'correcting a mis-keyed expense'],
  ['POST', '/transactions/income', 'income received today belongs in today’s books'],
  ['POST', '/transactions/income/income-1/void', 'correcting a mis-keyed entry'],
  ['POST', '/transactions/supplier-payments', 'cash paid to a supplier has already gone'],
  ['POST', '/finance/transfers', 'a cash drop moves money that physically moved'],
  ['POST', '/finance/settlements', 'the acquirer has already paid the batch out'],
  ['POST', '/finance/accounts/account-1/entry', 'a ledger entry records a movement that happened'],
];

/** Changing how money is organised. */
const CONFIGURATION: ReadonlyArray<[string, string, string]> = [
  ['POST', '/finance/accounts', 'creating an account is setup'],
  ['PUT', '/finance/accounts/account-1', 'editing an account is setup'],
  [
    'PUT',
    '/finance/accounts/account-1/opening',
    'restating an opening balance reaches into history',
  ],
  ['POST', '/transactions/expense-categories', 'category master data'],
  ['PUT', '/transactions/expense-categories/category-1', 'category master data'],
  ['POST', '/transactions/income-categories', 'category master data'],
  ['PUT', '/transactions/income-categories/category-1', 'category master data'],
  ['POST', '/transactions/customers', 'counterparty master data'],
  ['PUT', '/transactions/customers/customer-1', 'counterparty master data'],
  ['DELETE', '/transactions/customers/customer-1', 'counterparty master data'],
  ['POST', '/transactions/customers/customer-1/vehicles', 'counterparty master data'],
  ['PUT', '/transactions/vehicles/vehicle-1', 'counterparty master data'],
  ['DELETE', '/transactions/vehicles/vehicle-1', 'counterparty master data'],
  ['POST', '/transactions/suppliers', 'counterparty master data'],
  ['PUT', '/transactions/suppliers/supplier-1', 'counterparty master data'],
  ['DELETE', '/transactions/suppliers/supplier-1', 'counterparty master data'],
];

describe('recording money that has already moved', () => {
  it.each(ENTRIES)('allows %s %s under Restricted Access — %s', async (method, path) => {
    const result = await request(method, path, { subscription: RESTRICTED });

    expect(result.code).not.toBe('SUBSCRIPTION_RESTRICTED');
  });

  it('lets a day of money movement be recorded without one refusal', async () => {
    // Collect from a customer, pay an expense out of the drawer, pay a
    // supplier, bank the surplus, settle the card batch.
    const workflow: ReadonlyArray<[string, string]> = [
      ['POST', '/transactions/collections'],
      ['POST', '/transactions/expenses'],
      ['POST', '/transactions/supplier-payments'],
      ['POST', '/finance/transfers'],
      ['POST', '/finance/settlements'],
    ];
    const refusals: string[] = [];
    for (const [method, path] of workflow) {
      const result = await request(method, path, { subscription: RESTRICTED });
      if (result.code === 'SUBSCRIPTION_RESTRICTED') refusals.push(`${method} ${path}`);
    }

    expect(refusals).toEqual([]);
  });

  it('keeps entries open once the Payment Grace Period has lapsed', async () => {
    const result = await request('POST', '/transactions/collections', {
      subscription: LAPSED_GRACE,
    });

    expect(result.code).not.toBe('SUBSCRIPTION_RESTRICTED');
  });
});

describe('changing how money is organised', () => {
  it.each(CONFIGURATION)('blocks %s %s under Restricted Access — %s', async (method, path) => {
    const result = await request(method, path, { subscription: RESTRICTED });

    expect(result.status).toBe(403);
    expect(result.code).toBe('SUBSCRIPTION_RESTRICTED');
  });

  it('explains the refusal in terms an operator can act on', async () => {
    const app = new Hono<{ Variables: { db: any; user: any } }>();
    app.use('*', async (c, next) => {
      c.set('db', fakeDb(RESTRICTED));
      c.set('user', { organizationId: 'org-1', role: 'Manager', assignedStationIds: [] });
      await next();
    });
    app.route('/finance', financeRouter);

    const res = await app.request('/finance/accounts', { method: 'POST', body: '{}' });
    const body = (await res.json()) as any;

    expect(body.error).toMatchObject({
      code: 'SUBSCRIPTION_RESTRICTED',
      details: { operation: 'POST /finance/accounts', resolution: 'COMPLETE_PAYMENT' },
    });
  });
});

describe('a suspended Organization', () => {
  it.each([...ENTRIES, ...CONFIGURATION])('cannot %s %s', async (method, path) => {
    const result = await request(method, path, { subscription: SUSPENDED });

    expect(result.status).toBe(403);
    expect(result.code).toBe('ORGANIZATION_SUSPENDED');
  });
});

describe('the rest of the rules still decide', () => {
  it('never yields an access-policy code while the subscription is healthy', async () => {
    // Drawer rules, Business Day anchoring, ledger behaviour and Role checks
    // run in the handler exactly as before.
    const result = await request('POST', '/transactions/collections', {
      subscription: { status: 'ACTIVE' },
    });

    expect(['SUBSCRIPTION_RESTRICTED', 'ORGANIZATION_SUSPENDED']).not.toContain(result.code);
  });
});

describe('this family is completely covered', () => {
  /** Concrete ids back to the route patterns the routers registered. */
  const asPattern = (method: string, path: string) =>
    `${method} ${path
      .replace(/\/expenses\/[^/]+\/void/, '/expenses/:id/void')
      .replace(/\/income\/[^/]+\/void/, '/income/:id/void')
      .replace(/\/accounts\/[^/]+\/entry/, '/accounts/:id/entry')
      .replace(/\/accounts\/[^/]+\/opening/, '/accounts/:id/opening')
      .replace(/\/accounts\/account-1$/, '/accounts/:id')
      .replace(/\/customers\/[^/]+\/vehicles/, '/customers/:id/vehicles')
      .replace(/\/customers\/customer-1$/, '/customers/:id')
      .replace(/\/vehicles\/vehicle-1$/, '/vehicles/:id')
      .replace(/\/suppliers\/supplier-1$/, '/suppliers/:id')
      .replace(/\/expense-categories\/category-1$/, '/expense-categories/:id')
      .replace(/\/income-categories\/category-1$/, '/income-categories/:id')}`;

  const OPERATIONS = [...ENTRIES, ...CONFIGURATION].map(([method, path]) =>
    asPattern(method, path),
  );

  it('declares every finance and financial-ledger mutation', () => {
    const missing = OPERATIONS.filter((op) => !WRITE_POLICY_DECLARATIONS[op]);

    expect(missing).toEqual([]);
  });

  it('classifies entries as finishing open work and configuration as blocked', () => {
    const entries = ENTRIES.map(([m, p]) => asPattern(m, p));
    const configuration = CONFIGURATION.map(([m, p]) => asPattern(m, p));

    expect(
      entries.filter((op) => WRITE_POLICY_DECLARATIONS[op]?.restricted !== 'FINISH_OPEN_WORK'),
    ).toEqual([]);
    expect(
      configuration.filter((op) => WRITE_POLICY_DECLARATIONS[op]?.restricted !== 'BLOCKED'),
    ).toEqual([]);
  });

  it('guards every one of them', () => {
    const routes = [
      ...transactionsRouter.routes.map((r) => `${r.method} /transactions${r.path}`),
      ...financeRouter.routes.map((r) => `${r.method} /finance${r.path}`),
    ];
    const unguarded = OPERATIONS.filter(
      (op) => routes.filter((candidate) => candidate === op).length < 2,
    );

    expect(unguarded).toEqual([]);
  });
});
