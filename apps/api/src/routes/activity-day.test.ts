import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { PgDialect } from 'drizzle-orm/pg-core';
import { activityHandler } from './activity-day.js';
import { businessDayWindow, entryDateWindow } from '../infra/activity-day.js';
import { makeFakeDb } from './test-fakes.js';

function makeApp(db: unknown, role = 'Manager', assignedStationIds: string[] = [STATION]) {
  const app = new Hono<any>();
  app.use('*', async (c, next) => {
    c.set('db', db);
    c.set('user', {
      id: 'u1',
      email: 'u@example.com',
      fullName: 'U',
      organizationId: 'org-1',
      role,
      assignedStationIds,
    });
    await next();
  });
  app.get(
    '/activity',
    activityHandler((c) => c.json({ fellThrough: true })),
  );
  return app;
}

const STATION = '11111111-1111-4111-8111-111111111111';
const station = { id: STATION, organizationId: 'org-1', settings: {} };
const row = (i: number) => ({
  eventId: `e${i}`,
  eventType: 'SHIFT_OPENED',
  stationId: STATION,
  stationName: 'Main',
  aggregateType: 'shift',
  aggregateId: `s${i}`,
  occurredAt: new Date(2026, 0, 1, 7, i),
  recordedAt: new Date(2026, 0, 1, 7, i),
  actorId: null,
  actorName: null,
  actorEmail: null,
  correlationId: null,
  causationId: null,
  metadata: {},
  relatedCount: 0,
});

describe('GET /activity?date=', () => {
  it.each([5, 500])('uses a constant 2 statements for %i events', async (n) => {
    const { db, counter } = makeFakeDb([[station], Array.from({ length: n }, (_, i) => row(i))]);
    const res = await makeApp(db).request(`/activity?stationId=${STATION}&date=2026-01-01`);
    const body: any = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.items).toHaveLength(n);
    expect(counter.selects).toBe(2);
    expect(counter.executes).toBe(0);
  });

  it('falls through to the audit feed without a date', async () => {
    const { db } = makeFakeDb();
    const res = await makeApp(db, 'Owner').request(`/activity?stationId=${STATION}`);
    expect(await res.json()).toEqual({ fellThrough: true });
  });

  it('refuses Attendants and stations outside assignment', async () => {
    const { db } = makeFakeDb([[station]]);
    expect(
      (await makeApp(db, 'Attendant').request(`/activity?stationId=${STATION}&date=2026-01-01`))
        .status,
    ).toBe(403);
    expect(
      (
        await makeApp(db, 'Staff', ['22222222-2222-4222-8222-222222222222']).request(
          `/activity?stationId=${STATION}&date=2026-01-01`,
        )
      ).status,
    ).toBe(403);
  });

  it('404s a station outside the tenant and 400s a bad date', async () => {
    const { db } = makeFakeDb([[]]);
    const app = makeApp(db);
    expect((await app.request(`/activity?stationId=${STATION}&date=2026-01-01`)).status).toBe(404);
    expect((await app.request(`/activity?stationId=${STATION}&date=2026-02-30`)).status).toBe(400);
    expect((await app.request(`/activity?date=2026-01-01`)).status).toBe(400);
  });
});

describe('businessDayWindow', () => {
  it('starts at Day Start in the station timezone and runs 24h', () => {
    const w = businessDayWindow('2026-01-01', {
      timeZone: 'Asia/Kolkata',
      businessDayStartsAt: '06:00',
    });
    expect(w.from.toISOString()).toBe('2026-01-01T00:30:00.000Z');
    expect(w.to.toISOString()).toBe('2026-01-02T00:30:00.000Z');
  });
  it('handles a DST day length', () => {
    const w = businessDayWindow('2026-03-08', {
      timeZone: 'America/New_York',
      businessDayStartsAt: '00:00',
    });
    expect((w.to.getTime() - w.from.getTime()) / 3_600_000).toBe(23);
  });
});

