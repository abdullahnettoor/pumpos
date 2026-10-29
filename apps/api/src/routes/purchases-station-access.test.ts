import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { Hono } from 'hono';
import { PgDialect } from 'drizzle-orm/pg-core';

const clockCalls: Array<string | null | undefined> = [];
vi.mock('../infra/station-clock.js', async (orig) => ({
  ...(await orig<typeof import('../infra/station-clock.js')>()),
  loadStationClock: async (_db: unknown, _org: string, stationId: string | null | undefined) => {
    clockCalls.push(stationId);
    return null; // stop the handler right after the clock is resolved (404)
  },
}));

const { transactionsRouter, purchaseStationScope } = await import('./transactions.js');

/**
 * Purchase reads must not leak other stations' rows to a user who is not
 * authorized for them (tenant isolation), and the Entry Date clock must come
 * from the requested station. Purchases never carry a Shift (#312).
 */
const ACCESS_READS = () => [
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

function makeDb(rows: unknown[][], opts: { write?: boolean } = {}) {
  // Only mutating routes pass through the access guard's four reads.
  const reads = [...(opts.write ? ACCESS_READS() : []), ...rows];
  const wheres: unknown[] = [];
  const chain = (rows: unknown[]): any => {
    const c: any = {
      from: () => c,
      where: (w: unknown) => (wheres.push(w), c),
      orderBy: () => c,
      limit: () => c,
      innerJoin: () => c,
      leftJoin: () => c,
      then: (res: (v: unknown[]) => void, rej?: (e: unknown) => void) =>
        Promise.resolve(rows).then(res, rej),
    };
    return c;
  };
  return { db: { select: () => chain(reads.shift() ?? []) }, wheres };
}

function app(role: string, assigned: string[], db: unknown) {
  const a = new Hono<{ Variables: { db: any; user: any } }>();
  a.use('*', async (c, next) => {
    c.set('db', db);
    c.set('user', {
      id: 'u1',
      email: 'u@example.com',
      fullName: 'U',
      organizationId: 'org-1',
      role,
      assignedStationIds: assigned,
    });
    await next();
  });
  a.route('/transactions', transactionsRouter);
  return a;
}

const render = (w: unknown) => new PgDialect().sqlToQuery(w as any);

beforeEach(() => {
  clockCalls.length = 0;
});

describe('purchase reads: station access', () => {
  it('GET /purchases refuses a station the user is not assigned to', async () => {
    const res = await app('Manager', ['st-1'], makeDb([]).db).request(
      '/transactions/purchases?stationId=st-2',
    );
    expect(res.status).toBe(403);
  });

  it('GET /purchases without stationId narrows a non-owner to their stations', async () => {
    const { db, wheres } = makeDb([[]]);
    const res = await app('Manager', ['st-1', 'st-3'], db).request('/transactions/purchases');
    expect(res.status).toBe(200);
    const q = render(wheres[wheres.length - 1]);
    expect(q.params).toEqual(expect.arrayContaining(['st-1', 'st-3']));
  });

  it('a non-owner with no stations sees nothing; an Owner sees the organization', () => {
    expect(
      render(purchaseStationScope({ role: 'Manager', assignedStationIds: [] }, undefined)).sql,
    ).toBe('false');
    expect(
      purchaseStationScope({ role: 'Owner', assignedStationIds: [] }, undefined),
    ).toBeUndefined();
  });

  it('GET /purchases/gst-register refuses an unassigned station', async () => {
    const res = await app('Accountant', ['st-1'], makeDb([]).db).request(
      '/transactions/purchases/gst-register?stationId=st-2',
    );
    expect(res.status).toBe(403);
  });

  it('GET /purchases/gst-register without stationId narrows a non-owner', async () => {
    const { db, wheres } = makeDb([[]]);
    const res = await app('Accountant', ['st-1'], db).request(
      '/transactions/purchases/gst-register',
    );
    expect(res.status).toBe(200);
    expect(render(wheres[wheres.length - 1]).params).toContain('st-1');
  });

  it('GET /purchases/:id/items refuses a purchase of an unassigned station', async () => {
    const res = await app('Manager', ['st-1'], makeDb([[{ stationId: 'st-2' }]]).db).request(
      '/transactions/purchases/p-1/items',
    );
    expect(res.status).toBe(403);
  });

  it('GET /purchases/:id/items serves a purchase of an assigned station', async () => {
    const res = await app('Manager', ['st-1'], makeDb([[{ stationId: 'st-1' }], []]).db).request(
      '/transactions/purchases/p-1/items',
    );
    expect(res.status).toBe(200);
  });

  it('GET /supplier-payments refuses a station the user is not assigned to', async () => {
    const res = await app('Manager', ['st-1'], makeDb([]).db).request(
      '/transactions/supplier-payments?stationId=st-2',
    );
    expect(res.status).toBe(403);
  });

  it('GET /supplier-payments is refused to Staff, who record no supplier payments', async () => {
    const { db, wheres } = makeDb([[]]);
    const res = await app('Staff', ['st-1'], db).request(
      '/transactions/supplier-payments?stationId=st-1',
    );
    expect(res.status).toBe(403);
    expect(wheres).toHaveLength(0);
  });

  it('GET /supplier-payments reads Payments of the organization, the station and the Entry Date range', async () => {
    const { db, wheres } = makeDb([
      [{ id: 'y1', supplierName: null, amount: '10.00', entryDate: '2026-10-01' }],
    ]);
    const res = await app('Accountant', ['st-1'], db).request(
      '/transactions/supplier-payments?stationId=st-1&from=2026-10-01&to=2026-10-14',
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data[0].supplierName).toBe('Unknown Supplier');
    const q = render(wheres[wheres.length - 1]);
    expect(q.params).toEqual(
      expect.arrayContaining(['org-1', 'Payment', 'st-1', '2026-10-01', '2026-10-14']),
    );
    expect(q.sql).toMatch(
      /"entry_date" >= \$\d+ and "supplier_transactions"."entry_date" <= \$\d+/,
    );
  });

  it('GET /supplier-payments without stationId narrows a non-owner to their stations', async () => {
    const { db, wheres } = makeDb([[]]);
    const res = await app('Manager', ['st-1', 'st-3'], db).request(
      '/transactions/supplier-payments',
    );
    expect(res.status).toBe(200);
    expect(render(wheres[wheres.length - 1]).params).toEqual(
      expect.arrayContaining(['st-1', 'st-3']),
    );
  });
});

describe('POST /transactions/purchases clock', () => {
  const post = (role: string, assigned: string[], body: unknown) => {
    const { db } = makeDb([], { write: true });
    return app(role, assigned, db).request('/transactions/purchases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  };

  it('reads the clock of the requested station', async () => {
    const res = await post('Manager', ['st-1'], { stationId: 'st-1', supplierId: 's' });
    expect(res.status).toBe(404);
    expect(clockCalls).toEqual(['st-1']);
  });

  it('requires a stationId; a shiftId alone no longer locates the station', async () => {
    const res = await post('Manager', ['st-1'], { shiftId: 'sh-1', supplierId: 's' });
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).error.code).toBe('VALIDATION_ERROR');
    expect(clockCalls).toEqual([]);
  });

  it('refuses a station the user is not assigned to', async () => {
    const res = await post('Manager', ['st-1'], { stationId: 'st-2', supplierId: 's' });
    expect(res.status).toBe(403);
    expect(clockCalls).toEqual([]);
  });
});
