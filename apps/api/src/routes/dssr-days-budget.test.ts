import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { dssrRouter } from './dssr.js';
import { makeFakeDb } from './test-fakes.js';

/**
 * Route-level tests for GET /dssr/days (#394), the Reports tab's Business Day
 * list. The cost contract (Worker CPU, not elapsed time): the list answers from
 * a FIXED number of statements — one station lookup + one aggregate — whether the
 * month has 0, 1 or 31 open days, and never builds a live DSSR preview (which
 * would run ~10 selects per day).
 */

/** The station lookup (one select) and the list aggregate (one execute). */
const fake = (stationRow: unknown, aggregate: Record<string, unknown>) =>
  makeFakeDb(stationRow ? [[stationRow]] : [], [[aggregate]]);
const NO_WRITES = { inserts: 0, updates: 0, deletes: 0 };

function makeApp(db: unknown, role = 'Owner', assignedStationIds: string[] = []) {
  const app = new Hono<{ Variables: { db: any; user: any } }>();
  app.use('*', async (c, next) => {
    c.set('db', db);
    c.set('user', {
      id: 'user-1',
      email: 'owner@example.com',
      fullName: 'Owner',
      organizationId: 'org-1',
      role,
      assignedStationIds,
    });
    await next();
  });
  app.route('/', dssrRouter);
  return app;
}

const station = { settings: { timezone: 'Asia/Kolkata', business_day_starts_at: '06:00' } };

