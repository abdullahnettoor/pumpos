import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { shiftsRouter } from './shifts.js';

/**
 * Statement-budget regression guard for #230: full-mode GET /shifts/status must
 * answer in a FIXED number of statements — one station auth select plus three
 * consolidated jsonb statements (day/shifts, active-shift detail, reference
 * data), and only two when no shift is open. Before the consolidation this
 * endpoint issued ~25 sequential round-trips (~12s at edge RTT on the most
 * loaded screen).
 */

function makeFakeDb(selectQueue: any[][], executeQueue: any[][]) {
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
      return executeQueue.shift() ?? [];
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

const station = { id: 'st-1', organizationId: 'org-1', settings: {} };
const openShift = {
  id: 'sh-open',
  organizationId: 'org-1',
  stationId: 'st-1',
  businessDayId: 'bd-1',
  shiftTemplateId: 'tpl-1',
  status: 'OPEN',
  openedBy: 'user-1',
  openedAt: '2026-03-15T06:00:00.000Z',
  closedBy: null,
  closedAt: null,
  lockedAt: null,
  openingCash: '5000.00',
  closingCash: null,
  createdAt: '2026-03-15T06:00:00.000Z',
  updatedAt: '2026-03-15T06:00:00.000Z',
};

const DAY_SHIFTS_ROW = {
  business_day: { id: 'bd-1', status: 'OPEN', businessDate: '2026-03-15' },
  active_shift: openShift,
  last_shift: {
    shift: { ...openShift, id: 'sh-last', status: 'CLOSED', closedAt: '2026-03-15T05:00:00.000Z' },
    templateName: 'Night',
    closedByName: 'Owner',
    summary: { id: 'sum-1', shiftId: 'sh-last', snapshotData: {}, generatedAt: null },
    parentDayStatus: 'OPEN',
  },
  recent_closed: [{ id: 'sh-last', status: 'CLOSED', templateName: 'Night' }],
};

const DETAIL_ROW = {
  template: { id: 'tpl-1', name: 'Morning', startTime: '06:00', endTime: '14:00' },
  opened_user: { id: 'user-1', fullName: 'Owner' },
  business_date: '2026-03-15',
  nozzle_readings: [],
  attributed_sales: [],
  credit_lines: [],
  omc_lines: [],
  assignments: [],
  handovers: [],
  handover_entries: [],
  terminal_links: [],
  merch_handovers: [],
  merch_sales: [],
  merch_items: [],
  recon: { handover_cash: 0, handover_count: 0, sellers: [] },
};

const REF_ROW = { templates: [], nozzles: [], staff: [], dispensers: [], terminals: [] };

describe('GET /shifts/status full-mode statement budget (#230)', () => {
  it('answers with an open shift in one select + three statements', async () => {
    const { db, counter } = makeFakeDb([[station]], [[DAY_SHIFTS_ROW], [DETAIL_ROW], [REF_ROW]]);
    const res = await makeApp(db).request('/status?stationId=st-1');
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;

    expect(counter).toEqual({ selects: 1, executes: 3 });

    // The payload keeps its full-mode shape.
    expect(body.data.businessDay.id).toBe('bd-1');
    expect(body.data.activeShift).toMatchObject({
      id: 'sh-open',
      templateName: 'Morning',
      businessDate: '2026-03-15',
      openedByName: 'Owner',
    });
    expect(body.data.activeShift.reconciliation).toMatchObject({ cashSales: 0 });
    expect(body.data.lastShift).toMatchObject({ id: 'sh-last', templateName: 'Night' });
    expect(body.data.lastShiftSummary).toMatchObject({ shiftId: 'sh-last' });
    expect(body.data.recentClosedShifts).toHaveLength(1);
    expect(body.data).toHaveProperty('templates');
    expect(body.data).toHaveProperty('nozzles');
    expect(body.data).toHaveProperty('staff');
    expect(body.data).toHaveProperty('dispensers');
    expect(body.data).toHaveProperty('terminals');
  });

  it('skips the detail statement when no shift is open', async () => {
    const { db, counter } = makeFakeDb(
      [[station]],
      [[{ ...DAY_SHIFTS_ROW, active_shift: null }], [REF_ROW]],
    );
    const res = await makeApp(db).request('/status?stationId=st-1');
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;

    expect(counter).toEqual({ selects: 1, executes: 2 });
    expect(body.data.activeShift).toBeNull();
    expect(body.data.readings).toEqual([]);
  });
});
