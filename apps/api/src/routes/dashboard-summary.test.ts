import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { shiftsRouter } from './shifts.js';

/**
 * Route-level test for #147 / #113: the dashboard aggregate returns the
 * current business day's sales, volume, and cash variance plus the shift
 * identities the dashboard renders — computed from stored snapshots via SQL
 * aggregation, in a small constant number of queries, with no historical
 * enrichment.
 */

function makeQueueDb(results: any[][]) {
  const counter = { selects: 0 };
  const db = {
    select: () => {
      counter.selects += 1;
      const rows = results.shift() ?? [];
      const builder: any = {
        from: () => builder,
        innerJoin: () => builder,
        leftJoin: () => builder,
        where: () => builder,
        orderBy: () => builder,
        groupBy: () => builder,
        limit: () => builder,
        then: (resolve: (v: any[]) => void, reject?: (e: unknown) => void) =>
          Promise.resolve(rows).then(resolve, reject),
      };
      return builder;
    },
  };
  return { db, counter };
}

function makeApp(db: unknown, role = 'Owner') {
  const app = new Hono<{ Variables: { db: any; user: any } }>();
  app.use('*', async (c, next) => {
    c.set('db', db);
    c.set('user', {
      id: 'user-1',
      email: 'owner@example.com',
      fullName: 'Owner',
      organizationId: 'org-1',
      role,
      assignedStationIds: [],
    });
    await next();
  });
  app.route('/', shiftsRouter);
  return app;
}

const station = { id: 'st-1', organizationId: 'org-1', settings: {} };

describe('GET /dashboard-summary', () => {
  it('returns today totals from SQL-aggregated snapshots plus shift identities, in constant queries', async () => {
    const closedAt = new Date(Date.now() - 5 * 60 * 1000); // 5 min ago — inside reopen grace
    const { db, counter } = makeQueueDb([
      [station], // station
      [], // no open shift
      [
        {
          shift: {
            id: 'sh-last',
            status: 'CLOSED',
            closedAt,
            businessDayId: 'bd-1',
            openedBy: 'user-1',
          },
          templateName: 'Morning',
        },
      ], // last shift
      [{ shiftsClosed: 2, fuelSalesValue: '150000.50', volume: '1500.25', cashVariance: '-42' }], // today rollup
      [
        {
          totalVolumeSold: '740.5',
          closingCash: '9000',
          fuelByProduct: [{ unit: 'L' }, { unit: 'L' }],
        },
      ], // last summary scalars
      [{ status: 'OPEN' }], // parent business day
    ]);
    const res = await makeApp(db).request('/dashboard-summary?stationId=st-1');
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;

    // Constant, small query count — no per-summary enrichment.
    expect(counter.selects).toBe(6);

    expect(body.data.today.shiftsClosed).toBe(2);
    expect(body.data.today.fuelSalesValue).toBe(150000.5);
    expect(body.data.today.volume).toBe(1500.25);
    expect(body.data.today.cashVariance).toBe(-42);
    expect(typeof body.data.today.businessDate).toBe('string');

    expect(body.data.activeShift).toBeNull();
    expect(body.data.lastShift).toEqual({
      id: 'sh-last',
      status: 'CLOSED',
      templateName: 'Morning',
      closedAt: closedAt.toISOString(),
    });
    expect(body.data.lastShiftSummary).toEqual({
      totalVolumeSold: 740.5,
      closingCash: 9000,
      fuelUnits: ['L'],
    });
    // Closed 5 min ago on an open day, no open shift, Owner → reopenable.
    expect(body.data.canReopenLastShift).toBe(true);
    expect(body.data.gracePeriodExpiresAt).not.toBeNull();
  });

  it('returns the open shift identity and zeroed rollup on a fresh day', async () => {
    const openedAt = new Date('2026-03-15T06:00:00Z');
    const { db, counter } = makeQueueDb([
      [station],
      [
        {
          shift: {
            id: 'sh-open',
            businessDayId: 'bd-1',
            openedBy: 'user-1',
            openedAt,
            openingCash: '5000',
          },
          templateName: 'Morning',
        },
      ], // open shift
      [], // no last shift
      [{ shiftsClosed: 0, fuelSalesValue: '0', volume: '0', cashVariance: '0' }],
      [{ fullName: 'Asha' }], // openedBy
      [{ businessDate: '2026-03-15' }], // active shift's day
    ]);
    const res = await makeApp(db).request('/dashboard-summary?stationId=st-1');
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(counter.selects).toBe(6);
    expect(body.data.activeShift).toEqual({
      id: 'sh-open',
      businessDayId: 'bd-1',
      templateName: 'Morning',
      businessDate: '2026-03-15',
      openedByName: 'Asha',
      openedAt: openedAt.toISOString(),
      openingCash: '5000',
    });
    expect(body.data.lastShift).toBeNull();
    expect(body.data.canReopenLastShift).toBe(false);
    expect(body.data.today.shiftsClosed).toBe(0);
  });

  it('rejects a missing stationId and unauthorized stations', async () => {
    const { db } = makeQueueDb([]);
    const missing = await makeApp(db).request('/dashboard-summary');
    expect(missing.status).toBe(400);
    const { db: db2 } = makeQueueDb([]);
    const forbidden = await makeApp(db2, 'Staff').request('/dashboard-summary?stationId=st-9');
    expect(forbidden.status).toBe(403);
  });
});
