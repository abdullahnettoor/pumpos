import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { schema } from '@pump/db';
import type { Role } from '@pump/shared';

/**
 * Station scope on id-resolved mutations (#247).
 *
 * #243 fixed the writes that *create* a row: the station comes from the shift.
 * These are the ones that change a row that already exists, where the caller
 * names only an id. Their station has to come from the stored row — through the
 * Business Day that owns it — and nothing the caller sends.
 *
 * They were organization-scoped but not station-scoped, so a Manager assigned
 * to one station could void an entry belonging to another station of the same
 * organization. Voiding is worse than recording: it moves a figure an operator
 * has already reconciled against, after the fact.
 */

const contexts: Array<Record<string, unknown>> = [];

vi.mock('../infra/context.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, any>>();
  return {
    ...actual,
    buildContext: (user: unknown, opts: Record<string, unknown> = {}) => {
      contexts.push(opts);
      return actual.buildContext(user, opts);
    },
  };
});

const { transactionsRouter } = await import('./transactions.js');

const ORG = 'org-1';
const MINE = 'station-1';
const THEIRS = 'station-2';
const ROW = 'row-1';

/** Keyed on the table given to `.from()`, so read order does not matter. */
function fakeDb(rows: Map<unknown, unknown[]>) {
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
      set: step(),
      returning: () => Promise.resolve(rows.get(table) ?? []),
      then: (res: (v: unknown[]) => void, rej?: (e: unknown) => void) =>
        Promise.resolve(rows.get(table) ?? []).then(res, rej),
    });
    return self;
  };
  const db: any = {
    select: () => chain(),
    insert: () => ({ values: () => chain() }),
    update: () => chain(),
    delete: () => chain(),
    execute: async () => [],
    transaction: async (run: (tx: unknown) => Promise<unknown>) => run(db),
    query: {
      shifts: { findFirst: async () => null },
    },
  };
  return db;
}

/**
 * Each id-resolved mutation, with the table its row is read from. The row shape
 * carries every column any of these handlers reads, so one fixture serves all.
 */
const VOID_ROUTES: ReadonlyArray<{
  name: string;
  method: string;
  path: string;
  table: unknown;
}> = [
  {
    name: 'expense void',
    method: 'POST',
    path: '/transactions/expenses/row-1/void',
    table: schema.expenses,
  },
  {
    name: 'income void',
    method: 'POST',
    path: '/transactions/income/row-1/void',
    table: schema.otherIncome,
  },
  {
    name: 'credit-sale void',
    method: 'DELETE',
    path: '/transactions/credit-sales/row-1',
    table: schema.customerTransactions,
  },
  {
    name: 'OMC card-sale void',
    method: 'DELETE',
    path: '/transactions/omc-card-sales/row-1',
    table: schema.customerTransactions,
  },
  {
    name: 'merchandise handover delete',
    method: 'DELETE',
    path: '/transactions/merchandise-handovers/row-1',
    table: schema.sales,
  },
];

interface Caller {
  role?: Role;
  assignedStationIds?: string[];
}

async function call(
  route: (typeof VOID_ROUTES)[number],
  { rowStation, caller = {} }: { rowStation: string | null; caller?: Caller },
) {
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
  ]);
  if (rowStation) {
    rows.set(route.table, [
      {
        id: ROW,
        organizationId: ORG,
        orgId: ORG,
        stationId: rowStation,
        // The merchandise-handover delete additionally requires an open shift
        // and a handover-captured sale before it reaches its station check.
        shiftStatus: 'OPEN',
        capture: 'MERCH_HANDOVER',
      },
    ]);
  }

  const app = new Hono<{ Variables: { db: any; user: any } }>();
  app.use('*', async (c, next) => {
    c.set('db', fakeDb(rows));
    c.set('user', {
      id: 'user-1',
      email: 'manager@example.com',
      fullName: 'Manager',
      organizationId: ORG,
      role: caller.role ?? 'Manager',
      assignedStationIds: caller.assignedStationIds ?? [MINE],
    });
    await next();
  });
  app.route('/transactions', transactionsRouter);

  const res = await app.request(route.path, {
    method: route.method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const payload = (await res.json().catch(() => null)) as any;
  return { status: res.status, code: payload?.error?.code ?? null };
}

beforeEach(() => {
  contexts.length = 0;
});

describe('id-resolved mutations refuse a foreign station', () => {
  it.each(VOID_ROUTES.map((r) => [r.name, r] as const))(
    '%s refuses a row at a station the Manager is not assigned to',
    async (_name, route) => {
      const { status, code } = await call(route, { rowStation: THEIRS });

      expect({ status, code }).toEqual({ status: 403, code: 'FORBIDDEN' });
    },
  );

  it.each(VOID_ROUTES.map((r) => [r.name, r] as const))(
    '%s allows a row at the Manager own station',
    async (_name, route) => {
      const { code } = await call(route, { rowStation: MINE });

      expect(code).not.toBe('FORBIDDEN');
    },
  );

  it.each(VOID_ROUTES.map((r) => [r.name, r] as const))(
    '%s allows an Owner at any station in the organization',
    async (_name, route) => {
      const { code } = await call(route, {
        rowStation: THEIRS,
        caller: { role: 'Owner', assignedStationIds: [] },
      });

      expect(code).not.toBe('FORBIDDEN');
    },
  );

  it.each(VOID_ROUTES.map((r) => [r.name, r] as const))(
    '%s reports a row outside the organization as not found',
    async (_name, route) => {
      // Never 403: that would confirm the id is real somewhere else.
      const { status, code } = await call(route, { rowStation: null });

      expect({ status, code }).toEqual({ status: 404, code: 'NOT_FOUND' });
    },
  );
});

describe('the station reaching the ExecutionContext', () => {
  // The claim the refusal tests do not make, and the one that regressed
  // unnoticed in #246: a route can refuse correctly and still anchor the write
  // to nothing, leaving the core's station clause with nothing to check.
  const WITH_CONTEXT = VOID_ROUTES.filter((r) => r.name !== 'merchandise handover delete');

  it.each(WITH_CONTEXT.map((r) => [r.name, r] as const))(
    '%s anchors to the station resolved from the stored row',
    async (_name, route) => {
      await call(route, {
        rowStation: THEIRS,
        caller: { role: 'Owner', assignedStationIds: [] },
      });

      expect(contexts.some((ctx) => ctx.stationId === THEIRS)).toBe(true);
      expect(contexts.some((ctx) => ctx.stationId === undefined)).toBe(false);
    },
  );
});
