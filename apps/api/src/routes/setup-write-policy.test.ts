import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import type { Role } from '@pump/shared';
import { stationSetupRouter } from './station-setup.js';
import { productsRouter } from './products.js';
import { paymentTerminalsRouter } from './payment-terminals.js';
import { WRITE_POLICY_DECLARATIONS } from '../infra/write-policy-declarations.js';

/**
 * Setup and administration under Restricted Access.
 *
 * An Organization that has stopped paying keeps its station running and keeps
 * reading its records, but stops growing: no new Stations, no new team
 * members, no catalog or infrastructure changes. Suspension goes further and
 * stops every write.
 *
 * These tests drive the real routers, so they prove the guard is actually
 * attached — the thing a unit test of the guard itself cannot show.
 */

type Subscription = { status: string; accessUntil?: string | null };

/**
 * Fake DB for the access reader's four reads. Anything past the guard would
 * need a real database, so allowed requests are asserted by the error they
 * *don't* get rather than by a 200.
 */
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
  const builder = (result: unknown[]): any => {
    const chain: any = {
      from: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit: () => chain,
      innerJoin: () => chain,
      leftJoin: () => chain,
      then: (resolve: (v: unknown[]) => void, reject?: (e: unknown) => void) =>
        Promise.resolve(result).then(resolve, reject),
    };
    return chain;
  };
  return {
    select: () => {
      if (queue.length === 0) queue = rows();
      return builder(queue.shift() ?? []);
    },
    insert: () => ({ values: () => builder([{ id: 'row-1' }]) }),
    update: () => builder([{ id: 'row-1' }]),
    execute: async () => [],
    transaction: async (run: (tx: unknown) => Promise<unknown>) => run(fakeDb(subscription)),
  };
}

const ROUTERS: ReadonlyArray<[string, any]> = [
  ['/setup', stationSetupRouter],
  ['/setup', productsRouter],
  ['/setup', paymentTerminalsRouter],
];

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
      email: 'someone@example.com',
      fullName: 'Someone',
      organizationId: 'org-1',
      role: options.role ?? 'Owner',
      assignedStationIds: ['station-1'],
    });
    await next();
  });
  for (const [prefix, router] of ROUTERS) app.route(prefix, router);

  const res = await app.request(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options.body ?? {}),
  });
  const body = (await res.json().catch(() => null)) as any;
  return { status: res.status, code: body?.error?.code ?? null };
}

const ACTIVE: Subscription = { status: 'ACTIVE' };
const RESTRICTED: Subscription = { status: 'RESTRICTED' };
const SUSPENDED: Subscription = { status: 'SUSPENDED' };
const LAPSED_GRACE: Subscription = {
  status: 'PAST_DUE',
  accessUntil: new Date(Date.now() - 86_400_000).toISOString(),
};

/** One representative mutation per family the ticket covers. */
const BLOCKED_UNDER_RESTRICTED: ReadonlyArray<[string, string, string]> = [
  ['POST', '/setup/stations', 'Station onboarding'],
  ['PUT', '/setup/stations/station-1', 'Station configuration'],
  ['POST', '/setup/onboarding/finalize', 'Station provisioning'],
  ['POST', '/setup/tanks', 'infrastructure'],
  ['PUT', '/setup/tanks/tank-1', 'infrastructure edits'],
  ['DELETE', '/setup/tanks/tank-1', 'infrastructure removal'],
  ['POST', '/setup/dispensers', 'infrastructure'],
  ['POST', '/setup/nozzles', 'infrastructure'],
  ['POST', '/setup/shift-templates', 'shift structure'],
  ['POST', '/setup/users', 'team invitations'],
  ['PUT', '/setup/users/user-2', 'team administration'],
  ['POST', '/setup/users/user-2/reactivate', 'team reactivation'],
  ['POST', '/setup/users/user-2/reset-password', 'team administration'],
  ['POST', '/setup/products', 'catalog changes'],
  ['POST', '/setup/products/import', 'catalog import'],
  ['PUT', '/setup/products/product-1', 'catalog edits'],
  ['DELETE', '/setup/products/product-1', 'catalog removal'],
  ['POST', '/setup/payment-terminals', 'integration configuration'],
  ['PUT', '/setup/payment-terminals/terminal-1', 'integration configuration'],
  ['DELETE', '/setup/payment-terminals/terminal-1', 'integration removal'],
];

