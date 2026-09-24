import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { schema } from '@pump/db';
import type { Role } from '@pump/shared';

/**
 * Every ExecutionContext the router builds during a request, so a test can ask
 * what station the write was actually anchored to — not merely whether it was
 * refused. The station reaching the context is a separate claim from the
 * refusal, and it is the one that regressed unnoticed on `/supplier-payments`.
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

/**
 * Station scope on shift-anchored money writes (#243).
 *
 * A Role says whether the *user* may act; it does not say *where*. A Manager is
 * scoped to `assignedStationIds`, and the station a sale belongs to is not the
 * caller's to assert — the Shift owns it.
 *
 * The gap these cover: guarding on a body `stationId` only guards callers who
 * choose to send one. A request carrying just a `shiftId` reached the core with
 * no station in the ExecutionContext, where `resolveShiftBusinessDayWrite`'s
 * station clause is conditional on exactly that and silently no-ops — leaving
 * only the organization check. Same organization, wrong station: the sale lands
 * on another station's Business Day and corrupts its stock and its DSSR.
 */

const ORG = 'org-1';
const MINE = 'station-1';
const THEIRS = 'station-2';
const SHIFT = 'shift-1';

/**
 * A DB fake keyed on the table given to `.from()`, so it does not depend on the
 * order a handler happens to issue its reads in.
 */
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
  };
  return db;
}

/** An organization whose access mode allows every write, so scope is what's under test. */
const accessRows = (extra: Array<[unknown, unknown[]]> = []) =>
  new Map<unknown, unknown[]>([
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
    [schema.stations, [{ id: MINE, organizationId: ORG, settings: {} }]],
    ...extra,
  ]);

interface Caller {
  role?: Role;
  assignedStationIds?: string[];
}

/** POST /transactions/sales as `caller`, against a shift owned by `shiftStation`. */
async function postSale(
  body: Record<string, unknown>,
  opts: { shiftStation: string | null; caller?: Caller },
) {
  return post('/transactions/sales', body, opts);
}

async function post(
  path: string,
  body: Record<string, unknown>,
  { shiftStation, caller = {} }: { shiftStation: string | null; caller?: Caller },
) {
  const rows = accessRows(
    shiftStation
      ? [[schema.shifts, [{ id: SHIFT, stationId: shiftStation, organizationId: ORG }]]]
      : [],
  );
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

  const res = await app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = (await res.json().catch(() => null)) as any;
  return {
    status: res.status,
    code: payload?.error?.code ?? null,
    message: payload?.error?.message ?? null,
  };
}

beforeEach(() => {
  contexts.length = 0;
});

describe('POST /transactions/sales — station scope', () => {
  it('refuses a shift at a station the Manager is not assigned to', async () => {
    const { status, code } = await postSale(
      { shiftId: SHIFT, stationId: THEIRS },
      { shiftStation: THEIRS },
    );

    expect(status).toBe(403);
    expect(code).toBe('FORBIDDEN');
  });

  it('still refuses when the caller simply omits stationId', async () => {
    // The whole point. Guarding only `body.stationId` made the guard optional:
    // leave the field out and nothing checked the station at all.
    const { status, code } = await postSale({ shiftId: SHIFT }, { shiftStation: THEIRS });

    expect(status).toBe(403);
    expect(code).toBe('FORBIDDEN');
  });

  it('refuses a stationId that contradicts the shift it names', async () => {
    // Assigned to both, so this is not an authorization refusal — it is the
    // sale naming one station while its shift belongs to another. Without an
    // explicit refusal the write would silently follow the shift.
    const { status, code, message } = await postSale(
      { shiftId: SHIFT, stationId: MINE },
      { shiftStation: THEIRS, caller: { assignedStationIds: [MINE, THEIRS] } },
    );

    expect(status).toBe(400);
    expect(code).toBe('VALIDATION_ERROR');
    expect(message).toMatch(/does not match the station of the shift/);
  });

  it('lets a Manager write to a shift at their own station', async () => {
    const { code } = await postSale({ shiftId: SHIFT }, { shiftStation: MINE });

    // It fails later on its own terms (no line items); what matters is that it
    // is not refused for scope.
    expect(code).not.toBe('FORBIDDEN');
  });

  it('lets an Owner write to any station in their organization', async () => {
    const { code } = await postSale(
      { shiftId: SHIFT },
      { shiftStation: THEIRS, caller: { role: 'Owner', assignedStationIds: [] } },
    );

    expect(code).not.toBe('FORBIDDEN');
  });

  it('leaves an unresolvable shift to the use-case, without confirming it exists', async () => {
    // Refusing here with 403 would tell a caller whether a shift id is real in
    // some other organization. Not found is the use-case's answer to give.
    const { code } = await postSale({ shiftId: SHIFT }, { shiftStation: null });

    expect(code).not.toBe('FORBIDDEN');
  });
});

