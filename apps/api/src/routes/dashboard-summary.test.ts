import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { shiftsRouter } from './shifts.js';

/**
 * Route-level test for #147 / #155: the dashboard aggregate answers from ONE
 * SQL statement (station auth lookup + one CTE query) — today's rollup
 * aggregated from stored snapshots plus the shift identities the dashboard
 * renders. No historical enrichment, constant query count.
 */

function makeFakeDb(selectResults: any[][], executeResults: any[][]) {
  const counter = { selects: 0, executes: 0 };
  const db = {
    select: () => {
      counter.selects += 1;
      const rows = selectResults.shift() ?? [];
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
    execute: async () => {
      counter.executes += 1;
      return executeResults.shift() ?? [];
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
  it('returns today totals from SQL-aggregated snapshots plus shift identities, in one statement', async () => {
    const closedAt = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // inside reopen grace
    const { db, counter } = makeFakeDb(
      [[station]],
      [
        [
          {
            open_shift: null,
            last_shift: {
              id: 'sh-last',
              status: 'CLOSED',
              templateName: 'Morning',
              closedAt,
              dayStatus: 'OPEN',
              hasSummary: true,
              totalVolumeSold: '740.5',
              closingCash: '9000',
              fuelByProduct: [{ unit: 'L' }, { unit: 'L' }],
            },
            today: {
              shiftsClosed: 2,
              fuelSalesValue: '150000.50',
              volume: '1500.25',
              cashVariance: '-42',
            },
          },
        ],
      ],
    );
    const res = await makeApp(db).request('/dashboard-summary?stationId=st-1');
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;

    // Constant work: one auth select + one aggregate statement.
    expect(counter.selects).toBe(1);
    expect(counter.executes).toBe(1);

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
      closedAt,
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
    const openedAt = '2026-03-15T06:00:00.000Z';
    const { db, counter } = makeFakeDb(
      [[station]],
      [
        [
          {
            open_shift: {
              id: 'sh-open',
              businessDayId: 'bd-1',
              templateName: 'Morning',
              businessDate: '2026-03-15',
              openedByName: 'Asha',
              openedAt,
              openingCash: '5000',
            },
            last_shift: null,
            today: { shiftsClosed: 0, fuelSalesValue: '0', volume: '0', cashVariance: '0' },
          },
        ],
      ],
    );
    const res = await makeApp(db).request('/dashboard-summary?stationId=st-1');
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(counter.selects).toBe(1);
    expect(counter.executes).toBe(1);
    expect(body.data.activeShift).toEqual({
      id: 'sh-open',
      businessDayId: 'bd-1',
      templateName: 'Morning',
      businessDate: '2026-03-15',
      openedByName: 'Asha',
      openedAt,
      openingCash: '5000',
    });
    expect(body.data.lastShift).toBeNull();
    expect(body.data.canReopenLastShift).toBe(false);
    expect(body.data.today.shiftsClosed).toBe(0);
  });

  it('rejects a missing stationId and unauthorized stations', async () => {
    const { db } = makeFakeDb([], []);
    const missing = await makeApp(db).request('/dashboard-summary');
    expect(missing.status).toBe(400);
    const { db: db2 } = makeFakeDb([], []);
    const forbidden = await makeApp(db2, 'Staff').request('/dashboard-summary?stationId=st-9');
    expect(forbidden.status).toBe(403);
  });
});
