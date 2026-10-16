import { describe, expect, it } from 'vitest';
import { Hono, type Handler } from 'hono';
import { declareWritePolicies, undeclaredOperations, type WritePolicyRegistry } from '@pump/core';
import { registeredRoutes } from '../index.js';
import { WRITE_POLICY_DECLARATIONS } from './write-policy-declarations.js';
import { writePolicyGuard, writePolicyOperationOf } from './write-policy-guard.js';

/**
 * Completeness of the Restricted Access matrix.
 *
 * The danger with a policy like this is not a wrong answer — a wrong answer
 * gets argued about and fixed. It is a *missing* answer: a mutation added
 * later that quietly inherits whatever the default is. Any default is wrong.
 * "Allow" lets an unpaid Organization keep growing; "block" strands a station
 * mid-shift.
 *
 * So the route table is read from the mounted app itself — every router and
 * every endpoint registered inline in `index.ts` (#626) — not from a list
 * someone has to remember to update. Every mutating route must have a
 * declaration, and the guard enforcing it must run before anything else on
 * that route.
 */

type RouteEntry = { method: string; path: string; handler: unknown };

/** Methods that cannot write. `ALL` is audited separately: it matches writes too. */
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const ALL = 'ALL';

/** Tenant routes live under this mount; declarations are keyed without it. */
const TENANT_MOUNT = '/api';

/**
 * Mounts whose mutations are not tenant writes and so carry no Restricted
 * Access answer. Anything else outside `/api` is reported as stray.
 */
const EXEMPT_MOUNTS: Readonly<Record<string, string>> = {
  '/platform':
    'PumpOS platform administration. The caller is a platform admin acting on an ' +
    'Organization, not the Organization itself, so its access mode does not apply.',
};

/**
 * Every `ALL` entry the app may register, and how many. Hono records both
 * `.use()` middleware and terminal `.all()` / `.mount()` handlers as `ALL`,
 * and cannot tell them apart, while an `ALL` route answers POST/PUT/DELETE
 * with no declaration. So each one is reviewed here: a new `.all()`, a
 * `.mount()`, or extra middleware on a reviewed path fails until it is added.
 */
const REVIEWED_ALL: Readonly<Record<string, { count: number; reason: string }>> = {
  '/*': { count: 3, reason: 'CORS, Server-Timing and the request-scoped db (index.ts).' },
  '/api/*': { count: 2, reason: 'Tenant auth, then the idempotency middleware (index.ts).' },
  '/platform/*': { count: 2, reason: 'Platform rate limit, then platform-admin auth (index.ts).' },
  '/platform/demos/*': { count: 1, reason: 'Demo-provisioning gate (platform-demos.ts).' },
};

function within(path: string, mount: string): boolean {
  return path === mount || path.startsWith(`${mount}/`);
}

interface RouteAudit {
  /** Every mutating operation that needs an answer, as `METHOD path`. */
  operations: string[];
  /** Mutations with no declaration. */
  undeclared: string[];
  /** Declared mutations whose first handler is not their own guard. */
  misguarded: string[];
  /** Mutations outside `/api` and the exempt mounts. */
  stray: string[];
  /** `ALL` registrations that do not match the reviewed list. */
  unreviewedAll: string[];
  /** Mutations under an exempt mount (sanity: there are some). */
  exempt: string[];
}

/**
 * Audit a route table in registration order — which, for one method and
 * path, is the order Hono runs the handlers in.
 */
