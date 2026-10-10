import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { PgDialect } from 'drizzle-orm/pg-core';
import { reportsRouter } from './reports.js';
import { makeFakeDb } from './test-fakes.js';

/**
 * Worker CPU budget for the payables routes (#399): each answers from a FIXED
 * number of statements, one station lookup (the clock) and one aggregate,
 * whether the organization has 5 or 5,000 suppliers or a ledger of 10 or 10,000
 * rows, and every statement is tenant-scoped. The FIFO itself is SQL (it is
 * exercised against a real Postgres in `payables.integration.test.ts`); what a
 * Worker test can pin is statement count, bound parameters and the row -> wire
 * mapping.
 */

const ORG = 'org-1';
const STATION = 'st-1';
const SUPPLIER = '3f0c9b6e-5a1d-4c3e-9a7b-0d2e1f4a6b8c';
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

const supplierRow = (i: number) => ({
  supplierId: `s-${i}`,
  balance: '1043200.5',
  unpaidCount: 2,
  oldestUnpaidDate: '2026-09-29',
});

const listAggregate = (suppliers: unknown[], over: Record<string, unknown> = {}) => ({
  total: '1085800',
  supplierCount: suppliers.length,
  purchased: '2140000',
  paid: '1020000',
  suppliers,
  ...over,
});

