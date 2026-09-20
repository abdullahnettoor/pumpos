import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import type { Role } from '@pump/shared';
import { shiftsRouter } from './shifts.js';
import { WRITE_POLICY_DECLARATIONS } from '../infra/write-policy-declarations.js';

/**
 * The Shift and Business Day lifecycle under Restricted Access.
 *
 * This is the family where getting it wrong does real damage. A station that
 * has fuel in its nozzles and cash in its drawer must be able to finish the
 * day — record readings, hand over, close the Shift, close the day — or its
 * stock and cash never reconcile and the operator is left with an unresolvable
 * mess. Restricted Access stops the *next* cycle, not the current one.
 *
 * Suspension is different: it is a security, legal, fraud or abuse stop, so it
 * takes precedence over finishing the day.
 */

type Subscription = { status: string; accessUntil?: string | null };

/** Fake DB answering the access reader's four reads. */
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
  app.route('/shifts', shiftsRouter);

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

/** The path a station must be able to walk to finish its day. */
const CLOSE_PATH: ReadonlyArray<[string, string, string]> = [
  ['PUT', '/shifts/readings', 'nozzle readings are how the Shift is reconciled'],
  ['POST', '/shifts/handovers', 'the attendant hands over cash and card takings'],
  ['POST', '/shifts/close', 'drawer accountability has to be settled'],
  ['POST', '/shifts/lock', 'sealing a closed Shift completes it'],
  ['POST', '/shifts/business-day/close', 'the day must be closable or stock never reconciles'],
];

const NEW_CYCLE: ReadonlyArray<[string, string, string]> = [
  ['POST', '/shifts/open', 'a new Shift is new work'],
  ['POST', '/shifts/business-day/open', 'a new Business Day starts new trading'],
  ['POST', '/shifts/reopen', 'reopening sealed work is an administrative correction'],
];

describe('finishing the current operating cycle under Restricted Access', () => {
  it.each(CLOSE_PATH)('allows %s %s — %s', async (method, path) => {
    const result = await request(method, path, { subscription: RESTRICTED });

    expect(result.code).not.toBe('SUBSCRIPTION_RESTRICTED');
  });

  it('walks the whole close path without a single access refusal', async () => {
    // End to end: the sequence an operator actually performs at end of day.
    // Any one of these refusing would strand the station mid-close.
    const refusals: string[] = [];
    for (const [method, path] of CLOSE_PATH) {
      const result = await request(method, path, { subscription: RESTRICTED });
      if (result.code === 'SUBSCRIPTION_RESTRICTED') refusals.push(`${method} ${path}`);
    }

    expect(refusals).toEqual([]);
  });

  it('still allows the close path once a Payment Grace Period has lapsed', async () => {
    // The grace period ending is exactly when a station is most likely to be
    // mid-day; it must not trap them.
    const refusals: string[] = [];
    for (const [method, path] of CLOSE_PATH) {
      const result = await request(method, path, { subscription: LAPSED_GRACE });
      if (result.code === 'SUBSCRIPTION_RESTRICTED') refusals.push(`${method} ${path}`);
    }

    expect(refusals).toEqual([]);
  });
});

describe('starting another cycle under Restricted Access', () => {
  it.each(NEW_CYCLE)('blocks %s %s — %s', async (method, path) => {
    const result = await request(method, path, { subscription: RESTRICTED });

    expect(result.status).toBe(403);
    expect(result.code).toBe('SUBSCRIPTION_RESTRICTED');
  });

  it('tells the operator what still works, so they do not assume everything stopped', async () => {
    const app = new Hono<{ Variables: { db: any; user: any } }>();
    app.use('*', async (c, next) => {
      c.set('db', fakeDb(RESTRICTED));
      c.set('user', {
        organizationId: 'org-1',
        role: 'Manager',
        assignedStationIds: ['station-1'],
      });
      await next();
    });
    app.route('/shifts', shiftsRouter);

    const res = await app.request('/shifts/open', { method: 'POST', body: '{}' });
    const body = (await res.json()) as any;

    expect(body.error).toMatchObject({
      code: 'SUBSCRIPTION_RESTRICTED',
      details: { operation: 'POST /shifts/open', resolution: 'COMPLETE_PAYMENT' },
    });
    expect(body.error.message).toMatch(/finish open station work/i);
  });
});

describe('a suspended Organization', () => {
  it.each([...CLOSE_PATH, ...NEW_CYCLE])('cannot %s %s', async (method, path) => {
    // Suspension outranks finishing the day: it is a security, legal, fraud or
    // abuse stop, not a billing state.
    const result = await request(method, path, { subscription: SUSPENDED });

    expect(result.status).toBe(403);
    expect(result.code).toBe('ORGANIZATION_SUSPENDED');
  });
});

describe('the rest of the rules still decide', () => {
  it('leaves Role authorization in place once the access policy passes', async () => {
    // An Attendant may not open a Shift; that is unchanged and unrelated to
    // whether the Organization has paid.
    const result = await request('POST', '/shifts/open', {
      subscription: { status: 'ACTIVE' },
      role: 'Attendant',
    });

    expect(result.status).toBe(403);
    expect(result.code).toBe('FORBIDDEN');
  });

  it('does not let a healthy subscription bypass anything else', async () => {
    // With access normal the request proceeds to the real handler, which
    // applies Station assignment, Day Seal and Shift lifecycle rules. It fails
    // here for its own reasons — never with an access-policy code.
    const result = await request('POST', '/shifts/close', {
      subscription: { status: 'ACTIVE' },
      body: { shiftId: 'shift-1' },
    });

    expect(['SUBSCRIPTION_RESTRICTED', 'ORGANIZATION_SUSPENDED']).not.toContain(result.code);
  });
});

describe('the family is completely covered', () => {
  const mutations = () =>
    shiftsRouter.routes
      .filter((r) => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(r.method))
      .map((r) => `${r.method} /shifts${r.path === '/' ? '' : r.path}`);

  it('declares every Shift and Business Day mutation', () => {
    const missing = [...new Set(mutations())].filter((op) => !WRITE_POLICY_DECLARATIONS[op]);

    expect(missing).toEqual([]);
  });

  it('guards every one of them', () => {
    // A declaration with no guard attached would leave the matrix looking
    // complete while nothing enforced it.
    const unguarded = [...new Set(mutations())].filter(
      (op) => mutations().filter((candidate) => candidate === op).length < 2,
    );

    expect(unguarded).toEqual([]);
  });

  it('classifies each route the way the lifecycle requires', () => {
    expect(
      Object.fromEntries(
        [...new Set(mutations())].map((op) => [op, WRITE_POLICY_DECLARATIONS[op]?.restricted]),
      ),
    ).toEqual({
      'PUT /shifts/readings': 'FINISH_OPEN_WORK',
      'POST /shifts/handovers': 'FINISH_OPEN_WORK',
      'POST /shifts/close': 'FINISH_OPEN_WORK',
      'POST /shifts/lock': 'FINISH_OPEN_WORK',
      'POST /shifts/business-day/close': 'FINISH_OPEN_WORK',
      'POST /shifts/open': 'BLOCKED',
      'POST /shifts/reopen': 'BLOCKED',
      'POST /shifts/business-day/open': 'BLOCKED',
    });
  });
});