describe('setup and administration under Restricted Access', () => {
  it.each(BLOCKED_UNDER_RESTRICTED)('blocks %s %s (%s)', async (method, path) => {
    const result = await request(method, path, { subscription: RESTRICTED });

    expect(result.status).toBe(403);
    expect(result.code).toBe('SUBSCRIPTION_RESTRICTED');
  });

  it('blocks the same mutations once a Payment Grace Period has lapsed', async () => {
    // PAST_DUE past its window resolves as Restricted at request time; there
    // is no separate status to set and no job to run.
    const result = await request('POST', '/setup/stations', { subscription: LAPSED_GRACE });

    expect(result.status).toBe(403);
    expect(result.code).toBe('SUBSCRIPTION_RESTRICTED');
  });

  it('still allows them during the Payment Grace Period', async () => {
    const result = await request('POST', '/setup/stations', {
      subscription: {
        status: 'PAST_DUE',
        accessUntil: new Date(Date.now() + 86_400_000).toISOString(),
      },
    });

    expect(result.code).not.toBe('SUBSCRIPTION_RESTRICTED');
  });

  it('returns a refusal an operator can act on', async () => {
    const app = new Hono<{ Variables: { db: any; user: any } }>();
    app.use('*', async (c, next) => {
      c.set('db', fakeDb(RESTRICTED));
      c.set('user', { organizationId: 'org-1', role: 'Owner', assignedStationIds: [] });
      await next();
    });
    app.route('/setup', stationSetupRouter);

    const res = await app.request('/setup/stations', { method: 'POST', body: '{}' });
    const body = (await res.json()) as any;

    expect(body.error).toMatchObject({
      code: 'SUBSCRIPTION_RESTRICTED',
      details: {
        operation: 'POST /setup/stations',
        resolution: 'COMPLETE_PAYMENT',
        actionLabel: 'Complete payment',
      },
    });
    // The copy has to say what still works, or the operator assumes the
    // station has stopped entirely.
    expect(body.error.message).toMatch(/finish open station work/i);
  });
});

describe('fuel pricing is an operation, not a setup change', () => {
  it('keeps working under Restricted Access', async () => {
    // Prices are published daily by the OMC and the pump keeps dispensing
    // regardless. Blocking the update would not stop trade — it would record
    // every later sale at the wrong price. (ADR 0004, Amendments.)
    const result = await request('POST', '/setup/pricing', { subscription: RESTRICTED });

    expect(result.code).not.toBe('SUBSCRIPTION_RESTRICTED');
  });

  it('stops for a suspended Organization, like every other write', async () => {
    const result = await request('POST', '/setup/pricing', { subscription: SUSPENDED });

    expect(result.status).toBe(403);
    expect(result.code).toBe('ORGANIZATION_SUSPENDED');
  });
});

describe('a suspended Organization', () => {
  it.each([
    ['POST', '/setup/stations'],
    ['POST', '/setup/users'],
    ['POST', '/setup/products'],
    ['PUT', '/setup/payment-terminals/terminal-1'],
    ['POST', '/setup/pricing'],
  ])('cannot %s %s', async (method, path) => {
    const result = await request(method, path, { subscription: SUSPENDED });

    expect(result.status).toBe(403);
    expect(result.code).toBe('ORGANIZATION_SUSPENDED');
  });
});

describe('Role authorization still runs', () => {
  it('refuses a Staff member with FORBIDDEN while access is normal', async () => {
    // Unchanged behaviour: the access policy is about the Organization, the
    // Role guard is about the person, and both still apply. A valid body, so
    // the request reaches the Role check rather than stopping at validation.
    const result = await request('POST', '/setup/stations', {
      subscription: ACTIVE,
      role: 'Staff',
      body: { name: 'Second Station', code: 'ST2' },
    });

    expect(result.status).toBe(403);
    expect(result.code).toBe('FORBIDDEN');
  });

  it('reports the Organization-level refusal first when both would refuse', async () => {
    // Deliberate ordering: whether the Organization may act at all is decided
    // before who is asking. Either way the caller gets a 403 they cannot
    // retry, and this keeps the reason stable regardless of the Role.
    const result = await request('POST', '/setup/stations', {
      subscription: RESTRICTED,
      role: 'Staff',
      body: { name: 'Second Station', code: 'ST2' },
    });

    expect(result.code).toBe('SUBSCRIPTION_RESTRICTED');
  });
});

describe('the family is completely covered', () => {
  it('declares every mutating route in setup, products and payment terminals', () => {
    const missing: string[] = [];
    for (const [prefix, router] of ROUTERS) {
      for (const route of router.routes) {
        if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(route.method)) continue;
        const operation = `${route.method} ${prefix}${route.path === '/' ? '' : route.path}`;
        if (!WRITE_POLICY_DECLARATIONS[operation]) missing.push(operation);
      }
    }

    expect(missing).toEqual([]);
  });

  it('guards every one of them, not just the declared ones', () => {
    // A declaration with no guard attached is the failure this ticket exists
    // to prevent: the matrix would look complete while nothing enforced it.
    const unguarded: string[] = [];
    for (const [prefix, router] of ROUTERS) {
      for (const route of router.routes) {
        if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(route.method)) continue;
        const operation = `${route.method} ${prefix}${route.path === '/' ? '' : route.path}`;
        // Hono lists middleware and handler separately for the same path; a
        // guarded route therefore has more than one entry for its method.
        const entries = router.routes.filter(
          (r: any) => r.method === route.method && r.path === route.path,
        );
        if (entries.length < 2) unguarded.push(operation);
      }
    }

    expect(unguarded).toEqual([]);
  });
});
