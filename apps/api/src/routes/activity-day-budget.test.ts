import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { PgDialect } from 'drizzle-orm/pg-core';
import { activityDayRouter } from './activity-day.js';
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
  app.route('/', activityDayRouter);
  app.get('/activity', (c) => c.json({ auditFeed: true }));
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
    expect(compile(owner.captured.where).sql).not.toContain('"event_type" in');
  });

  it('scopes both the events query and the related count to the caller organization', async () => {
    const { db, captured } = capturingDb([]);
    await makeApp(db, 'Staff').request(URL);
    expect(compile(captured.where).params).toContain(ORG);
    expect(compile((captured.fields as any).relatedCount).params).toContain(ORG);
    expect(compile(captured.where).params).toContain(STATION);
  });
});
