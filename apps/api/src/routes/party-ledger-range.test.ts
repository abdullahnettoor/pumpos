import { describe, expect, it } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { Hono } from 'hono';
import { transactionsRouter } from './transactions.js';

type LedgerRows = Array<Record<string, unknown>>;

function makeDb(selectQueue: unknown[][], executeQueue: unknown[][] = []) {
  const counter = { selects: 0, executes: 0 };
  const statements: string[] = [];
  const dialect = new PgDialect();
  const chain = (rows: unknown[]) => {
    const query: any = {
      from: () => query,
      innerJoin: () => query,
      leftJoin: () => query,
      where: () => query,
      orderBy: () => query,
      limit: () => query,
      then: (resolve: (value: unknown[]) => void, reject?: (error: unknown) => void) =>
        Promise.resolve(rows).then(resolve, reject),
    };
    return query;
  };
  return {
    counter,
    statements,
    db: {
      select: () => {
        counter.selects += 1;
        return chain(selectQueue.shift() ?? []);
      },
      execute: async (statement: any) => {
        counter.executes += 1;
        statements.push(dialect.sqlToQuery(statement).sql);
        return executeQueue.shift() ?? [];
      },
    },
  };
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
  app.route('/', transactionsRouter);
  return app;
}

const customer = {
  id: 'customer-1',
  organizationId: 'org-1',
  stationId: 'station-1',
  customerType: 'Credit',
  name: 'Fleet Co',
  phone: null,
  creditLimit: '0',
  fleetCode: null,
  isPrepaid: false,
  prepaidBalance: '0',
  settlementCycle: 'OPEN',
  metadata: null,
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

const supplier = {
  id: 'supplier-1',
  organizationId: 'org-1',
  stationId: 'station-1',
  name: 'Fuel Co',
  phone: null,
  metadata: null,
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

function statementResult(entries: LedgerRows, opening = '100.00', closing = '160.00') {
  return [
    {
      periodOpeningBalance: opening,
      closingBalance: closing,
      entries,
    },
  ];
}

describe('party ledger date-range reads', () => {
  it('returns ranged customer statement rows and uses a fixed number of statements', async () => {
    const entries = [
      {
        id: 'sale-1',
        transactionType: 'Credit Sale',
        amount: 80,
        businessDate: '2026-03-02',
        runningBalance: 180,
        notes: null,
        createdAt: '2026-03-02T09:00:00.000Z',
        shiftId: 'shift-1',
        shiftBusinessDate: '2026-03-02',
        shiftSequence: 2,
        productName: 'Diesel',
        quantity: 20,
        unit: 'L',
        vehicleRegistration: 'KL01AB1234',
        method: null,
        reference: null,
        fundingAccountName: null,
      },
      {
        id: 'collection-1',
        transactionType: 'Collection',
        amount: 20,
        businessDate: '2026-03-03',
        runningBalance: 160,
        notes: null,
        createdAt: '2026-03-03T08:00:00.000Z',
        shiftId: null,
        shiftBusinessDate: null,
        shiftSequence: null,
        productName: null,
        quantity: null,
        unit: null,
        vehicleRegistration: null,
        method: 'UPI',
        reference: 'COL-0001',
        fundingAccountName: 'HDFC Bank',
      },
    ];
    const { db, counter, statements } = makeDb([[customer]], [statementResult(entries)]);

    const response = await makeApp(db).request(
      '/customers/customer-1/ledger?from=2026-03-01&to=2026-03-31',
    );
    const body = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({ periodOpeningBalance: 100, closingBalance: 160 });
    expect(body.data.entries).toEqual(entries);
    expect(counter).toEqual({ selects: 1, executes: 1 });
    expect(statements[0]).toContain('business_date');
    expect(statements[0]).toContain('entry_date');
    expect(statements[0]).toContain('bd.business_date AS "businessDate"');
    expect(statements[0]).toContain('co.entry_date AS "businessDate"');
    expect(statements[0]).toContain('organization_id');
  });

  it('keeps the customer ledger legacy array response when no range is sent', async () => {
    const legacy = [
      {
        id: 'sale-1',
        transactionType: 'Credit Sale',
        amount: '80.00',
        notes: null,
        createdAt: '2026-03-02T09:00:00.000Z',
        shiftId: 'shift-1',
        businessDate: '2026-03-02',
      },
    ];
    const { db, counter } = makeDb([[customer], legacy, []]);

    const response = await makeApp(db).request('/customers/customer-1/ledger');
    const body = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(body.data).toEqual(legacy);
    expect(counter).toEqual({ selects: 3, executes: 0 });
  });

  it('keeps the supplier statement statement-count constant from 10 to 10,000 rows', async () => {
    const statementCounts = [];
    for (const count of [10, 10_000]) {
      const entries = Array.from({ length: count }, (_, index) => ({
        id: `purchase-${index}`,
        transactionType: 'Purchase',
        amount: '10.00',
        businessDate: '2026-03-02',
        runningBalance: String(110 + index * 10),
        notes: null,
        createdAt: '2026-03-02T09:00:00.000Z',
        invoiceNumber: 'INV-001',
        productName: null,
        quantity: null,
        unit: null,
        tankerNumber: null,
        method: null,
        reference: null,
        fundingAccountName: null,
      }));
      const { db, counter, statements } = makeDb([[supplier]], [statementResult(entries)]);

      const response = await makeApp(db).request(
        '/suppliers/supplier-1/ledger?from=2026-03-01&to=2026-03-31',
      );
      const body = (await response.json()) as any;

      expect(response.status).toBe(200);
      expect(body.data.periodOpeningBalance).toBe(100);
      expect(body.data.entries).toHaveLength(count);
      expect(body.data.entries[0]).toMatchObject({
        invoiceNumber: 'INV-001',
        productName: null,
        quantity: null,
        unit: null,
        tankerNumber: null,
        method: null,
        reference: null,
        fundingAccountName: null,
      });
      expect(counter).toEqual({ selects: 1, executes: 1 });
      expect(statements[0]).toContain('businessDate');
      expect(statements[0]).toContain('entry_date');
      expect(statements[0]).toContain('st.entry_date');
      expect(statements[0]).toContain('organization_id');
      statementCounts.push(counter.selects + counter.executes);
    }
    expect(statementCounts).toEqual([2, 2]);
  });

  it('keeps the supplier ledger legacy array response when no range is sent', async () => {
    const legacy = [
      {
        id: 'payment-1',
        transactionType: 'Payment',
        amount: '50.00',
        fundingAccountId: 'account-1',
        accountName: 'HDFC Bank',
        notes: null,
        createdAt: '2026-03-02T09:00:00.000Z',
        businessDate: '2026-03-02',
      },
    ];
    const { db, counter } = makeDb([[supplier], legacy]);

    const response = await makeApp(db).request('/suppliers/supplier-1/ledger');
    const body = (await response.json()) as any;

    expect(response.status).toBe(200);
    expect(body.data).toEqual(legacy);
    expect(counter).toEqual({ selects: 2, executes: 0 });
  });

  it('keeps the customer statement statement-count constant from 10 to 10,000 rows', async () => {
    const statementCounts = [];
    for (const count of [10, 10_000]) {
      const entries = Array.from({ length: count }, (_, index) => ({
        id: `collection-${index}`,
        transactionType: 'Collection',
        amount: 1,
        businessDate: '2026-03-02',
        runningBalance: 100 - index,
        notes: null,
        createdAt: '2026-03-02T09:00:00.000Z',
        shiftId: null,
        shiftBusinessDate: null,
        shiftSequence: null,
        productName: null,
        quantity: null,
        unit: null,
        vehicleRegistration: null,
        method: 'UPI',
        reference: null,
        fundingAccountName: 'HDFC Bank',
      }));
      const { db, counter, statements } = makeDb([[customer]], [statementResult(entries)]);

      const response = await makeApp(db).request(
        '/customers/customer-1/ledger?from=2026-03-01&to=2026-03-31',
      );
      const body = (await response.json()) as any;

      expect(response.status).toBe(200);
      expect(body.data.entries).toHaveLength(count);
      expect(counter).toEqual({ selects: 1, executes: 1 });
      expect(statements[0]).toContain('business_date');
      expect(statements[0]).toContain('entry_date');
      expect(statements[0]).toContain('bd.business_date AS "businessDate"');
      expect(statements[0]).toContain('co.entry_date AS "businessDate"');
      statementCounts.push(counter.selects + counter.executes);
    }
    expect(statementCounts).toEqual([2, 2]);
  });

  it('rejects incomplete, invalid, or reversed date ranges before querying the ledger', async () => {
    const { db, counter } = makeDb([[customer], [customer], [customer], [customer]]);
    for (const query of [
      '?from=2026-03-01',
      '?from=2026-02-30&to=2026-03-01',
      '?from=2026-03-02&to=2026-03-01',
    ]) {
      const response = await makeApp(db).request(`/customers/customer-1/ledger${query}`);
      expect(response.status).toBe(400);
    }
    expect(counter).toEqual({ selects: 3, executes: 0 });
  });

  it('returns 404 when a party belongs to another organization', async () => {
    const { db, counter } = makeDb([[{ ...customer, organizationId: 'org-2' }]]);

    const response = await makeApp(db).request(
      '/customers/customer-1/ledger?from=2026-03-01&to=2026-03-31',
    );

    expect(response.status).toBe(404);
    expect(counter).toEqual({ selects: 1, executes: 0 });
  });

  it('returns 404 for a supplier from another organization before running statement SQL', async () => {
    const { db, counter } = makeDb([[{ ...supplier, organizationId: 'org-2' }]]);

    const response = await makeApp(db).request(
      '/suppliers/supplier-1/ledger?from=2026-03-01&to=2026-03-31',
    );

    expect(response.status).toBe(404);
    expect(counter).toEqual({ selects: 1, executes: 0 });
  });
});
