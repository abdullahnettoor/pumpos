import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { shiftsRouter } from './shifts.js';
import { idempotency } from '../infra/idempotency.js';

/**
 * Statement-budget regression guard for #229: POST /shifts/close must run in a
 * FIXED number of statements regardless of nozzle/terminal count. Before the
 * consolidation the close transaction issued ~35-50 sequential round-trips
 * (12-17s at edge RTT); this pins the consolidated shape so a per-row loop or
 * an extra read cannot silently creep back in.
 *
 * The fake db counts every statement kind; scripted results are shaped exactly
 * like the consolidated CTE payloads.
 */

function makeFakeDb(selectQueue: any[][], executeQueue: any[][], insertQueue?: any[][]) {
  const counter = { selects: 0, executes: 0, inserts: 0, updates: 0, deletes: 0 };
  const chain = (rows: any[]) => {
    const b: any = {
      from: () => b,
      innerJoin: () => b,
      leftJoin: () => b,
      where: () => b,
      orderBy: () => b,
      groupBy: () => b,
      limit: () => b,
      for: () => b,
      set: () => b,
      values: () => b,
      onConflictDoUpdate: () => b,
      onConflictDoNothing: () => b,
      returning: () => Promise.resolve(rows),
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
    insert: () => {
      counter.inserts += 1;
      return chain(insertQueue ? (insertQueue.shift() ?? []) : [{ id: 'row-1' }]);
    },
    update: () => {
      counter.updates += 1;
      return chain([]);
    },
    delete: () => {
      counter.deletes += 1;
      return chain([]);
    },
    execute: async () => {
      counter.executes += 1;
      return executeQueue.shift() ?? [];
    },
    transaction: async (run: (tx: any) => Promise<any>) => run(db),
  };
  return { db, counter };
}

const SHIFT = {
  id: 'sh-1',
  organizationId: 'org-1',
  stationId: 'st-1',
  businessDayId: 'bd-1',
  shiftTemplateId: 'tpl-1',
  status: 'OPEN',
  openedBy: 'user-1',
  openedAt: '2026-03-10T06:00:00.000Z',
  closedBy: null,
  closedAt: null,
  lockedAt: null,
  openingCash: '1000.00',
  closingCash: null,
  createdAt: '2026-03-10T06:00:00.000Z',
  updatedAt: '2026-03-10T06:00:00.000Z',
};

// A "typical" shift: 4 nozzles, 2 terminals.
const READINGS = [1, 2, 3, 4].map((i) => ({
  id: `r${i}`,
  shiftId: 'sh-1',
  nozzleId: `n${i}`,
  openingReading: '100.000',
  closingReading: '100.000',
  volumeSold: '0.000',
  testingVolume: '0.000',
  unitPrice: '100.00',
  createdAt: '2026-03-10T06:00:00.000Z',
}));
const NOZZLES = [1, 2, 3, 4].map((i) => ({ id: `n${i}`, productId: 'p1', tankId: 't1' }));

const CONTEXT_ROW = {
  shift: SHIFT,
  readings: READINGS,
  nozzles: NOZZLES,
  recon: {
    cash_collections: 300,
    card_collections: 0,
    upi_collections: 0,
    credit_collections: 0,
    drawer_expenses: 50,
    cash_income: 0,
    drawer_supplier_payments: 0,
    handover_cash: 5000,
    handover_count: 1,
    sellers: [],
  },
  credit_sales: [],
};

const PROJECTION_ROW = {
  template: { id: 'tpl-1', name: 'Morning' },
  closed_user: { id: 'user-1', fullName: 'Owner' },
  opened_user: { id: 'user-1', fullName: 'Owner' },
  nr_rows: [],
  ho_rows: [],
  te_rows: [],
  expense_rows: [],
  collection_rows: [],
  credit_rows: [],
};

const LEDGER_READ_ROW = {
  business_date: '2026-03-10',
  term_entries: [
    {
      card: '400.00',
      upi: '100.00',
      clearingAccountId: 'acc-clr',
      provider: 'HDFC',
      label: 'POS 1',
    },
    {
      card: '200.00',
      upi: '0.00',
      clearingAccountId: 'acc-clr-2',
      provider: 'ICICI',
      label: 'POS 2',
    },
  ],
  handover_card_upi: 700,
  accounts: [
    {
      id: 'acc-cash',
      stationId: 'st-1',
      accountType: 'CASH_IN_HAND',
      provider: null,
      createdAt: '2026-01-01T00:00:00.000000Z',
    },
  ],
};

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

describe('POST /shifts/close statement budget (#229)', () => {
  it('closes a 4-nozzle, 2-terminal shift within the fixed budget', async () => {
    const { db, counter } = makeFakeDb(
      [
        // writePolicyGuard access reads
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
        // route auth: the shift's stored station
        [{ stationId: 'st-1' }],
      ],
      [
        [], // advisory station-inventory lock
        [CONTEXT_ROW], // consolidated close context (shift FOR UPDATE + readings + nozzles + recon + credit)
        [], // batched closing-readings UPDATE … FROM (VALUES …)
        [PROJECTION_ROW], // consolidated summary projection source
        [], // shift summary replace (delete+insert CTE)
        [LEDGER_READ_ROW], // ledger combined read (entry date + terminal entries + accounts)
        [], // ledger replace (delete+insert CTE)
      ],
    );

    const res = await makeApp(db).request('/close', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shiftId: 'sh-1',
        payload: {
          closingCash: 6250,
          nozzleReadings: [1, 2, 3, 4].map((i) => ({ nozzleId: `n${i}`, closingReading: 150 })),
        },
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.shift.status).toBe('CLOSED');

    // The whole request: 4 access-policy reads + 1 auth read, then the close
    // transaction in EXACTLY 10 statements — 7 consolidated executes plus the
    // stock-movement insert, the shift upsert, and the events append.
    expect(counter).toEqual({
      selects: 5,
      executes: 7,
      inserts: 3, // stock movements + shift save + events outbox
      updates: 0,
      deletes: 0,
    });
  });

  it('does not grow with nozzle or terminal count', async () => {
    const readings = Array.from({ length: 12 }, (_, i) => ({
      ...READINGS[0],
      id: `r${i}`,
      nozzleId: `n${i}`,
    }));
    const nozzles = Array.from({ length: 12 }, (_, i) => ({
      id: `n${i}`,
      productId: 'p1',
      tankId: 't1',
    }));
    const termEntries = Array.from({ length: 6 }, (_, i) => ({
      card: '100.00',
      upi: '0.00',
      clearingAccountId: `acc-${i}`,
      provider: 'HDFC',
      label: `POS ${i}`,
    }));
    const { db, counter } = makeFakeDb(
      [
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
        [{ stationId: 'st-1' }],
      ],
      [
        [],
        [{ ...CONTEXT_ROW, readings, nozzles }],
        [],
        [PROJECTION_ROW],
        [],
        [{ ...LEDGER_READ_ROW, term_entries: termEntries }],
        [],
      ],
    );

    const res = await makeApp(db).request('/close', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shiftId: 'sh-1',
        payload: {
          closingCash: 6250,
          nozzleReadings: readings.map((r) => ({ nozzleId: r.nozzleId, closingReading: 150 })),
        },
      }),
    });
    expect(res.status).toBe(200);

    // Same counts as the 4-nozzle case: the budget is size-independent.
    expect(counter).toEqual({ selects: 5, executes: 7, inserts: 3, updates: 0, deletes: 0 });
  });

  // The offline/retry path: closes submitted with an Idempotency-Key run
  // through the idempotency middleware (mounted app-wide in index.ts).
  function makeIdempotentApp(db: unknown) {
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
    app.use('*', idempotency);
    app.route('/', shiftsRouter);
    return app;
  }

  const closeRequest = (app: Hono<any>) =>
    app.request('/close', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'idem-1' },
      body: JSON.stringify({
        shiftId: 'sh-1',
        payload: {
          closingCash: 6250,
          nozzleReadings: [1, 2, 3, 4].map((i) => ({ nozzleId: `n${i}`, closingReading: 150 })),
        },
      }),
    });

  it('an Idempotency-Key adds exactly two statements (key reserve + response cache)', async () => {
    const { db, counter } = makeFakeDb(
      [
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
        [{ stationId: 'st-1' }],
      ],
      [[], [CONTEXT_ROW], [], [PROJECTION_ROW], [], [LEDGER_READ_ROW], []],
    );
    const res = await closeRequest(makeIdempotentApp(db));
    expect(res.status).toBe(200);

    // The plain budget + the key reservation insert and the completion update.
    expect(counter).toEqual({
      selects: 5,
      executes: 7,
      inserts: 4, // key reserve + stock movements + shift save + events outbox
      updates: 1, // cache the response on the reservation
      deletes: 0,
    });
  });

  it('a replayed Idempotency-Key answers from the cache in two statements', async () => {
    const cached = {
      id: 'idem-row',
      requestPath: 'POST /close',
      actorId: 'user-1',
      requestHash: null,
      responseStatus: 200,
      responseBody: { success: true, data: { shift: { id: 'sh-1', status: 'CLOSED' } } },
    };
    const { db, counter } = makeFakeDb(
      [[cached]], // find the completed reservation
      [],
      [[]], // reserve insert conflicts -> no row
    );
    const res = await closeRequest(makeIdempotentApp(db));
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data.shift.status).toBe('CLOSED');

    // Reserve attempt + cached-response lookup; the close transaction never runs.
    expect(counter).toEqual({ selects: 1, executes: 0, inserts: 1, updates: 0, deletes: 0 });
  });
});