describe('role filtering', () => {
  it('Staff never get Office Record types; Manager does', async () => {
    const { dashboardEventTypesForRole } = await import('../infra/activity-day.js');
    const staff = dashboardEventTypesForRole('Staff')!;
    for (const t of [
      'EXPENSE_RECORDED',
      'INCOME_RECORDED',
      'SUPPLIER_PAID',
      'PAYMENT_RECEIVED',
      'CREDIT_PAYMENT_RECEIVED',
    ]) {
      expect(staff).not.toContain(t);
      expect(dashboardEventTypesForRole('Manager')).toContain(t);
      expect(dashboardEventTypesForRole('Accountant')).toContain(t);
    }
    expect(staff).toContain('SHIFT_OPENED');
    expect(staff).toContain('DECANTATION_RECORDED');
  });

  it('drops purchase and supplier-payment events without View costs (ADR 0013)', async () => {
    const { dashboardEventTypesForRole } = await import('../infra/activity-day.js');
    const { defaultPermissionsFor } = await import('@pump/shared');
    const noCosts = new Set(defaultPermissionsFor('Manager'));
    noCosts.delete('purchases.viewCosts');
    const types = dashboardEventTypesForRole({ role: 'Manager', permissions: noCosts })!;
    for (const t of ['PURCHASE_CREATED', 'SUPPLIER_PAID', 'PAYMENT_MADE']) {
      expect(types).not.toContain(t);
      expect(dashboardEventTypesForRole('Manager')).toContain(t);
    }
    expect(types).toContain('EXPENSE_RECORDED');
  });
});

describe('entryDate placement (#512)', () => {
  const dialect = new PgDialect();
  const capture = async (query: string, role = 'Manager') => {
    let where = '';
    const { db } = makeFakeDb([[station], []]);
    const orig = db.select;
    db.select = () => {
      const b = orig();
      const w = b.where;
      b.where = (cond: any) => {
        const q = dialect.sqlToQuery(cond);
        where = JSON.stringify(q);
        return w(cond);
      };
      return b;
    };
    const res = await makeApp(db, role).request(`/activity?stationId=${STATION}&${query}`);
    return { res, where };
  };

  it('matches a back-dated expense by payload entryDate, with occurredAt fallback', async () => {
    const { res, where } = await capture('date=2026-10-12&entryDate=2026-10-10');
    expect(res.status).toBe(200);
    expect(where).toContain("payload\\\" ->> 'entryDate'");
    expect(where).toContain('2026-10-10');
    expect(where).toContain('is null');
  });

  it('before Day Start: office window follows entryDate, not the business date', async () => {
    // 02:00 IST with Day Start 06:00 -> business date is yesterday, entry date today.
    const { where } = await capture('date=2026-10-11&entryDate=2026-10-12');
    const w = entryDateWindow('2026-10-12', { timeZone: 'Asia/Kolkata' });
    expect(where).toContain('2026-10-12');
    expect(where).toContain(w.from.toISOString());
    expect(w.from.toISOString()).toBe('2026-10-11T18:30:00.000Z');
  });

  it('defaults entryDate to date and rejects an invalid one', async () => {
    const { where } = await capture('date=2026-10-12');
    expect(where).toContain('2026-10-12');
    const bad = await capture('date=2026-10-12&entryDate=nope');
    expect(bad.res.status).toBe(400);
  });

  it('never offers cash-drop event types to any role', async () => {
    const { dashboardEventTypesForRole } = await import('../infra/activity-day.js');
    for (const role of ['Manager', 'Accountant', 'Staff'] as const) {
      expect((dashboardEventTypesForRole(role) ?? []).some((t) => /DROP/.test(t))).toBe(false);
    }
    const { BusinessEvents } = await import('@pump/core');
    expect(Object.keys(BusinessEvents).some((t) => /DROP/.test(t))).toBe(false);
  });
});
