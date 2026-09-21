import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { schema } from '@pump/db';
import type { Role } from '@pump/shared';
import { transactionsRouter } from './transactions.js';

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
  ['/transactions/income', {}],
  ['/transactions/expenses', {}],
  ['/transactions/collections', { paymentMethod: 'Cash' }],
  ['/transactions/purchases', {}],
  ['/transactions/supplier-payments', {}],
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
