import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { shiftsRouter } from './shifts.js';

/**
 * Regression guard for #146 / #155: lite shift status must answer from ONE
 * SQL statement (plus the station auth lookup) — attribution context only,
 * no unbounded closed-shift scan, no last-shift projection, no per-shift
 * enrichment. Each extra round-trip costs ~2-3 ms of Worker CPU.
 */

function makeFakeDb(selectResults: any[][], executeResults: any[][]) {
  const counter = { selects: 0, executes: 0 };
  const db = {
    select: () => {
      counter.selects += 1;
      const rows = selectResults.shift() ?? [];
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
    },
    execute: async () => {
      counter.executes += 1;
      return executeResults.shift() ?? [];
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
const openShiftJson = {
  id: 'sh-open',
  organizationId: 'org-1',
  stationId: 'st-1',
  businessDayId: 'bd-1',
  shiftTemplateId: 't-1',
  status: 'OPEN',
  openedBy: 'user-1',
  openedAt: '2026-03-15T06:00:00.000Z',
  openingCash: 5000,
  templateName: 'Morning',
  businessDate: '2026-03-15',
  shiftSequence: 2,
  scheduledStartTime: '06:00',
  scheduledEndTime: '14:00',
  openedByName: 'Owner',
};
const recentClosed = [
  {
    id: 'sh-closed',
    stationId: 'st-1',
    status: 'CLOSED',
    closedAt: '2026-03-15T05:00:00.000Z',
    templateName: 'Night',
  },
];

describe('GET /status?lite=true query-count regression', () => {
  it('answers with attribution context in one statement', async () => {
    const { db, counter } = makeFakeDb(
      [[station]],
      [
        [
          {
            business_day: { id: 'bd-1', status: 'OPEN', businessDate: '2026-03-15' },
            active_shift: openShiftJson,
            recent_closed: recentClosed,
          },
        ],
      ],
    );
    const res = await makeApp(db).request('/status?stationId=st-1&lite=true');
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;

    // One auth select + one CTE statement — never grows with history size.
    expect(counter.selects).toBe(1);
    expect(counter.executes).toBe(1);

    // Attribution context is present…
    expect(body.data.activeShift.id).toBe('sh-open');
    expect(body.data.activeShift.templateName).toBe('Morning');
    expect(body.data.activeShift.businessDate).toBe('2026-03-15');
    // …including the fields the status-bar open-shift indicator derives its
    // label + elapsed time from (business date, sequence, opened-at). See
    // useOpenShiftLabel / #265.
    expect(body.data.activeShift.shiftSequence).toBe(2);
    expect(body.data.activeShift.openedAt).toBe('2026-03-15T06:00:00.000Z');
    expect(body.data.businessDay.id).toBe('bd-1');
    expect(body.data.recentClosedShifts).toHaveLength(1);
    expect(body.data.recentClosedShifts[0].templateName).toBe('Night');

    // …and the heavy enrichment is not.
    expect(body.data.activeShift.nozzleReadings).toBeUndefined();
    expect(body.data.activeShift.handovers).toBeUndefined();
    expect(body.data.activeShift.reconciliation).toBeUndefined();
    expect(body.data.lastShiftSummary).toBeNull();
    expect(body.data.readings).toEqual([]);
  });

  it('handles no open shift with the same constant work', async () => {
    const { db, counter } = makeFakeDb(
      [[station]],
      [[{ business_day: null, active_shift: null, recent_closed: recentClosed }]],
    );
    const res = await makeApp(db).request('/status?stationId=st-1&lite=true');
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(counter.selects).toBe(1);
    expect(counter.executes).toBe(1);
    expect(body.data.activeShift).toBeNull();
    expect(body.data.shift).toBeNull();
    expect(body.data.recentClosedShifts).toHaveLength(1);
  });
});