/**
 * The same hole existed on every sibling that accepts a shiftId, because they
 * all used the same optional `body.stationId` guard. `/supplier-payments` had
 * no station check at all. Covered as a family so the guard cannot come off one
 * route quietly.
 */
const SHIFT_ANCHORED_WRITES: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
  ['/transactions/sales', {}],
  ['/transactions/purchases', {}],
];

describe('shift-anchored writes refuse a foreign station', () => {
  it.each(SHIFT_ANCHORED_WRITES)(
    'POST %s refuses a shift at an unassigned station',
    async (path, extra) => {
      const { status, code } = await post(
        path,
        { ...extra, shiftId: SHIFT },
        { shiftStation: THEIRS },
      );

      expect({ path, status, code }).toEqual({ path, status: 403, code: 'FORBIDDEN' });
    },
  );

  it.each(SHIFT_ANCHORED_WRITES)('POST %s allows the caller own station', async (path, extra) => {
    const { code } = await post(path, { ...extra, shiftId: SHIFT }, { shiftStation: MINE });

    expect(code).not.toBe('FORBIDDEN');
  });
});

describe('the station reaching the ExecutionContext', () => {
  // Criterion 3 of #243, and the claim the refusal tests do NOT make. The core
  // station clause is `ctx.stationId && discovered.stationId !== ctx.stationId`
  // — with no station in the context it no-ops, so a route that refuses
  // correctly can still hand the core nothing to check with.
  it.each(SHIFT_ANCHORED_WRITES)(
    'POST %s anchors to the station resolved from the shift',
    async (path, extra) => {
      // An Owner, so authorization passes and what is left to observe is which
      // station the write was anchored to when the caller named none.
      await post(
        path,
        { ...extra, shiftId: SHIFT },
        { shiftStation: THEIRS, caller: { role: 'Owner', assignedStationIds: [] } },
      );

      expect(contexts.some((ctx) => ctx.stationId === THEIRS)).toBe(true);
      expect(contexts.some((ctx) => ctx.stationId === undefined)).toBe(false);
    },
  );
});

/**
 * Office Records (ADR 0005) have no Shift: they name their station directly.
 * The station is required, must be one the caller may act on, and is what
 * reaches the ExecutionContext.
 */
const OFFICE_WRITES: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
  ['/transactions/income', {}],
  ['/transactions/expenses', {}],
  ['/transactions/collections', { paymentMethod: 'Cash' }],
  ['/transactions/supplier-payments', {}],
];

describe('office writes (ADR 0005) are scoped by their named station', () => {
  it.each(OFFICE_WRITES)('POST %s refuses an unassigned station', async (path, extra) => {
    const { status, code } = await post(
      path,
      { ...extra, stationId: THEIRS },
      { shiftStation: null },
    );
    expect({ path, status, code }).toEqual({ path, status: 403, code: 'FORBIDDEN' });
  });

  it.each(OFFICE_WRITES)('POST %s requires a station', async (path, extra) => {
    const { status, code } = await post(path, { ...extra }, { shiftStation: null });
    expect({ path, status, code }).toEqual({ path, status: 400, code: 'VALIDATION_ERROR' });
  });

  it.each(OFFICE_WRITES)('POST %s anchors to the named station', async (path, extra) => {
    await post(path, { ...extra, stationId: MINE }, { shiftStation: null });
    expect(contexts.some((ctx) => ctx.stationId === MINE)).toBe(true);
    expect(contexts.some((ctx) => ctx.stationId === undefined)).toBe(false);
  });
});
