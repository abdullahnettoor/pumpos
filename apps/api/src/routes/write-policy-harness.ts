import { Hono } from 'hono';
import type { Role } from '@pump/shared';

/**
 * Shared harness for the write-policy route-family tests.
 *
 * Each family asks the same question of a different set of routes — "what does
 * this Organization's access mode allow here?" — so the plumbing lives once.
 * What stays in each family file is the part that is genuinely theirs: which
 * operations are allowed, which are blocked, and why.
 */

export interface Subscription {
  status: string;
  accessUntil?: string | null;
  /** A manual stop, independent of billing. */
  suspendedAt?: string | null;
}

export const ACTIVE: Subscription = { status: 'ACTIVE' };
export const RESTRICTED: Subscription = { status: 'RESTRICTED' };
export const SUSPENDED: Subscription = {
  status: 'ACTIVE',
  suspendedAt: '2026-09-01T00:00:00.000Z',
};

/** PAST_DUE whose Payment Grace Period has already run out. */
export const LAPSED_GRACE: Subscription = {
  status: 'PAST_DUE',
  accessUntil: new Date(Date.now() - 86_400_000).toISOString(),
};

/** PAST_DUE still inside its Payment Grace Period. */
export const IN_GRACE: Subscription = {
  status: 'PAST_DUE',
  accessUntil: new Date(Date.now() + 86_400_000).toISOString(),
};

/**
 * A DB fake that answers the access reader's four reads (organization,
 * station count, grants, overrides) and tolerates whatever a handler does
 * afterwards. Requests that pass the guard fail later on their own terms,
 * which is exactly what the "allowed" assertions check for.
 */
export function fakeAccessDb(subscription: Subscription) {
  let queue: unknown[][] = [];
  const reads = () => [
    [
      {
        subscriptionPlan: 'CORE',
        subscriptionStatus: subscription.status,
        accessUntil: subscription.accessUntil ? new Date(subscription.accessUntil) : null,
        suspendedAt: subscription.suspendedAt ? new Date(subscription.suspendedAt) : null,
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
      returning: () => Promise.resolve(result),
      then: (resolve: (v: unknown[]) => void, reject?: (e: unknown) => void) =>
        Promise.resolve(result).then(resolve, reject),
    };
    return chain;
  };
  const db: any = {
    select: () => {
      if (queue.length === 0) queue = reads();
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

export interface PolicyRequestOptions {
  subscription: Subscription;
  role?: Role;
  body?: unknown;
}

export interface PolicyResponse {
  status: number;
  code: string | null;
  body: any;
}

/** Build an app with the given routers mounted behind a fixed principal. */
export function makePolicyApp(
  routers: ReadonlyArray<[string, any]>,
  options: PolicyRequestOptions,
): Hono<{ Variables: { db: any; user: any } }> {
  const app = new Hono<{ Variables: { db: any; user: any } }>();
  app.use('*', async (c, next) => {
    c.set('db', fakeAccessDb(options.subscription));
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
  for (const [prefix, router] of routers) app.route(prefix, router);
  return app;
}

/** Issue one request and report what the access policy did with it. */
export async function policyRequest(
  routers: ReadonlyArray<[string, any]>,
  method: string,
  path: string,
  options: PolicyRequestOptions,
): Promise<PolicyResponse> {
  const res = await makePolicyApp(routers, options).request(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options.body ?? { stationId: 'station-1' }),
  });
  const body = (await res.json().catch(() => null)) as any;
  return { status: res.status, code: body?.error?.code ?? null, body };
}

/**
 * Which of `operations` the access policy refused? Used to assert a whole
 * workflow runs clean, rather than checking routes one at a time.
 */
export async function refusalsAcross(
  routers: ReadonlyArray<[string, any]>,
  operations: ReadonlyArray<readonly [string, string]>,
  subscription: Subscription,
): Promise<string[]> {
  const refusals: string[] = [];
  for (const [method, path] of operations) {
    const result = await policyRequest(routers, method, path, { subscription });
    if (result.code === 'SUBSCRIPTION_RESTRICTED' || result.code === 'ORGANIZATION_SUSPENDED') {
      refusals.push(`${method} ${path}`);
    }
  }
  return refusals;
}

/**
 * Mutating operations a router actually exposes, and which of them lack a
 * guard. Hono registers middleware and handler separately for the same path,
 * so a guarded route has more than one entry.
 */
export function guardCoverage(routers: ReadonlyArray<[string, any]>): {
  operations: string[];
  unguarded: string[];
} {
  const entries: string[] = [];
  for (const [prefix, router] of routers) {
    for (const route of router.routes) {
      if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(route.method)) continue;
      entries.push(`${route.method} ${prefix}${route.path === '/' ? '' : route.path}`);
    }
  }
  const operations = [...new Set(entries)];
  return {
    operations,
    unguarded: operations.filter(
      (op) => entries.filter((candidate) => candidate === op).length < 2,
    ),
  };
}
