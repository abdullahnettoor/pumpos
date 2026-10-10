import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { PgDialect } from 'drizzle-orm/pg-core';
import { reportsRouter } from './reports.js';
import { makeFakeDb } from './test-fakes.js';

/**
 * Worker CPU budget for the receivables routes (#398): each answers from a FIXED
 * number of statements, one station lookup (the clock) and one aggregate, whether
 * the organization has 5 or 5,000 customers or a ledger of 10 or 10,000 rows, and
 * every statement is tenant-scoped. The FIFO itself is SQL (it is exercised
 * against a real Postgres in `receivables.integration.test.ts`); what a Worker
 * test can pin is statement count, bound parameters and the row -> wire mapping.
 */

const ORG = 'org-1';
const STATION = 'st-1';
const CUSTOMER = 'c-1';
const station = { settings: { timezone: 'Asia/Kolkata', business_day_starts_at: '06:00' } };
const NO_WRITES = { inserts: 0, updates: 0, deletes: 0 };

function makeApp(db: unknown, role = 'Owner', assignedStationIds: string[] = [STATION]) {
  const app = new Hono<{ Variables: { db: any; user: any } }>();
  app.use('*', async (c, next) => {
    c.set('db', db);
    c.set('user', {
      id: 'user-1',
      email: 'owner@example.com',
      fullName: 'Owner',
      organizationId: ORG,
      role,
      assignedStationIds,
    });
    await next();
  });
  app.route('/reports', reportsRouter);
  return app;
}

const customerRow = (i: number) => ({
  customerId: `c-${i}`,
  balance: '1000.5',
  oldestUnpaidDate: '2026-09-21',
  d0_7: '100',
  d8_30: '400.5',
  d30plus: '500',
});

const listAggregate = (customers: unknown[], over: Record<string, unknown> = {}) => ({
  d0_7: '287',
  d8_30: '211',
  d30plus: '184',
  customerCount: customers.length,
  customers,
  ...over,
});

const singleAggregate = (over: Record<string, unknown> = {}) => ({
  customerId: CUSTOMER,
  settlementCycle: 'OPEN',
  balance: '150',
  oldestUnpaidDate: '2026-10-01',
  d0_7: '100',
  d8_30: '50',
  d30plus: '0',
  lastPayment: { amount: '40000.00', entryDate: '2026-09-18', method: 'UPI' },
  settledCount: 6,
  settledMeanDays: '23.6',
  monthCredit: '81900',
  monthSlips: 23,
  monthLitres: '812.500',
  monthPaid: '0',
  vehicles: [
    {
      vehicleId: 'v-1',
      registration: 'KL-11-AB-4521',
      type: 'Truck',
      amount: '52300',
      litres: '600',
    },
  ],
  ...over,
});

beforeEach(() => {
  vi.useFakeTimers();
  // 09:00 IST, 9 Oct 2026.
  vi.setSystemTime(new Date('2026-10-09T09:00:00+05:30'));
});
afterEach(() => {
  vi.useRealTimers();
});

describe('GET /reports/receivables', () => {
  it('answers from the same two statements for 5 or 5,000 customers', async () => {
    const counts: Array<{ selects: number; executes: number }> = [];
    for (const n of [5, 5000]) {
      const rows = Array.from({ length: Math.min(n, 500) }, (_, i) => customerRow(i));
      const { db, counter } = makeFakeDb(
        [[station]],
        [[listAggregate(rows, { customerCount: n })]],
      );
      const res = await makeApp(db).request(`/reports/receivables?stationId=${STATION}`);
      expect(res.status).toBe(200);
      expect(counter).toMatchObject(NO_WRITES);
      counts.push({ selects: counter.selects, executes: counter.executes });
    }
    expect(counts).toEqual([
      { selects: 1, executes: 1 },
      { selects: 1, executes: 1 },
    ]);
  });

  it('scopes the aggregate to the caller organization and bounds the rows it returns', async () => {
    const statements: unknown[] = [];
    const { db } = makeFakeDb([[station]], [[listAggregate([])]], undefined, {
      onExecute: (s) => statements.push(s),
    });
    await makeApp(db).request(`/reports/receivables?stationId=${STATION}`);
    const { params, sql: text } = new PgDialect().sqlToQuery(statements[0] as any);
    expect(params).toContain(ORG);
    expect(params).toContain('2026-10-09');
    expect(params).toContain(500);
    expect(text).toContain('collections');
    expect(text).toContain('SUM(d.amount) OVER');
  });

  it('maps the aggregate to the wire contract, ages from the Current Business Date', async () => {
    const { db } = makeFakeDb(
      [[station]],
      [
        [
          listAggregate([
            customerRow(1),
            { ...customerRow(2), balance: '50', oldestUnpaidDate: '2026-10-09' },
          ]),
        ],
      ],
    );
    const res = await makeApp(db).request(`/reports/receivables?stationId=${STATION}`);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.total).toBe(682);
    expect(body.data.aging).toEqual({ d0_7: 287, d8_30: 211, d30plus: 184 });
    expect(body.data.customerCount).toBe(2);
    expect(body.data.customers[0]).toEqual({
      customerId: 'c-1',
      balance: 1000.5,
      oldestUnpaidDate: '2026-09-21',
      oldestUnpaidDays: 18,
      aging: { d0_7: 100, d8_30: 400.5, d30plus: 500 },
    });
    expect(body.data.customers[1].oldestUnpaidDays).toBe(0);
  });

  it('answers an empty receivable when nobody owes', async () => {
    const { db } = makeFakeDb(
      [[station]],
      [[{ d0_7: '0', d8_30: '0', d30plus: '0', customerCount: 0, customers: [] }]],
    );
    const res = await makeApp(db).request(`/reports/receivables?stationId=${STATION}`);
    const body = (await res.json()) as any;
    expect(body.data).toEqual({
      total: 0,
      customerCount: 0,
      aging: { d0_7: 0, d8_30: 0, d30plus: 0 },
      customers: [],
    });
  });

  it('refuses a missing stationId, a foreign station and roles that cannot see Money', async () => {
    const { db, counter } = makeFakeDb([], []);
    expect((await makeApp(db).request('/reports/receivables')).status).toBe(400);
    expect(
      (await makeApp(db, 'Manager').request('/reports/receivables?stationId=st-9')).status,
    ).toBe(403);
    for (const role of ['Staff', 'Attendant']) {
      const res = await makeApp(db, role).request(`/reports/receivables?stationId=${STATION}`);
      expect(res.status).toBe(403);
    }
    expect(counter.selects + counter.executes).toBe(0);
  });

  it('is a 404, and reads no ledger, for a station outside the organization', async () => {
    const { db, counter } = makeFakeDb([[]], []);
    const res = await makeApp(db).request(`/reports/receivables?stationId=${STATION}`);
    expect(res.status).toBe(404);
    expect(counter.executes).toBe(0);
  });
});

