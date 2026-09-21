import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { TENANT_ROUTERS } from './tenant-routers.js';

/**
 * Station-tenancy coverage (#235): a stationId naming another organization's
 * station must never yield that tenant's data.
 *
 * `isAuthorizedForStation` answers "may this USER touch this station" and
 * short-circuits to `true` for Owners — it says nothing about whether the
 * station belongs to the caller's ORGANIZATION. So every station-scoped GET
 * must either resolve the station under an organization_id predicate and
 * refuse (404) when it misses, or answer exclusively from queries that carry
 * the caller's organization_id (foreign stationId → empty, never foreign rows).
 *
 * Mirroring the Restricted Access coverage pattern: every GET a tenant router
 * exposes must be declared below. The routers come from TENANT_ROUTERS — the
 * same list index.ts mounts from — so a new tenant router cannot ship without
 * entering this coverage, and a new GET without a declaration fails the
 * completeness test.
 */

type Tenancy =
  /** Resolves the station org-scoped and 404s when it is foreign. */
  | 'refuses-foreign-station'
  /** Every query carries organization_id; a foreign stationId yields empty data. */
  | 'org-scoped-query'
  /** Takes no stationId (directly or via a stored record). */
  | 'not-station-scoped';

const ROUTERS = TENANT_ROUTERS;

const DECLARATIONS: Record<string, Tenancy> = {
  'GET /shifts/business-days/status': 'refuses-foreign-station',
  'GET /shifts/dashboard-summary': 'refuses-foreign-station',
  'GET /shifts/status': 'refuses-foreign-station',
  'GET /shifts/my-assignment': 'org-scoped-query',
  'GET /shifts/handovers': 'org-scoped-query',
  'GET /shifts/shift-summaries': 'org-scoped-query',

  'GET /transactions/suppliers': 'not-station-scoped',
  'GET /transactions/suppliers/:id/ledger': 'org-scoped-query',
  'GET /transactions/customers': 'not-station-scoped',
  'GET /transactions/customers/:id/ledger': 'org-scoped-query',
  'GET /transactions/customers/:id/vehicles': 'org-scoped-query',
  'GET /transactions/vehicles': 'not-station-scoped',
  'GET /transactions/vehicles/search': 'not-station-scoped',
  'GET /transactions/expense-categories': 'not-station-scoped',
  'GET /transactions/income-categories': 'not-station-scoped',
  'GET /transactions/income': 'org-scoped-query',
  'GET /transactions/income/gst-register': 'org-scoped-query',
  'GET /transactions/expenses': 'org-scoped-query',
  'GET /transactions/purchases': 'org-scoped-query',
  'GET /transactions/purchases/:id/items': 'org-scoped-query',
  'GET /transactions/purchases/gst-register': 'org-scoped-query',
  'GET /transactions/sales/tax-register': 'org-scoped-query',
  'GET /transactions/collections': 'org-scoped-query',
  'GET /transactions/credit-sales': 'org-scoped-query',
  'GET /transactions/money-movements': 'org-scoped-query',
  'GET /transactions/invoices': 'org-scoped-query',
  'GET /transactions/invoices/:id': 'org-scoped-query',
  'GET /transactions/sales/:id/invoice': 'org-scoped-query',
  'GET /transactions/sales': 'org-scoped-query',
  'GET /transactions/shifts/:id/merchandise-handovers': 'org-scoped-query',
  'GET /transactions/shifts/:id/merchandise-sales': 'org-scoped-query',
  'GET /transactions/shifts/:id/transactions': 'org-scoped-query',
  'GET /transactions/inventory/status': 'org-scoped-query',
  'GET /transactions/inventory/items': 'org-scoped-query',
  'GET /transactions/inventory/movements': 'org-scoped-query',
  'GET /transactions/inventory/variances': 'org-scoped-query',

  'GET /finance/accounts': 'org-scoped-query',
  'GET /finance/accounts/:id/ledger': 'org-scoped-query',
  'GET /finance/movements': 'org-scoped-query',

  'GET /setup/stations': 'not-station-scoped',
  'GET /setup/tanks': 'org-scoped-query',
  'GET /setup/dispensers': 'org-scoped-query',
  'GET /setup/nozzles': 'org-scoped-query',
  'GET /setup/shift-templates': 'not-station-scoped',
  'GET /setup/users': 'not-station-scoped',
  'GET /setup/onboarding/status': 'refuses-foreign-station',
  'GET /setup/pricing': 'org-scoped-query',
  'GET /setup/pricing/history': 'org-scoped-query',

  'GET /setup/payment-terminals': 'org-scoped-query',
  'GET /setup/products': 'not-station-scoped',

  'GET /dssr/daily': 'org-scoped-query',
  'GET /dssr/daily/preview': 'org-scoped-query',
  'GET /dssr/daily/range': 'org-scoped-query',

  'GET /reports/attendant-handovers': 'org-scoped-query',

  'GET /access': 'not-station-scoped',
};

function exposedGets(): string[] {
  const entries: string[] = [];
  for (const [prefix, router] of ROUTERS) {
    for (const route of router.routes) {
      if (route.method !== 'GET') continue;
      entries.push(`GET ${prefix}${route.path === '/' ? '' : route.path}`);
    }
  }
  return [...new Set(entries)];
}

