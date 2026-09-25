import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { shiftsRouter } from './shifts.js';

/**
 * Statement-budget regression guard for #231: POST /shifts/handovers must run
 * in a FIXED number of statements regardless of nozzle/terminal count. Before
 * the consolidation the transaction issued ~18-25 sequential round-trips for a
 * 4-nozzle DU (context-reader Promise.all serialized by the max:1 driver,
 * replaceCurrent's select+upsert+delete+insert, and a per-nozzle UPDATE loop).
 */

function makeFakeDb(selectQueue: any[][], executeQueue: any[][]) {
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
      return chain([{ id: 'row-1' }]);
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

const SHIFT_ID = '00000000-0000-0000-0000-000000000a01';
const DAY_ID = '00000000-0000-0000-0000-000000000a02';
const DU_ID = '00000000-0000-0000-0000-000000000a03';
const ATT_ID = '00000000-0000-0000-0000-000000000a04';
const TERM_ID = '00000000-0000-0000-0000-000000000a05';
const NOZZLE_ID = (i: number) => `00000000-0000-0000-0000-0000000000${String(10 + i)}`;

const NOW = new Date('2026-03-10T10:00:00.000Z');
const SHIFT_ROW = {
  id: SHIFT_ID,
  organizationId: 'org-1',
  stationId: 'st-1',
  businessDayId: DAY_ID,
  shiftTemplateId: 'tpl-1',
  status: 'OPEN',
  openedBy: 'user-1',
  openedAt: NOW,
  closedBy: null,
  closedAt: null,
  lockedAt: null,
  openingCash: '1000.00',
  closingCash: null,
  createdAt: NOW,
  updatedAt: NOW,
};
const DAY_ROW = {
  id: DAY_ID,
  organizationId: 'org-1',
  stationId: 'st-1',
  businessDate: '2026-03-10',
  status: 'OPEN',
  openedBy: 'user-1',
  openedAt: NOW,
  closedBy: null,
  closedAt: null,
  createdAt: NOW,
  updatedAt: NOW,
};

// A "typical" DU: 4 nozzles, 1 terminal.
const CONTEXT_ROW = {
  attendant: {
    id: ATT_ID,
    organizationId: 'org-1',
    fullName: 'Arun',
    role: 'Attendant',
    status: 'ACTIVE',
  },
  dispenser: {
    id: DU_ID,
    organizationId: 'org-1',
    stationId: 'st-1',
    name: 'DU-1',
    code: 'DU1',
    status: 'ACTIVE',
  },
  assigned: true,
  reading_rows: [1, 2, 3, 4].map((i) => ({
    reading: {
      id: `r${i}`,
      shiftId: SHIFT_ID,
      nozzleId: NOZZLE_ID(i),
      openingReading: '100.000',
      closingReading: '100.000',
      volumeSold: '0.000',
      testingVolume: '0.000',
      unitPrice: '100.00',
      createdAt: '2026-03-10T06:00:00.000Z',
    },
    nozzleId: NOZZLE_ID(i),
    organizationId: 'org-1',
    stationId: 'st-1',
    duId: DU_ID,
    nozzleName: `N${i}`,
  })),
  terminals: [
    {
      id: TERM_ID,
      organizationId: 'org-1',
      stationId: 'st-1',
      label: 'POS 1',
      supportsCard: true,
      supportsUpi: true,
      isActive: true,
      linkedDuId: DU_ID,
    },
  ],
  credit_sales: 0,
  omc_card_sales: 0,
  merchandise_cash: 0,
};

const UPSERT_ROW = {
  id: 'ho-1',
  organizationId: 'org-1',
  stationId: 'st-1',
  shiftId: SHIFT_ID,
  userId: ATT_ID,
  duId: DU_ID,
  cashHandedOver: '9000.00',
  cardHandedOver: '400.00',
  upiHandedOver: '100.00',
  creditHandedOver: '0.00',
  testingVolume: '0.000',
  expectedSales: '20000.00',
  varianceAmount: '-10500.00',
  createdAt: '2026-03-10T10:00:00.000Z',
  replaced: false,
};

const ENTRY_ROW = {
  id: 'te-1',
  handoverId: 'ho-1',
  terminalId: TERM_ID,
  duId: DU_ID,
  cardAmount: '400.00',
  upiAmount: '100.00',
  batchRef: null,
  createdAt: '2026-03-10T10:00:00.000Z',
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

describe('POST /shifts/handovers statement budget (#231)', () => {
  const request = (db: unknown, nozzleCount: number) =>
    makeApp(db).request('/handovers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shiftId: SHIFT_ID,
        userId: ATT_ID,
        duId: DU_ID,
        cashHandedOver: 9000,
        nozzleReadings: Array.from({ length: nozzleCount }, (_, i) => ({
          nozzleId: NOZZLE_ID(i + 1),
          closingReading: 150,
        })),
        terminalEntries: [{ terminalId: TERM_ID, cardAmount: 400, upiAmount: 100 }],
      }),
    });

  const selectQueue = () => [
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
    // route auth: the shift row
    [SHIFT_ROW],
    // resolveShiftBusinessDayWrite: discover shift, day, station+day row locks,
    // day re-read, shift re-read (core lock discipline — unchanged by #231)
    [SHIFT_ROW],
    [DAY_ROW],
    [{ id: 'st-1' }],
    [{ id: DAY_ID }],
    [DAY_ROW],
    [SHIFT_ROW],
  ];

  const executeQueue = () => [
    [], // station-inventory advisory lock
    [CONTEXT_ROW], // consolidated handover context (was 8 selects)
    [], // handover-key advisory lock
    [UPSERT_ROW], // xmax upsert (was select + upsert)
    [ENTRY_ROW], // entry swap: delete+insert CTE
    [], // batched readings UPDATE … FROM (VALUES …)
  ];

  it('records a 4-nozzle DU handover within the fixed budget', async () => {
    const { db, counter } = makeFakeDb(selectQueue(), executeQueue());
    const res = await request(db, 4);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.handover.id).toBe('ho-1');
    expect(body.data.terminalEntries).toHaveLength(1);

    // 4 access-policy reads + 1 auth read pre-transaction; inside the
    // transaction: 6 lock-discipline reads (core Station → Day → Shift
    // discipline, unchanged), 6 consolidated executes, and the events append —
    // a fixed 13 statements where the old path spent ~18-25.
    expect(counter).toEqual({
      selects: 11,
      executes: 6,
      inserts: 1, // events outbox
      updates: 0,
      deletes: 0,
    });
  });

  it('does not grow with nozzle count', async () => {
    const readings = Array.from({ length: 10 }, (_, i) => ({
      reading: {
        ...CONTEXT_ROW.reading_rows[0].reading,
        id: `r${i + 1}`,
        nozzleId: NOZZLE_ID(i + 1),
      },
      nozzleId: NOZZLE_ID(i + 1),
      organizationId: 'org-1',
      stationId: 'st-1',
      duId: DU_ID,
      nozzleName: `N${i + 1}`,
    }));
    const { db, counter } = makeFakeDb(selectQueue(), [
      [],
      [{ ...CONTEXT_ROW, reading_rows: readings }],
      [],
      [UPSERT_ROW],
      [ENTRY_ROW],
      [],
    ]);
    const res = await request(db, 10);
    expect(res.status).toBe(200);
    expect(counter).toEqual({ selects: 11, executes: 6, inserts: 1, updates: 0, deletes: 0 });
  });
});
