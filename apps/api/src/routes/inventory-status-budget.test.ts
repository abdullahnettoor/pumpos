import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { PgDialect } from 'drizzle-orm/pg-core';
import { transactionsRouter } from './transactions.js';

/**
 * Worker CPU budget for GET /transactions/inventory/status (#403): the route
 * ran ONE statement (tanks + current stock); days of cover adds exactly ONE
 * aggregate statement, however many tanks the Station has, and no builder
 * select beyond the original.
 */

const ORG = 'org-1';
const STATION = 'st-1';

function tankRow(i: number) {
  return {
    id: `t${i}`,
    name: `Tank ${i}`,
    productId: `p${i}`,
    capacity: '20000',
    productName: 'Petrol',
    productCode: 'MS',
    productUnit: 'L',
    total: '2600',
  };
}

function makeFakeDb(tanks: number, windowRow: Record<string, unknown>) {
  const counter = { selects: 0, executes: 0 };
  const statements: unknown[] = [];
  const rows = Array.from({ length: tanks }, (_, i) => tankRow(i + 1));
  const chain: any = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'then') return (resolve: (v: unknown) => void) => resolve(rows);
        return () => chain;
      },
    },
  );
  const db = {
    select: () => {
      counter.selects += 1;
      return chain;
    },
    execute: async (statement: unknown) => {
      counter.executes += 1;
      statements.push(statement);
      return [windowRow];
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
  app.route('/transactions', transactionsRouter);
  return app;
}

const WINDOW = {
  closed_days: 7,
  sold: [
    { tankId: 't1', volume: 7000 },
    { tankId: 't2', volume: 3500 },
  ],
};

describe('GET /transactions/inventory/status', () => {
  it('adds ONE statement over the original, the same for 1 and 12 tanks', async () => {
    const counts: Array<[number, number]> = [];
    for (const tanks of [1, 12]) {
      const { db, counter } = makeFakeDb(tanks, WINDOW);
      const res = await makeApp(db).request(`/transactions/inventory/status?stationId=${STATION}`);
      expect(res.status).toBe(200);
      counts.push([counter.selects, counter.executes]);
    }
    expect(counts).toEqual([
      [1, 1],
      [1, 1],
    ]);
  });

  it('adds avgDailyVolume7d and daysOfCover to each tank (null without sales)', async () => {
    const { db } = makeFakeDb(3, WINDOW);
    const res = await makeApp(db).request(`/transactions/inventory/status?stationId=${STATION}`);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data[0]).toMatchObject({
      id: 't1',
      currentVolume: 2600,
      avgDailyVolume7d: 1000,
      daysOfCover: 2.6,
    });
    expect(body.data[1]).toMatchObject({ avgDailyVolume7d: 500, daysOfCover: 5.2 });
    expect(body.data[2]).toMatchObject({ id: 't3', avgDailyVolume7d: 0, daysOfCover: null });
  });

  it('has no figure for a Station without a closed Business Day', async () => {
    const { db } = makeFakeDb(1, { closed_days: 0, sold: [] });
    const res = await makeApp(db).request(`/transactions/inventory/status?stationId=${STATION}`);
    const body = (await res.json()) as any;
    expect(body.data[0]).toMatchObject({ avgDailyVolume7d: null, daysOfCover: null });
  });

  it('keeps the tank levels, without cover, when the window read throws', async () => {
    const { db } = makeFakeDb(2, WINDOW);
    db.execute = async () => {
      throw new Error('statement timeout');
    };
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await makeApp(db).request(`/transactions/inventory/status?stationId=${STATION}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0]).toMatchObject({
      id: 't1',
      currentVolume: 2600,
      avgDailyVolume7d: null,
      daysOfCover: null,
    });
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it('makes no window read for a Station without tanks', async () => {
    const { db, counter } = makeFakeDb(0, WINDOW);
    const res = await makeApp(db).request(`/transactions/inventory/status?stationId=${STATION}`);
    expect(((await res.json()) as any).data).toEqual([]);
    expect(counter.executes).toBe(0);
  });

  it('scopes the aggregate to the caller organization and station, closed days only', async () => {
    const { db, statements } = makeFakeDb(2, WINDOW);
    await makeApp(db).request(`/transactions/inventory/status?stationId=${STATION}`);
    const { sql: text, params } = new PgDialect().sqlToQuery(statements[0] as any);
    expect(params).toContain(ORG);
    expect(params).toContain(STATION);
    expect(params).toContain(7);
    expect(text).toContain("bd.status = 'CLOSED'");
    expect(text).toContain("sm.movement_type = 'Sale'");
    expect(text).toContain("sm.reference_type = 'reading'");
    expect(text).toContain('t.organization_id');
    expect(text).toContain('t.station_id');
  });

  it('refuses a missing or foreign station without reading', async () => {
    const { db, counter } = makeFakeDb(2, WINDOW);
    expect((await makeApp(db).request('/transactions/inventory/status')).status).toBe(400);
    expect(
      (await makeApp(db, 'Manager').request('/transactions/inventory/status?stationId=st-9'))
        .status,
    ).toBe(403);
    expect(counter.selects + counter.executes).toBe(0);
  });
});