function auditRoutes(
  routes: ReadonlyArray<RouteEntry>,
  declarations: WritePolicyRegistry = WRITE_POLICY_DECLARATIONS,
): RouteAudit {
  const firstHandler = new Map<string, unknown>();
  const stray = new Set<string>();
  const exempt = new Set<string>();
  const allCounts = new Map<string, number>();

  for (const route of routes) {
    if (route.method === ALL) {
      allCounts.set(route.path, (allCounts.get(route.path) ?? 0) + 1);
      continue;
    }
    if (READ_METHODS.has(route.method)) continue;

    if (Object.keys(EXEMPT_MOUNTS).some((mount) => within(route.path, mount))) {
      exempt.add(`${route.method} ${route.path}`);
      continue;
    }
    if (!within(route.path, TENANT_MOUNT)) {
      stray.add(`${route.method} ${route.path}`);
      continue;
    }
    const operation = `${route.method} ${route.path.slice(TENANT_MOUNT.length) || '/'}`;
    if (!firstHandler.has(operation)) firstHandler.set(operation, route.handler);
  }

  const operations = [...firstHandler.keys()].sort();
  const unreviewedAll = [...new Set([...allCounts.keys(), ...Object.keys(REVIEWED_ALL)])]
    .filter((path) => (allCounts.get(path) ?? 0) !== (REVIEWED_ALL[path]?.count ?? 0))
    .map((path) => `ALL ${path} x${allCounts.get(path) ?? 0}`);

  return {
    operations,
    undeclared: undeclaredOperations(declarations, operations),
    misguarded: operations.filter(
      (op) => op in declarations && writePolicyOperationOf(firstHandler.get(op)) !== op,
    ),
    stray: [...stray].sort(),
    unreviewedAll,
    exempt: [...exempt].sort(),
  };
}

const ok: Handler = (c) => c.json({ success: true, data: null });

describe('the Restricted Access write-policy matrix', () => {
  const audit = auditRoutes(registeredRoutes());

  it('declares an answer for every mutating route on the app, inline or routed', () => {
    expect(
      audit.undeclared,
      `Undeclared mutations: ${audit.undeclared.join(', ')}. Add each to ` +
        'write-policy-declarations.ts with an explicit Restricted Access answer — there is no safe default.',
    ).toEqual([]);
  });

  it('runs writePolicyGuard, for its own declaration, before anything else on the route', () => {
    expect(
      audit.misguarded,
      `Declared but not guarded first: ${audit.misguarded.join(', ')}. Make ` +
        "writePolicyGuard('<operation>') the route's first handler.",
    ).toEqual([]);
  });

  it('registers no mutation outside the tenant API or an exempt mount', () => {
    expect(audit.stray, `Mutations outside ${TENANT_MOUNT}: ${audit.stray.join(', ')}`).toEqual([]);
  });

  it('registers only the reviewed ALL handlers (no .all() or .mount() escapes)', () => {
    expect(
      audit.unreviewedAll,
      `Unreviewed ALL registrations: ${audit.unreviewedAll.join(', ')}. An ALL route answers ` +
        'every method; register per-method routes, or review it in REVIEWED_ALL.',
    ).toEqual([]);
  });

  it('exempts only platform administration, never a tenant route', () => {
    expect(audit.exempt.length).toBeGreaterThan(0);
    expect(audit.exempt.filter((op) => within(op.split(' ')[1] ?? '', TENANT_MOUNT))).toEqual([]);
  });

  it('covers a real, non-trivial number of routes (the enumeration still works)', () => {
    // Guards against the enumeration silently returning nothing — which would
    // make the test above pass for the wrong reason.
    expect(audit.operations.length).toBeGreaterThan(50);
  });

  it('declares nothing that is not a route, so the matrix cannot rot', () => {
    const live = new Set(audit.operations);
    const stale = Object.keys(WRITE_POLICY_DECLARATIONS).filter((op) => !live.has(op));

    expect(stale, `Declarations with no matching route: ${stale.join(', ')}`).toEqual([]);
  });

  it('gives every declaration a rationale, because the reasoning is the artefact', () => {
    const unexplained = Object.values(WRITE_POLICY_DECLARATIONS)
      .filter((d) => d.rationale.trim().length < 20)
      .map((d) => d.operation);

    expect(unexplained).toEqual([]);
  });

  it('keeps the day closable: the close path is never blocked', () => {
    // The one property Restricted Access must never break — an open Business
    // Day has to be finishable, or stock and cash never reconcile.
    for (const operation of [
      'PUT /shifts/readings',
      'POST /shifts/handovers',
      'POST /shifts/close',
      'POST /shifts/business-day/close',
      'POST /dssr/daily/generate',
    ]) {
      expect(WRITE_POLICY_DECLARATIONS[operation]?.restricted).toBe('FINISH_OPEN_WORK');
    }
  });

  it('blocks growth: new Shifts, new Stations and invitations', () => {
    for (const operation of [
      'POST /shifts/open',
      'POST /shifts/business-day/open',
      'POST /setup/stations',
      'POST /setup/onboarding/finalize',
      'POST /setup/users',
    ]) {
      expect(WRITE_POLICY_DECLARATIONS[operation]?.restricted).toBe('BLOCKED');
    }
  });
});

