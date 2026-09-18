import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { shiftsRouter } from './shifts.js';

/**
 * Regression guard for #146 / #113: lite shift status must stay genuinely
 * lite — a small constant number of queries (attribution context only), no
 * unbounded closed-shift scan, no last-shift projection, no per-shift
 * enrichment. It previously exceeded the Cloudflare Workers CPU budget.
 *
 * The fake db resolves each select() from a FIFO queue, so the assertion is
 * on exactly how many queries the route issues.
 */

function makeQueueDb(results: any[][]) {
  const counter = { selects: 0 };
  const db = {
    select: () => {
      counter.selects += 1;
      const rows = results.shift() ?? [];
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
  shiftTemplateId: 't-1',
  status: 'OPEN',
  openedBy: 'user-1',
  openedAt: new Date('2026-03-15T06:00:00Z'),
  openingCash: '5000',
};
const closedRecent = {
  shift: {
    id: 'sh-closed',
    stationId: 'st-1',
    status: 'CLOSED',
    closedAt: new Date(Date.now() - 60_000),
  },
  templateName: 'Morning',
};

describe('GET /status?lite=true query-count regression', () => {
  it('answers with attribution context in a small constant number of queries', async () => {
    const { db, counter } = makeQueueDb([
      [station], // station lookup
      [{ id: 'bd-1', status: 'OPEN' }], // open business day
      [openShift], // open shift
      [{ id: 't-1', name: 'Morning', startTime: '06:00', endTime: '14:00' }], // template
      [{ id: 'user-1', fullName: 'Owner' }], // openedBy
      [{ businessDate: '2026-03-15' }], // business date
      [closedRecent], // grace-window closed shifts (SQL-filtered)
    ]);
    const res = await makeApp(db).request('/status?stationId=st-1&lite=true');
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;

    // 7 queries with an open shift — never grows with shift history size.
    expect(counter.selects).toBe(7);

    // Attribution context is present…
    expect(body.data.activeShift.id).toBe('sh-open');
    expect(body.data.activeShift.templateName).toBe('Morning');
    expect(body.data.activeShift.businessDate).toBe('2026-03-15');
    expect(body.data.recentClosedShifts).toHaveLength(1);
    expect(body.data.recentClosedShifts[0].templateName).toBe('Morning');

    // …and the heavy enrichment is not.
    expect(body.data.activeShift.nozzleReadings).toBeUndefined();
    expect(body.data.activeShift.handovers).toBeUndefined();
    expect(body.data.activeShift.reconciliation).toBeUndefined();
    expect(body.data.lastShiftSummary).toBeNull();
    expect(body.data.readings).toEqual([]);
  });

  it('uses even fewer queries when no shift is open', async () => {
    const { db, counter } = makeQueueDb([
      [station],
      [], // no open business day
      [], // no open shift
      [closedRecent],
    ]);
    const res = await makeApp(db).request('/status?stationId=st-1&lite=true');
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(counter.selects).toBe(4);
    expect(body.data.activeShift).toBeNull();
    expect(body.data.recentClosedShifts).toHaveLength(1);
  });
});
