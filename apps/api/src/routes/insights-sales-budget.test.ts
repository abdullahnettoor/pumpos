import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { PgDialect } from 'drizzle-orm/pg-core';
import { reportsRouter } from './reports.js';

/**
 * Worker CPU budget for GET /reports/insights/sales (#401): the whole block is
 * ONE aggregate statement whatever the range, and it is tenant-scoped.
 *
 * The result shape here is what Postgres hands back for the statement's JSON
 * columns; the aggregation itself is plain SQL, so the test pins what a Worker
 * can pin: statement count, bound parameters and how the row maps to the wire.
 */

const ORG = 'org-1';
const STATION = 'st-1';

function makeFakeDb(row: Record<string, unknown>) {
  const counter = { selects: 0, executes: 0 };
  const statements: unknown[] = [];
  const db = {
    select: () => {
      counter.selects += 1;
      throw new Error('Insights must not run builder selects');
    },
    execute: async (statement: unknown) => {
      counter.executes += 1;
      statements.push(statement);
      return [row];
    },
  };
  return { db, counter, statements };
}

function makeApp(db: unknown, role = 'Owner') {
  const app = new Hono<{ Variables: { db: any; user: any } }>();
  app.use('*', async (c, next) => {
    c.set('db', db);
    c.set('user', {
      id: 'user-1',
      email: 'owner@example.com',
      fullName: 'Owner',
      organizationId: ORG,
      role,
      assignedStationIds: [STATION],
    });
    await next();
  });
  app.route('/reports', reportsRouter);
  return app;
}

const ROW = {
  bounds: {
    to: '2026-03-10',
    from: '2026-03-04',
    previousTo: '2026-03-03',
    previousFrom: '2026-02-25',
  },
  days: [
    { date: '2026-03-04', sales: 1000, volume: 100 },
    { date: '2026-03-05', sales: 3000, volume: 300 },
  ],
  previous: { sales: 2000, otherSales: 100, closedDays: 2 },
  fuel_litres: [{ productCode: 'MS', litres: 400 }],
  other_total: 250,
  top_other: { name: '20W-40 1L', quantity: 31 },
  templates: [
    {
      templateId: 't-1',
      name: 'Morning',
      shifts: 2,
      totalSales: 4000,
      totalVolume: 400,
      totalCashVariance: -420,
    },
  ],
};

describe('GET /reports/insights/sales', () => {
  it('answers from ONE statement, the same for 7 and 90 days', async () => {
    const counts: number[] = [];
    for (const days of [7, 90]) {
      const { db, counter } = makeFakeDb(ROW);
      const res = await makeApp(db).request(
        `/reports/insights/sales?stationId=${STATION}&days=${days}`,
      );
      expect(res.status).toBe(200);
      expect(counter.selects).toBe(0);
      counts.push(counter.executes);
    }
    expect(counts).toEqual([1, 1]);
  });

  it('scopes the statement to the caller organization, the station and the range length', async () => {
    const { db, statements } = makeFakeDb(ROW);
    await makeApp(db).request(`/reports/insights/sales?stationId=${STATION}&days=30`);
    const { params } = new PgDialect().sqlToQuery(statements[0] as any);
    expect(params).toContain(ORG);
    expect(params).toContain(STATION);
    expect(params).toContain(30);
  });

  it('reads sealed snapshots only: no live preview tables', async () => {
    const { db, statements } = makeFakeDb(ROW);
    await makeApp(db).request(`/reports/insights/sales?stationId=${STATION}&days=7`);
    const { sql: text } = new PgDialect().sqlToQuery(statements[0] as any);
    expect(text).toContain('dssr_snapshots');
    expect(text).toContain('shift_summaries');
    expect(text).toContain("bd.status = 'CLOSED'");
    expect(text).toContain('jsonb_to_recordset');
  });

  it('maps the aggregate row to the wire contract', async () => {
    const { db } = makeFakeDb(ROW);
    const res = await makeApp(db).request(`/reports/insights/sales?stationId=${STATION}&days=7`);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.range).toEqual({ from: '2026-03-04', to: '2026-03-10' });
    expect(body.data.previousRange).toEqual({ from: '2026-02-25', to: '2026-03-03' });
    expect(body.data.total).toBe(4000);
    expect(body.data.previousTotal).toBe(2000);
    expect(body.data.changePct).toBe(100);
    expect(body.data.average).toBe(2000);
    expect(body.data.best).toEqual({ date: '2026-03-05', sales: 3000 });
    expect(body.data.trend).toHaveLength(7);
    expect(body.data.productMix).toEqual([{ productCode: 'MS', litres: 400, share: 100 }]);
    expect(body.data.otherProducts).toEqual({
      total: 250,
      previousTotal: 100,
      changePct: 150,
      top: { name: '20W-40 1L', quantity: 31 },
    });
    expect(body.data.shiftTemplates).toEqual([
      {
        templateId: 't-1',
        name: 'Morning',
        shifts: 2,
        avgSales: 2000,
        avgVolume: 200,
        avgCashVariance: -210,
      },
    ]);
  });

  it('answers an empty report for a station with no closed day', async () => {
    const { db } = makeFakeDb({
      bounds: null,
      days: [],
      previous: { sales: 0, otherSales: 0, closedDays: 0 },
      fuel_litres: [],
      other_total: 0,
      top_other: null,
      templates: [],
    });
    const res = await makeApp(db).request(`/reports/insights/sales?stationId=${STATION}&days=7`);
    const body = (await res.json()) as any;
    expect(res.status).toBe(200);
    expect(body.data).toMatchObject({ range: null, closedDays: 0, total: 0, trend: [] });
  });

  it('refuses a range length the tab does not offer', async () => {
    const { db, counter } = makeFakeDb(ROW);
    for (const days of ['14', '', 'abc']) {
      const res = await makeApp(db).request(
        `/reports/insights/sales?stationId=${STATION}&days=${days}`,
      );
      expect(res.status).toBe(400);
    }
    expect(counter.executes).toBe(0);
  });

  it('refuses a missing stationId, a foreign station and roles that cannot view reports', async () => {
    const { db, counter } = makeFakeDb(ROW);
    expect((await makeApp(db).request('/reports/insights/sales?days=7')).status).toBe(400);
    expect(
      (await makeApp(db, 'Manager').request('/reports/insights/sales?stationId=st-9&days=7'))
        .status,
    ).toBe(403);
    for (const role of ['Staff', 'Attendant']) {
      const res = await makeApp(db, role).request(
        `/reports/insights/sales?stationId=${STATION}&days=7`,
      );
      expect(res.status).toBe(403);
    }
    expect(counter.executes).toBe(0);
  });
});
