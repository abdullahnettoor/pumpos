import { describe, expect, it } from 'vite-plus/test';
import { Hono } from 'hono';
import { PgDialect } from 'drizzle-orm/pg-core';
import { activityHandler } from './activity-day.js';
import { STAFF_HIDDEN_ACTIVITY_EVENTS } from '../infra/activity-day.js';
import { makeFakeDb } from './test-fakes.js';

/**
 * Worker CPU budget for the dated activity feed (#508): the route answers from a
 * FIXED two statements (station clock + one grouped events query) whether the
 * day holds 5 or 500 events, and role filtering and tenant scoping are applied
 * in that SQL, never in JS after the read.
 */

const ORG = 'org-1';
const STATION = '11111111-1111-4111-8111-111111111111';
const station = { id: STATION, organizationId: ORG, settings: {} };
const URL = `/activity?stationId=${STATION}&date=2026-01-01`;

function makeApp(db: unknown, role = 'Manager') {
  const app = new Hono<any>();
  app.use('*', async (c, next) => {
    c.set('db', db);
    c.set('user', {
      id: 'u1',
      email: 'u@example.com',
      fullName: 'U',
      organizationId: ORG,
      role,
      assignedStationIds: [STATION],
    });
    await next();
  });
  app.get(
    '/activity',
    activityHandler((c) => c.json({ auditFeed: true })),
  );
  return app;
}

const row = (i: number) => ({
  eventId: `e${i}`,
  eventType: 'SHIFT_OPENED',
  stationId: STATION,
  stationName: 'Main',
  aggregateType: 'shift',
  aggregateId: `s${i}`,
  occurredAt: new Date(2026, 0, 1, 7, i % 60),
  recordedAt: new Date(2026, 0, 1, 7, i % 60),
  actorId: null,
  actorName: null,
  actorEmail: null,
  correlationId: null,
  causationId: null,
  metadata: {},
  relatedCount: 0,
});

/** A fake db that also records the WHERE and select-field SQL of the events query. */
function capturingDb(rows: unknown[]) {
  const { db, counter } = makeFakeDb([[station], rows]);
  const captured: { where?: unknown; fields?: unknown } = {};
  const select = db.select;
  let call = 0;
  db.select = (fields?: unknown) => {
    call += 1;
    const b = select();
    if (call === 2) {
      captured.fields = fields;
      const where = b.where;
      b.where = (cond: unknown) => {
        captured.where = cond;
        return where(cond);
      };
    }
    return b;
  };
  return { db, counter, captured };
}

const compile = (q: unknown) => new PgDialect().sqlToQuery(((q as any).sql ?? q) as any);

describe('GET /activity?stationId&date= statement budget', () => {
  it.each([5, 500])('is a constant 2 statements for %i events', async (n) => {
    const { db, counter } = makeFakeDb([[station], Array.from({ length: n }, (_, i) => row(i))]);
    const res = await makeApp(db).request(URL);
    const body: any = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.items).toHaveLength(n);
    expect(counter).toMatchObject({ selects: 2, executes: 0, inserts: 0, updates: 0, deletes: 0 });
  });
});

describe('undated audit feed', () => {
  it.each(['Manager', 'Accountant', 'Staff', 'Attendant'])('refuses %s', async (role) => {
    const { db, counter } = makeFakeDb();
    const res = await makeApp(db, role).request(`/activity?stationId=${STATION}`);
    expect(res.status).toBe(403);
    expect(counter.selects + counter.executes).toBe(0);
  });

  it('still serves the Owner', async () => {
    const { db } = makeFakeDb();
    const res = await makeApp(db, 'Owner').request(`/activity?stationId=${STATION}`);
    expect(await res.json()).toEqual({ auditFeed: true });
  });
});

describe('dated feed role and tenant scoping', () => {
  it('Staff queries only forecourt types: no Office Record type is bound anywhere', async () => {
    const { db, captured } = capturingDb([row(1)]);
    const res = await makeApp(db, 'Staff').request(URL);
    expect(res.status).toBe(200);
    const where = compile(captured.where);
    expect(where.params).toContain('SHIFT_OPENED');
    for (const office of STAFF_HIDDEN_ACTIVITY_EVENTS) expect(where.params).not.toContain(office);
    const fields = captured.fields as { relatedCount: unknown };
    const related = compile(fields.relatedCount);
    expect(related.params).toContain('SHIFT_OPENED');
    for (const office of STAFF_HIDDEN_ACTIVITY_EVENTS) expect(related.params).not.toContain(office);
    expect(related.sql).toContain('station_id');
    expect(related.params).toContain(STATION);
    // Decantation/tanker events belong to the forecourt set Staff may see.
    expect(where.params).toContain('DECANTATION_RECORDED');
  });

  it('Manager queries Office Record types too; Owner has no type filter', async () => {
    const manager = capturingDb([]);
    await makeApp(manager.db, 'Manager').request(URL);
    expect(compile(manager.captured.where).params).toContain('EXPENSE_RECORDED');

    const owner = capturingDb([]);
    await makeApp(owner.db, 'Owner').request(URL);
    // No role allow-list: the only bound types are the Office Record placement split.
    expect(compile(owner.captured.where).params).not.toContain('SHIFT_OPENED');
  });

  it('scopes both the events query and the related count to the caller organization', async () => {
    const { db, captured } = capturingDb([]);
    await makeApp(db, 'Staff').request(URL);
    expect(compile(captured.where).params).toContain(ORG);
    expect(compile((captured.fields as any).relatedCount).params).toContain(ORG);
    expect(compile(captured.where).params).toContain(STATION);
  });
});

describe('Office Records are placed by Entry Date', () => {
  // Station clock: Asia/Kolkata, Day Start 06:00 → Business Day 2026-01-01 starts
  // 2026-01-01T00:30Z; its calendar (entry) day starts 2025-12-31T18:30Z.
  const istStation = {
    ...station,
    settings: { timezone: 'Asia/Kolkata', business_day_starts_at: '06:00' },
  };

  it('binds the entry-date window (midnight, not Day Start) for office types and the business window for the rest', async () => {
    const { db, captured } = (() => {
      const f = makeFakeDb([[istStation], []]);
      const captured: { where?: unknown } = {};
      let call = 0;
      const select = f.db.select;
      f.db.select = () => {
        call += 1;
        const b = select();
        if (call === 2) {
          const where = b.where;
          b.where = (cond: unknown) => {
            captured.where = cond;
            return where(cond);
          };
        }
        return b;
      };
      return { db: f.db, captured };
    })();
    await makeApp(db, 'Manager').request(URL);
    const { params } = compile(captured.where);
    const times = params.filter(
      (p): p is string => typeof p === 'string' && /^\d{4}-\d\d-\d\dT/.test(p),
    );
    // Business Day window (Day Start 06:00 IST) and entry-date window (00:00 IST).
    expect(times).toContain('2026-01-01T00:30:00.000Z');
    expect(times).toContain('2026-01-02T00:30:00.000Z');
    expect(times).toContain('2025-12-31T18:30:00.000Z');
    expect(times).toContain('2026-01-01T18:30:00.000Z');
    expect(params).toContain('EXPENSE_RECORDED');
    // Office branch is also bounded by occurred_at, one day either side of the entry window.
    expect(times).toContain('2025-12-30T18:30:00.000Z');
    expect(times).toContain('2026-01-02T18:30:00.000Z');
  });
});