const figure = (businessDate: string, dayStatus: 'OPEN' | 'CLOSED', over = {}) => ({
  businessDate,
  dayStatus,
  hasSnapshot: true,
  fuelSales: '40000.50',
  productSales: '1000',
  volume: '450.2',
  cashVariance: '-50',
  shiftCount: 2,
  ...over,
});

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('GET /dssr/days', () => {
  it('returns the month page with status, totals and week tiles from one aggregate', async () => {
    vi.setSystemTime(new Date('2026-10-09T09:00:00+05:30'));
    const { db, counter } = fake(station, {
      days: [
        figure('2026-10-08', 'OPEN'),
        figure('2026-10-09', 'OPEN'),
        figure('2026-10-06', 'CLOSED'),
      ],
      openPastDays: 1,
      olderBusinessDate: '2026-09-30',
    });
    const res = await makeApp(db).request('/days?stationId=st-1');
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.month).toBe('2026-10');
    expect(body.data.olderMonth).toBe('2026-09');
    expect(body.data.days.map((d: any) => [d.businessDate, d.status])).toEqual([
      ['2026-10-09', 'LIVE'],
      ['2026-10-08', 'DRAFT'],
      ['2026-10-06', 'SEALED'],
    ]);
    expect(body.data.days[0]).toMatchObject({
      totalSales: 41000.5,
      fuelSales: 40000.5,
      productSales: 1000,
      volume: 450.2,
      cashVariance: -50,
      shiftCount: 2,
    });
    expect(body.data.week).toEqual({
      total: 41000.5,
      sealedDays: 1,
      comparison: { total: 0, previousTotal: 0, days: 0 },
      openPastDays: 1,
    });
    expect(counter).toEqual({ selects: 1, executes: 1, ...NO_WRITES });
  });

  it('reports a closed day without a DSSR snapshot as Report missing, with no figures', async () => {
    vi.setSystemTime(new Date('2026-10-09T09:00:00+05:30'));
    const { db } = fake(station, {
      days: [figure('2026-10-07', 'CLOSED', { hasSnapshot: false, fuelSales: '0' })],
      openPastDays: 0,
      olderBusinessDate: null,
    });
    const body = (await (await makeApp(db).request('/days?stationId=st-1')).json()) as any;
    expect(body.data.days[0]).toMatchObject({
      businessDate: '2026-10-07',
      status: 'REPORT_MISSING',
      totalSales: 0,
      shiftCount: 0,
    });
    expect(body.data.week.sealedDays).toBe(0);
  });

  it.each([0, 1, 31])('uses the same two statements for a month with %i open days', async (n) => {
    vi.setSystemTime(new Date('2026-10-31T12:00:00+05:30'));
    const days = Array.from({ length: n }, (_, i) =>
      figure(`2026-10-${String(i + 1).padStart(2, '0')}`, 'OPEN'),
    );
    const { db, counter } = fake(station, {
      days,
      openPastDays: Math.max(0, n - 1),
      olderBusinessDate: null,
    });
    const res = await makeApp(db).request('/days?stationId=st-1&month=2026-10');
    const body = (await res.json()) as any;
    expect(body.data.days).toHaveLength(n);
    expect(body.data.olderMonth).toBeNull();
    // Station lookup + one aggregate: no per-day statement, no DSSR preview build.
    expect(counter).toEqual({ selects: 1, executes: 1, ...NO_WRITES });
  });

  it('keeps the day Live until the Station Day Start, then makes it Draft', async () => {
    const open = [figure('2026-10-09', 'OPEN')];
    const aggregate = { days: open, openPastDays: 0, olderBusinessDate: null };
    // 05:30 IST on the 10th is still business date 2026-10-09 (Day Start 06:00).
    vi.setSystemTime(new Date('2026-10-10T05:30:00+05:30'));
    const before = (await (
      await makeApp(fake(station, aggregate).db).request('/days?stationId=st-1')
    ).json()) as any;
    expect(before.data.days[0].status).toBe('LIVE');
    // 06:00 IST rolls the Current Business Date to the 10th: the 9th is a Past Open Day.
    vi.setSystemTime(new Date('2026-10-10T06:00:00+05:30'));
    const after = (await (
      await makeApp(fake(station, aggregate).db).request('/days?stationId=st-1')
    ).json()) as any;
    expect(after.data.month).toBe('2026-10');
    expect(after.data.days[0].status).toBe('DRAFT');
  });

  it('defaults to the Business Date month, not the UTC month, near a month boundary', async () => {
    // 2026-11-01 00:30 IST is still 2026-10-31 business-wise (Day Start 06:00) and
    // 2026-10-31 19:00 UTC: both say October.
    vi.setSystemTime(new Date('2026-11-01T00:30:00+05:30'));
    const { db } = fake(station, { days: [], openPastDays: 0, olderBusinessDate: null });
    const body = (await (await makeApp(db).request('/days?stationId=st-1')).json()) as any;
    expect(body.data.month).toBe('2026-10');
  });

  it('rejects a missing stationId and a malformed month', async () => {
    vi.setSystemTime(new Date('2026-10-09T09:00:00+05:30'));
    const { db } = fake(station, { days: [], openPastDays: 0, olderBusinessDate: null });
    const missing = await makeApp(db).request('/days');
    expect(missing.status).toBe(400);
    const bad = await makeApp(db).request('/days?stationId=st-1&month=2026-13');
    expect(bad.status).toBe(400);
  });

  it('refuses a Station the user is not assigned to and a foreign-organization Station', async () => {
    const { db } = fake(station, { days: [], openPastDays: 0, olderBusinessDate: null });
    const unassigned = await makeApp(db, 'Manager', ['st-2']).request('/days?stationId=st-1');
    expect(unassigned.status).toBe(403);
    const foreign = fake(null, { days: [], openPastDays: 0, olderBusinessDate: null });
    const res = await makeApp(foreign.db).request('/days?stationId=st-foreign');
    expect(res.status).toBe(404);
    expect(foreign.counter.executes).toBe(0);
  });

  it('uses the Reports role policy, including Accountants, before station or database reads', async () => {
    const deniedDb = fake(station, { days: [], openPastDays: 0, olderBusinessDate: null });
    const staff = await makeApp(deniedDb.db, 'Staff').request('/days?stationId=st-1');
    expect(staff.status).toBe(403);
    expect(deniedDb.counter.selects).toBe(0);

    const accountantDb = fake(station, {
      days: [],
      openPastDays: 0,
      olderBusinessDate: null,
    });
    const accountant = await makeApp(accountantDb.db, 'Accountant', ['st-1']).request(
      '/days?stationId=st-1',
    );
    expect(accountant.status).toBe(200);
    expect(accountantDb.counter).toEqual({ selects: 1, executes: 1, ...NO_WRITES });
  });
});
