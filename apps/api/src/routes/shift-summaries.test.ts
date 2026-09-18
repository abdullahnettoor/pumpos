import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { shiftsRouter } from './shifts.js';

/**
 * Regression guard for #145 / #113: the shift-summaries list must execute a
 * CONSTANT number of queries regardless of how many summaries exist. It
 * previously re-ran the full read-time projection per row (~11 queries per
 * summary), which exceeded the Cloudflare Workers CPU budget on dashboards.
 *
 * The fake db counts every select() and resolves the summaries join with N
 * rows; any reintroduction of per-row enrichment multiplies the count.
 */

function makeFakeDb(listRows: any[]) {
  const counter = { selects: 0 };
  const makeBuilder = (): any => {
    const rows: any[] = listRows;
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
  };
  const db = {
    select: () => {
      counter.selects += 1;
      return makeBuilder();
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
  app.route('/', shiftsRouter);
  return app;
}

function summaryRow(i: number) {
  return {
    shift: {
      id: `sh-${i}`,
      status: 'CLOSED',
      openedAt: new Date('2026-03-15T06:00:00Z'),
      closedAt: new Date('2026-03-15T14:00:00Z'),
      businessDayId: 'bd-1',
      shiftTemplateId: 't-1',
      organizationId: 'org-1',
      stationId: 'st-1',
      openingCash: '5000',
      closingCash: '9000',
    },
    snapshotData: { cashVariance: 0, totalFuelSalesValue: 1000 + i },
    generatedAt: new Date('2026-03-15T14:00:01Z'),
    businessDate: '2026-03-15',
    templateName: 'Morning',
  };
}

async function queriesForListOfSize(n: number): Promise<{ count: number; body: any }> {
  const { db, counter } = makeFakeDb(Array.from({ length: n }, (_, i) => summaryRow(i)));
  const res = await makeApp(db).request('/shift-summaries?stationId=st-1');
  expect(res.status).toBe(200);
  const body = (await res.json()) as any;
  return { count: counter.selects, body };
}

describe('GET /shift-summaries query-count regression', () => {
  it('serves stored snapshots without per-summary enrichment queries', async () => {
    const one = await queriesForListOfSize(1);
    const many = await queriesForListOfSize(100);
    // Constant query count: growing the list 100x must not add queries.
    expect(many.count).toBe(one.count);
    expect(one.count).toBe(1);
    // The stored snapshot is returned as-is.
    expect(many.body.data).toHaveLength(100);
    expect(many.body.data[0].snapshotData).toEqual({
      cashVariance: 0,
      totalFuelSalesValue: 1000,
    });
  });

  it('validates the before cursor', async () => {
    const { db } = makeFakeDb([]);
    const res = await makeApp(db).request('/shift-summaries?stationId=st-1&before=not-a-date');
    expect(res.status).toBe(400);
  });
});