/**
 * A DB where every org-scoped lookup misses: all selects and raw executes
 * resolve to zero rows — exactly what the database answers when the requested
 * station belongs to another organization.
 */
function emptyDb() {
  const chain: any = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    groupBy: () => chain,
    limit: () => chain,
    innerJoin: () => chain,
    leftJoin: () => chain,
    for: () => chain,
    then: (resolve: (v: unknown[]) => void, reject?: (e: unknown) => void) =>
      Promise.resolve([]).then(resolve, reject),
  };
  return { select: () => chain, execute: async () => [] };
}

function makeApp() {
  const app = new Hono<{ Variables: { db: any; user: any } }>();
  app.use('*', async (c, next) => {
    c.set('db', emptyDb());
    // An Owner: passes every role/assignment guard, so only the
    // organization-scoping of the station lookup itself stands between the
    // request and a 200.
    c.set('user', {
      id: 'user-1',
      email: 'owner@example.com',
      fullName: 'Owner',
      organizationId: 'org-1',
      role: 'Owner',
      assignedStationIds: [],
    });
    await next();
  });
  for (const [prefix, router] of ROUTERS) app.route(prefix, router);
  return app;
}

describe('station-scoped GET tenancy coverage (#235)', () => {
  it('every exposed GET declares its tenancy answer', () => {
    const undeclared = exposedGets().filter((op) => !(op in DECLARATIONS));
    expect(undeclared).toEqual([]);
  });

  it('declares no route the routers do not expose', () => {
    const exposed = new Set(exposedGets());
    const stale = Object.keys(DECLARATIONS).filter((op) => !exposed.has(op));
    expect(stale).toEqual([]);
  });

  const refusers = Object.entries(DECLARATIONS)
    .filter(([, tenancy]) => tenancy === 'refuses-foreign-station')
    .map(([op]) => op);

  it.each(refusers)('%s refuses a foreign-organization stationId', async (op) => {
    const path = op.slice('GET '.length);
    const res = await makeApp().request(`${path}?stationId=st-foreign&date=2026-03-10`);
    expect([403, 404]).toContain(res.status);
    const body = (await res.json()) as any;
    expect(body.success).toBe(false);
  });
});

/**
 * The write-side counterpart: station-anchored mutations must refuse a
 * foreign stationId before anchoring the record to it. These routes sit
 * behind writePolicyGuard, whose access reader issues four selects first —
 * the scripted db serves those, then answers every further lookup (the
 * org-scoped station resolution) with zero rows, exactly what the database
 * returns for another tenant's station.
 */
function accessThenEmptyDb() {
  let selects = 0;
  const accessReads: unknown[][] = [
    [
      {
        subscriptionPlan: 'CORE',
        subscriptionStatus: 'ACTIVE',
        accessUntil: null,
        suspendedAt: null,
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
      groupBy: () => chain,
      limit: () => chain,
      innerJoin: () => chain,
      leftJoin: () => chain,
      for: () => chain,
      returning: () => Promise.resolve(result),
      then: (resolve: (v: unknown[]) => void, reject?: (e: unknown) => void) =>
        Promise.resolve(result).then(resolve, reject),
    };
    return chain;
  };
  const db: any = {
    select: () => chainable(selects < accessReads.length ? accessReads[selects++] : []),
    insert: () => ({ values: () => chainable([{ id: 'row-1' }]) }),
    update: () => chainable([{ id: 'row-1' }]),
    delete: () => chainable([{ id: 'row-1' }]),
    execute: async () => [],
    transaction: async (run: (tx: unknown) => Promise<unknown>) => run(db),
  };
  return db;
}

const MUTATING_STATION_ANCHORED: ReadonlyArray<[string, string]> = [
  ['POST', '/transactions/sales'],
  ['POST', '/transactions/expenses'],
  ['POST', '/transactions/collections'],
  ['POST', '/transactions/purchases'],
  ['POST', '/transactions/income'],
  ['POST', '/transactions/supplier-payments'],
  ['POST', '/shifts/open'],
  ['POST', '/shifts/business-day/open'],
  ['POST', '/finance/accounts'],
  ['POST', '/setup/tanks'],
  ['POST', '/setup/dispensers'],
  ['POST', '/setup/nozzles'],
  ['POST', '/setup/payment-terminals'],
];

describe('station-anchored mutation tenancy (#235)', () => {
  it.each(MUTATING_STATION_ANCHORED)(
    '%s %s refuses a foreign-organization stationId',
    async (method, path) => {
      const app = new Hono<{ Variables: { db: any; user: any } }>();
      app.use('*', async (c, next) => {
        c.set('db', accessThenEmptyDb());
        c.set('user', {
          id: 'user-1',
          email: 'owner@example.com',
          fullName: 'Owner',
          organizationId: 'org-1',
          role: 'Owner',
          assignedStationIds: [],
        });
        await next();
      });
      for (const [prefix, router] of ROUTERS) app.route(prefix, router);
      const res = await app.request(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stationId: 'st-foreign', shiftTemplateId: 'tpl-1' }),
      });
      expect([403, 404]).toContain(res.status);
      const body = (await res.json()) as any;
      expect(body.success).toBe(false);
    },
  );
});
