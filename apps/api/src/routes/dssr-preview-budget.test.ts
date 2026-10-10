import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { dssrRouter } from './dssr.js';

/**
 * Statement-budget guard for GET /dssr/daily/preview of an OPEN Business Day
 * (the mobile Home's sales read, #391): one day lookup plus the source reader's
 * nine selects (day, shift summaries, purchases, sales, sale lines, credit sales,
 * stock variances, products, nozzles). The count is fixed: it must not grow with
 * the number of sales, purchases or credit slips on the day. The per-document
 * counts the screen shows (credit slips, purchases) are derived in memory from
 * rows the reader already loads.
 */

function makeFakeDb(selectQueue: any[][]) {
  const counter = { selects: 0, executes: 0 };
  const chain = (rows: any[]) => {
    const b: any = {
      from: () => b,
      innerJoin: () => b,
      leftJoin: () => b,
      where: () => b,
      orderBy: () => b,
      groupBy: () => b,
      limit: () => b,
      then: (resolve: (v: any[]) => void, reject?: (e: unknown) => void) =>
        Promise.resolve(rows).then(resolve, reject),
    };
    return b;
  };
  const db: any = {
    select: () => {
      counter.selects += 1;
      return chain(selectQueue.shift() ?? []);
    },
    execute: async () => {
      counter.executes += 1;
      return [];
    },
  };
  return { db, counter };
}

function makeApp(db: unknown) {
  const app = new Hono<{ Variables: { db: any; user: any } }>();
  app.use('*', async (c, next) => {
    c.set('db', db);
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
  app.route('/', dssrRouter);
  return app;
}

const openDay = {
  id: 'bd-1',
  stationId: 'st-1',
  businessDate: '2026-03-15',
  status: 'OPEN',
};

/** A day with `n` credit slips, purchases and sales: the row counts differ, the statements do not. */
function dayQueue(n: number): any[][] {
  const rows = <T>(row: T) => Array.from({ length: n }, () => row);
  return [
    [openDay], // route: the day lookup
    [{ organizationId: 'org-1', stationId: 'st-1' }], // reader: day
    [
      {
        shiftId: 'sh-1',
        snapshotData: { totalNetVolume: 980, totalFuelSalesValue: 98000, readings: [] },
        closedAt: new Date('2026-03-15T09:00:00Z'),
        shiftSequence: 1,
        templateName: 'Morning',
      },
    ],
    rows({ amount: '1200' }), // purchases
    rows({ paymentMethod: 'Cash', saleType: 'Product', totalAmount: '500' }), // sales
    rows({ productId: 'p2', quantity: '1', lineTotal: '500' }), // sale lines
    rows({ customerType: 'Fleet', amount: '4000' }), // credit sales
    [], // stock variances
    [{ id: 'p2', name: 'Engine Oil', code: 'EO', unit: 'Piece', costBasis: '400' }],
    [{ id: 'n1', name: 'N1' }],
  ];
}

describe('GET /dssr/daily/preview open-day statement budget (#391)', () => {
  it.each([1, 40])('uses ten selects and no raw statements for %i rows per table', async (n) => {
    const { db, counter } = makeFakeDb(dayQueue(n));
    const res = await makeApp(db).request('/daily/preview?stationId=st-1&date=2026-03-15');
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;

    expect(counter).toEqual({ selects: 10, executes: 0 });
    // The Home screen's figures ride on the preview payload.
    expect(body.data.snapshotData.credit).toMatchObject({ count: n, total: 4000 * n });
    expect(body.data.snapshotData.purchases).toEqual({ total: 1200 * n, count: n });
    expect(body.data.snapshotData.shifts[0]).toMatchObject({ fuelSalesValue: 98000 });
  });

  it('answers null without reading the day when no Business Day exists yet', async () => {
    const { db, counter } = makeFakeDb([[]]);
    const res = await makeApp(db).request('/daily/preview?stationId=st-1&date=2026-03-15');
    expect(((await res.json()) as any).data).toBeNull();
    expect(counter).toEqual({ selects: 1, executes: 0 });
  });
});