/**
 * Regression probes: the audit has to catch the shapes that would slip past
 * a per-method, count-the-handlers check.
 */
describe('the route audit itself', () => {
  function mountedUnderApi(build: (api: Hono) => void): RouteEntry[] {
    const app = new Hono();
    const api = new Hono();
    build(api);
    app.route(TENANT_MOUNT, api);
    return app.routes;
  }

  const PROBE_REGISTRY = declareWritePolicies([
    {
      operation: 'PUT /probe',
      restricted: 'BLOCKED',
      rationale: 'A synthetic route used only by the audit regression probes.',
    },
  ]);
  const guard = writePolicyGuard('PUT /probe', { registry: PROBE_REGISTRY });

  it('flags a terminal api.all() route on the real app', () => {
    const probe = mountedUnderApi((api) => api.all('/unguarded', ok));
    const audit = auditRoutes([...registeredRoutes(), ...probe]);
    expect(audit.unreviewedAll).toEqual(['ALL /api/unguarded x1']);
  });

  it('flags a .mount() handler on the real app', () => {
    const probe = mountedUnderApi((api) => api.mount('/legacy', () => new Response('ok')));
    const audit = auditRoutes([...registeredRoutes(), ...probe]);
    expect(audit.unreviewedAll).toEqual(['ALL /api/legacy/* x1']);
  });

  it('flags extra middleware on a reviewed ALL path', () => {
    const probe = mountedUnderApi((api) => api.use('*', ok));
    const audit = auditRoutes([...registeredRoutes(), ...probe]);
    expect(audit.unreviewedAll).toEqual(['ALL /api/* x3']);
  });

  it('flags a handler registered before its guard', () => {
    const probe = mountedUnderApi((api) => {
      api.put('/probe', ok);
      api.put('/probe', guard, ok);
    });
    expect(auditRoutes(probe, PROBE_REGISTRY).misguarded).toEqual(['PUT /probe']);
  });

  it('flags middleware placed ahead of the guard', () => {
    const probe = mountedUnderApi((api) => api.put('/probe', ok, guard, ok));
    expect(auditRoutes(probe, PROBE_REGISTRY).misguarded).toEqual(['PUT /probe']);
  });

  it('flags a guard enforcing another operation', () => {
    const registry = declareWritePolicies([
      ...Object.values(PROBE_REGISTRY),
      {
        operation: 'PUT /other',
        restricted: 'BLOCKED',
        rationale: 'A synthetic route used only by the audit regression probes.',
      },
    ]);
    const probe = mountedUnderApi((api) => api.put('/other', guard, ok));
    expect(auditRoutes(probe, registry).misguarded).toEqual(['PUT /other']);
  });

  it('flags an undeclared mutation, inline or under a non-standard method', () => {
    const probe = mountedUnderApi((api) => {
      api.post('/zz-probe', ok);
      api.on('PURGE', '/zz-purge', ok);
    });
    expect(auditRoutes(probe, PROBE_REGISTRY).undeclared).toEqual([
      'POST /zz-probe',
      'PURGE /zz-purge',
    ]);
  });

  it('passes a guard-first route', () => {
    const probe = mountedUnderApi((api) => api.put('/probe', guard, ok));
    const audit = auditRoutes(probe, PROBE_REGISTRY);
    expect(audit.undeclared).toEqual([]);
    expect(audit.misguarded).toEqual([]);
  });
});