describe('GET /reports/receivables/:customerId', () => {
  it('answers from one station lookup and one aggregate', async () => {
    const { db, counter } = makeFakeDb([[station]], [[singleAggregate()]]);
    const res = await makeApp(db).request(`/reports/receivables/${CUSTOMER}?stationId=${STATION}`);
    expect(res.status).toBe(200);
    expect(counter).toMatchObject({ selects: 1, executes: 1, ...NO_WRITES });
  });

  it('scopes to the organization and the customer, with this month as each anchor says', async () => {
    const statements: unknown[] = [];
    const { db } = makeFakeDb([[station]], [[singleAggregate()]], undefined, {
      onExecute: (s) => statements.push(s),
    });
    await makeApp(db).request(`/reports/receivables/${CUSTOMER}?stationId=${STATION}`);
    const { params } = new PgDialect().sqlToQuery(statements[0] as any);
    expect(params).toContain(ORG);
    expect(params).toContain(CUSTOMER);
    expect(params).toContain('2026-10-01');
    expect(params).toContain('2026-10-31');
    expect(params).toContain(20); // vehicle limit
    expect(params).toContain(6); // settled sample
  });

  it('maps the aggregate to the wire contract', async () => {
    const { db } = makeFakeDb([[station]], [[singleAggregate()]]);
    const res = await makeApp(db).request(`/reports/receivables/${CUSTOMER}?stationId=${STATION}`);
    const body = (await res.json()) as any;
    expect(body.data).toEqual({
      customerId: CUSTOMER,
      balance: 150,
      oldestUnpaidDate: '2026-10-01',
      oldestUnpaidDays: 8,
      aging: { d0_7: 100, d8_30: 50, d30plus: 0 },
      settlementCycle: 'OPEN',
      lastPayment: { amount: 40000, entryDate: '2026-09-18', method: 'UPI', daysAgo: 21 },
      usuallyPaysInDays: 24,
      month: { credit: 81900, slips: 23, litres: 812.5, paid: 0 },
      vehicles: [
        {
          vehicleId: 'v-1',
          registration: 'KL-11-AB-4521',
          type: 'Truck',
          amount: 52300,
          litres: 600,
        },
      ],
    });
  });

  it('hides what has too little data: no payment, fewer than 3 settled sales', async () => {
    const { db } = makeFakeDb(
      [[station]],
      [
        [
          singleAggregate({
            lastPayment: null,
            settledCount: 2,
            settledMeanDays: '10',
            balance: '0',
            oldestUnpaidDate: null,
            d0_7: '0',
            d8_30: '0',
            vehicles: [],
          }),
        ],
      ],
    );
    const res = await makeApp(db).request(`/reports/receivables/${CUSTOMER}?stationId=${STATION}`);
    const body = (await res.json()) as any;
    expect(body.data).toMatchObject({
      lastPayment: null,
      usuallyPaysInDays: null,
      oldestUnpaidDate: null,
      oldestUnpaidDays: null,
      vehicles: [],
    });
  });

  it('is a 404 for a customer outside the organization', async () => {
    const { db } = makeFakeDb([[station]], [[]]);
    const res = await makeApp(db).request(`/reports/receivables/c-9?stationId=${STATION}`);
    expect(res.status).toBe(404);
  });

  it('refuses roles that cannot see Money and a foreign station before any read', async () => {
    const { db, counter } = makeFakeDb([], []);
    expect(
      (await makeApp(db, 'Staff').request(`/reports/receivables/${CUSTOMER}?stationId=${STATION}`))
        .status,
    ).toBe(403);
    expect(
      (await makeApp(db, 'Manager').request(`/reports/receivables/${CUSTOMER}?stationId=st-9`))
        .status,
    ).toBe(403);
    expect(counter.selects + counter.executes).toBe(0);
  });
});