const singleAggregate = (over: Record<string, unknown> = {}) => ({
  supplierId: SUPPLIER,
  balance: '1043200',
  unpaidCount: 1,
  oldestUnpaidDate: '2026-10-09',
  lastPayment: {
    amount: '980000.00',
    entryDate: '2026-10-06',
    method: 'BANK',
    fundingAccountName: 'SBI current a/c',
  },
  monthPurchased: '2072200',
  monthPaid: '980000',
  monthPurchaseCount: 2,
  monthLitres: '22000.000',
  products: [
    { productId: 'p-1', name: 'HSD', unit: 'L', quantity: '12000.000', value: '1043200.00' },
    { productId: 'p-2', name: 'MS', unit: 'L', quantity: '10000.000', value: '1029000.00' },
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

describe('GET /reports/payables', () => {
  it('answers from the same two statements for 5 or 5,000 suppliers', async () => {
    const counts: Array<{ selects: number; executes: number }> = [];
    for (const n of [5, 5000]) {
      const rows = Array.from({ length: Math.min(n, 500) }, (_, i) => supplierRow(i));
      const { db, counter } = makeFakeDb(
        [[station]],
        [[listAggregate(rows, { supplierCount: n })]],
      );
      const res = await makeApp(db).request(`/reports/payables?stationId=${STATION}`);
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
    await makeApp(db).request(`/reports/payables?stationId=${STATION}`);
    const { params, sql: text } = new PgDialect().sqlToQuery(statements[0] as any);
    expect(params).toContain(ORG);
    expect(params).toContain('2026-10-01');
    expect(params).toContain('2026-10-31');
    expect(params).toContain(500);
    expect(text).toContain('supplier_transactions');
    expect(text).toContain('SUM(l.signed) OVER');
  });

  it('maps the aggregate to the wire contract, ages from the Current Business Date', async () => {
    const { db } = makeFakeDb(
      [[station]],
      [
        [
          listAggregate([
            supplierRow(1),
            { ...supplierRow(2), balance: '50', unpaidCount: 1, oldestUnpaidDate: '2026-10-09' },
          ]),
        ],
      ],
    );
    const res = await makeApp(db).request(`/reports/payables?stationId=${STATION}`);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.total).toBe(1085800);
    expect(body.data.supplierCount).toBe(2);
    expect(body.data.month).toEqual({ purchased: 2140000, paid: 1020000 });
    expect(body.data.suppliers[0]).toEqual({
      supplierId: 's-1',
      balance: 1043200.5,
      unpaidCount: 2,
      oldestUnpaidDate: '2026-09-29',
      oldestUnpaidDays: 10,
    });
    expect(body.data.suppliers[1].oldestUnpaidDays).toBe(0);
  });

  it('answers an empty payable when nobody is owed', async () => {
    const { db } = makeFakeDb(
      [[station]],
      [[{ total: '0', supplierCount: 0, purchased: '0', paid: '0', suppliers: [] }]],
    );
    const res = await makeApp(db).request(`/reports/payables?stationId=${STATION}`);
    const body = (await res.json()) as any;
    expect(body.data).toEqual({
      total: 0,
      supplierCount: 0,
      month: { purchased: 0, paid: 0 },
      suppliers: [],
    });
  });

  it('refuses a missing stationId, a foreign station and roles that cannot see Money', async () => {
    const { db, counter } = makeFakeDb([], []);
    expect((await makeApp(db).request('/reports/payables')).status).toBe(400);
    expect((await makeApp(db, 'Manager').request('/reports/payables?stationId=st-9')).status).toBe(
      403,
    );
    for (const role of ['Staff', 'Attendant']) {
      const res = await makeApp(db, role).request(`/reports/payables?stationId=${STATION}`);
      expect(res.status).toBe(403);
    }
    expect(counter.selects + counter.executes).toBe(0);
  });

  it('is a 404, and reads no ledger, for a station outside the organization', async () => {
    const { db, counter } = makeFakeDb([[]], []);
    const res = await makeApp(db).request(`/reports/payables?stationId=${STATION}`);
    expect(res.status).toBe(404);
    expect(counter.executes).toBe(0);
  });
});

describe('GET /reports/payables/:supplierId', () => {
  it('answers from one station lookup and one aggregate', async () => {
    const { db, counter } = makeFakeDb([[station]], [[singleAggregate()]]);
    const res = await makeApp(db).request(`/reports/payables/${SUPPLIER}?stationId=${STATION}`);
    expect(res.status).toBe(200);
    expect(counter).toMatchObject({ selects: 1, executes: 1, ...NO_WRITES });
  });

  it('scopes to the organization and the supplier, with this month as each anchor says', async () => {
    const statements: unknown[] = [];
    const { db } = makeFakeDb([[station]], [[singleAggregate()]], undefined, {
      onExecute: (s) => statements.push(s),
    });
    await makeApp(db).request(`/reports/payables/${SUPPLIER}?stationId=${STATION}`);
    const { params, sql: text } = new PgDialect().sqlToQuery(statements[0] as any);
    expect(params).toContain(ORG);
    expect(params).toContain(SUPPLIER);
    expect(params).toContain('2026-10-01');
    expect(params).toContain('2026-10-31');
    expect(params).toContain(20); // product limit
    expect(text).toContain('purchase_items');
    expect(text).toContain('GROUP BY pit.product_id');
  });

  it('maps the aggregate to the wire contract', async () => {
    const { db } = makeFakeDb([[station]], [[singleAggregate()]]);
    const res = await makeApp(db).request(`/reports/payables/${SUPPLIER}?stationId=${STATION}`);
    const body = (await res.json()) as any;
    expect(body.data).toEqual({
      supplierId: SUPPLIER,
      balance: 1043200,
      unpaidCount: 1,
      oldestUnpaidDate: '2026-10-09',
      oldestUnpaidDays: 0,
      lastPayment: {
        amount: 980000,
        entryDate: '2026-10-06',
        method: 'BANK',
        fundingAccountName: 'SBI current a/c',
      },
      month: { purchased: 2072200, paid: 980000, purchaseCount: 2, quantity: 22000 },
      purchasesByProduct: [
        { productId: 'p-1', name: 'HSD', unit: 'L', quantity: 12000, value: 1043200 },
        { productId: 'p-2', name: 'MS', unit: 'L', quantity: 10000, value: 1029000 },
      ],
    });
  });

  it('carries an advance as a negative balance and hides what has no data', async () => {
    const { db } = makeFakeDb(
      [[station]],
      [
        [
          singleAggregate({
            balance: '-49000',
            unpaidCount: 0,
            oldestUnpaidDate: null,
            lastPayment: null,
            monthPurchaseCount: 0,
            monthPurchased: '0',
            products: [],
          }),
        ],
      ],
    );
    const res = await makeApp(db).request(`/reports/payables/${SUPPLIER}?stationId=${STATION}`);
    const body = (await res.json()) as any;
    expect(body.data).toMatchObject({
      balance: -49000,
      unpaidCount: 0,
      oldestUnpaidDate: null,
      oldestUnpaidDays: null,
      lastPayment: null,
      purchasesByProduct: [],
    });
  });

  it('is a 404 for a supplier outside the organization', async () => {
    const { db } = makeFakeDb([[station]], [[]]);
    const res = await makeApp(db).request(
      `/reports/payables/3f0c9b6e-5a1d-4c3e-9a7b-0d2e1f4a6b99?stationId=${STATION}`,
    );
    expect(res.status).toBe(404);
  });

  it('is a 404, not a 500, for an id that is not a uuid, and reads nothing', async () => {
    const { db, counter } = makeFakeDb([[station]], [[]]);
    for (const bad of ['s-1', 'not-a-uuid', '123']) {
      const res = await makeApp(db).request(`/reports/payables/${bad}?stationId=${STATION}`);
      expect(res.status).toBe(404);
      expect(((await res.json()) as any).error.code).toBe('NOT_FOUND');
    }
    expect(counter.selects + counter.executes).toBe(0);
  });

  it('refuses roles that cannot see Money and a foreign station before any read', async () => {
    const { db, counter } = makeFakeDb([], []);
    expect(
      (await makeApp(db, 'Staff').request(`/reports/payables/${SUPPLIER}?stationId=${STATION}`))
        .status,
    ).toBe(403);
    expect(
      (await makeApp(db, 'Manager').request(`/reports/payables/${SUPPLIER}?stationId=st-9`)).status,
    ).toBe(403);
    expect(counter.selects + counter.executes).toBe(0);
  });
});
