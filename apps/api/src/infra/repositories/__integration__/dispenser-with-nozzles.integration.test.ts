import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { Hono } from 'hono';
import { and, eq, inArray } from 'drizzle-orm';
import { schema, type DbClient } from '@pump/db';
import { stationSetupRouter } from '../../../routes/station-setup.js';
import { createIdempotencyMiddleware } from '../../idempotency.js';

/**
 * A dispenser and its nozzles in one request, against a real Postgres (#591).
 *
 * Before, the dispenser and each nozzle were separate requests: a failed nozzle
 * left a dispenser behind, and the retry created a second one. These tests drive
 * the real route behind the real idempotency middleware and prove the request
 * is all or nothing, and that a replayed key answers with the first result
 * instead of writing again. The three-shift pre-fill gets the same proof.
 */

const CONNECTION = process.env.TEST_DATABASE_URL;
const TEST_SCHEMA = 'dispenser_nozzles_it';

const ORG = '00000000-0000-0000-0000-000000059101';
const STATION = '00000000-0000-0000-0000-000000059102';
const MANAGER = '00000000-0000-0000-0000-000000059103';
const MS = '00000000-0000-0000-0000-000000059104';
const HSD = '00000000-0000-0000-0000-000000059105';
const MS_TANK = '00000000-0000-0000-0000-000000059106';
const HSD_TANK = '00000000-0000-0000-0000-000000059107';

const BOOTSTRAP = `
  do $$ begin
    if not exists (select from pg_roles where rolname = 'authenticated') then
      create role authenticated;
    end if;
    if not exists (select from pg_roles where rolname = 'anon') then
      create role anon;
    end if;
  exception when others then
    null;
  end $$;

  drop schema if exists ${TEST_SCHEMA} cascade;
  create schema ${TEST_SCHEMA};
`;

function shippedSchema(): string {
  const dir = path.resolve(__dirname, '../../../../../../supabase/migrations');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => readFileSync(path.join(dir, f), 'utf8'))
    .join('\n')
    .replace(/(?:"public"|public)\./g, `"${TEST_SCHEMA}".`);
}

interface Envelope<T> {
  success: boolean;
  data: T;
  error: { code: string; message: string };
}

interface Created {
  dispenser: { id: string; stationId: string; organizationId: string; code: string };
  nozzles: Array<{ id: string; duId: string; tankId: string }>;
}

/** A row name the test trigger refuses on insert. */
const FAIL_MARK = 'IT-591-FAIL';

const dispenserBody = (code: string, nozzles: unknown[]) => ({
  stationId: STATION,
  name: `Dispenser ${code}`,
  code,
  status: 'ACTIVE',
  nozzles,
});

const twoNozzles = [
  { name: 'N1', tankId: MS_TANK, productId: MS, currentReading: 1000 },
  { name: 'N2', tankId: HSD_TANK, productId: HSD, currentReading: 2000 },
];

describe.skipIf(!CONNECTION)('dispenser with nozzles in one request (#591)', () => {
  let sql: postgres.Sql;
  let db: DbClient;
  let app: Hono;

  beforeAll(async () => {
    const bootstrap = postgres(CONNECTION!, { max: 1, onnotice: () => {} });
    try {
      await bootstrap.unsafe('select pg_advisory_lock(872634)');
      await bootstrap.unsafe(BOOTSTRAP);
      await bootstrap.unsafe(
        `set search_path to ${TEST_SCHEMA};` +
          shippedSchema().replace(
            /create trigger on_auth_user_created/gi,
            'create or replace trigger on_auth_user_created',
          ),
      );
      await bootstrap.unsafe('select pg_advisory_unlock(872634)');
    } finally {
      await bootstrap.end();
    }
    sql = postgres(CONNECTION!, {
      max: 1,
      onnotice: () => {},
      connection: { search_path: TEST_SCHEMA },
    });
    db = drizzle(sql, { schema }) as unknown as DbClient;
    await seed();
    await installWriteFailures();

    const a = new Hono<{ Variables: { db: DbClient; user: unknown } }>();
    a.use('*', async (c, next) => {
      c.set('db', db);
      c.set('user', {
        id: MANAGER,
        email: 'manager@example.com',
        fullName: 'Meera',
        organizationId: ORG,
        role: 'Manager',
        assignedStationIds: [STATION],
      });
      await next();
    });
    a.use('*', createIdempotencyMiddleware());
    a.route('/setup', stationSetupRouter);
    app = a as unknown as Hono;
  }, 60_000);

  afterAll(async () => {
    if (sql) {
      await sql.unsafe('select pg_advisory_lock(872634)');
      await sql.unsafe(`drop schema if exists ${TEST_SCHEMA} cascade`);
      await sql.unsafe('select pg_advisory_unlock(872634)');
      await sql.end();
    }
  });

  /**
   * A real failure in the middle of the write: Postgres refuses one row only
   * after the rows before it in the same request are already inserted. The
   * marker names never come from the product, so nothing else trips them.
   */
  async function installWriteFailures() {
    await sql.unsafe(`
      create function ${TEST_SCHEMA}.it_591_refuse_marked() returns trigger
      language plpgsql as $$
      begin
        if new.name = '${FAIL_MARK}' then
          raise exception 'it-591: refused mid-write';
        end if;
        return new;
      end $$;
      create trigger it_591_refuse_nozzle before insert on ${TEST_SCHEMA}.nozzles
        for each row execute function ${TEST_SCHEMA}.it_591_refuse_marked();
      create trigger it_591_refuse_template before insert on ${TEST_SCHEMA}.shift_templates
        for each row execute function ${TEST_SCHEMA}.it_591_refuse_marked();
    `);
  }

  async function eventCount() {
    return (await db.select({ id: schema.events.id }).from(schema.events)).length;
  }

  async function seed() {
    await db.insert(schema.organizations).values({ id: ORG, name: 'Tenant A' });
    await db
      .insert(schema.stations)
      .values({ id: STATION, organizationId: ORG, name: 'Station A', code: 'STA' });
    await db.insert(schema.users).values({
      id: MANAGER,
      organizationId: ORG,
      fullName: 'Meera',
      role: 'Manager',
      status: 'ACTIVE',
    });
    await db.insert(schema.products).values([
      { id: MS, organizationId: ORG, name: 'Petrol', code: 'MS', productType: 'FUEL', unit: 'L' },
      { id: HSD, organizationId: ORG, name: 'Diesel', code: 'HSD', productType: 'FUEL', unit: 'L' },
    ]);
    await db.insert(schema.tanks).values([
      {
        id: MS_TANK,
        organizationId: ORG,
        stationId: STATION,
        name: 'T1',
        productId: MS,
        capacity: '20000',
      },
      {
        id: HSD_TANK,
        organizationId: ORG,
        stationId: STATION,
        name: 'T2',
        productId: HSD,
        capacity: '20000',
      },
    ]);
  }

  async function post<T>(url: string, body: unknown, idempotencyKey?: string) {
    const res = await app.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
      body: JSON.stringify(body),
    });
    return { status: res.status, json: (await res.json()) as Envelope<T> };
  }

  async function dispensersWithCode(code: string) {
    return db
      .select()
      .from(schema.dispenserUnits)
      .where(
        and(eq(schema.dispenserUnits.organizationId, ORG), eq(schema.dispenserUnits.code, code)),
      );
  }

  async function eventsFor(ids: string[]) {
    if (ids.length === 0) return [];
    return db.select().from(schema.events).where(inArray(schema.events.aggregateId, ids));
  }

  it('creates the dispenser, its nozzles and their events together', async () => {
    const { status, json } = await post<Created>(
      '/setup/dispensers/with-nozzles',
      dispenserBody('DU-01', twoNozzles),
    );

    expect(status).toBeLessThan(300);
    expect(json.success).toBe(true);
    const { dispenser, nozzles } = json.data;
    expect(dispenser).toMatchObject({ stationId: STATION, organizationId: ORG, code: 'DU-01' });
    expect(nozzles.map((n) => [n.duId, n.tankId])).toEqual([
      [dispenser.id, MS_TANK],
      [dispenser.id, HSD_TANK],
    ]);

    const stored = await db
      .select()
      .from(schema.nozzles)
      .where(eq(schema.nozzles.duId, dispenser.id));
    expect(stored).toHaveLength(2);
    const events = await eventsFor([dispenser.id, ...stored.map((n) => n.id)]);
    expect(events.map((e) => e.eventType).sort()).toEqual([
      'DISPENSER_CREATED',
      'NOZZLE_CREATED',
      'NOZZLE_CREATED',
    ]);
    expect(events.every((e) => e.organizationId === ORG && e.stationId === STATION)).toBe(true);
  });

  it('answers a replayed key with the first result and no second dispenser', async () => {
    const key = 'it-591-replay';
    const body = dispenserBody('DU-02', twoNozzles);

    const first = await post<Created>('/setup/dispensers/with-nozzles', body, key);
    const replay = await post<Created>('/setup/dispensers/with-nozzles', body, key);
    const firstJson = first.json;
    const replayJson = replay.json;

    expect(firstJson.success).toBe(true);
    expect(replay.status).toBe(first.status);
    expect(replayJson).toEqual(firstJson);
    const rows = await dispensersWithCode('DU-02');
    expect(rows.map((r) => r.id)).toEqual([firstJson.data.dispenser.id]);
    const nozzles = await db
      .select()
      .from(schema.nozzles)
      .where(eq(schema.nozzles.duId, firstJson.data.dispenser.id));
    expect(nozzles).toHaveLength(2);
  });

  it('leaves no dispenser behind when a nozzle is refused', async () => {
    const body = dispenserBody('DU-03', [
      twoNozzles[0],
      { name: 'N2', tankId: MS_TANK, productId: HSD, currentReading: 0 },
    ]);

    const { status, json } = await post<Created>(
      '/setup/dispensers/with-nozzles',
      body,
      'it-591-refused',
    );

    expect(status).toBe(400);
    expect(json.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'Nozzle Product must match its Tank Product',
    });
    expect(await dispensersWithCode('DU-03')).toEqual([]);
  });

  it('refuses a malformed id at the edge', async () => {
    const { status, json } = await post<Created>(
      '/setup/dispensers/with-nozzles',
      dispenserBody('DU-04', [{ name: 'N1', tankId: 'not-a-uuid', productId: MS }]),
    );

    expect(status).toBe(400);
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(await dispensersWithCode('DU-04')).toEqual([]);
  });

  it('creates the three default shifts once under a replayed key', async () => {
    const body = {
      templates: [
        { name: 'Morning Shift', startTime: '06:00', endTime: '14:00', isActive: true },
        { name: 'Evening Shift', startTime: '14:00', endTime: '22:00', isActive: true },
        { name: 'Night Shift', startTime: '22:00', endTime: '06:00', isActive: true },
      ],
    };

    const { json: firstJson } = await post<unknown[]>(
      '/setup/shift-templates/batch',
      body,
      'it-591-shifts',
    );
    const { json: replayJson } = await post<unknown[]>(
      '/setup/shift-templates/batch',
      body,
      'it-591-shifts',
    );

    expect(firstJson.success).toBe(true);
    expect(replayJson).toEqual(firstJson);
    const rows = await db
      .select()
      .from(schema.shiftTemplates)
      .where(eq(schema.shiftTemplates.organizationId, ORG));
    expect(rows.map((r) => r.name).sort()).toEqual([
      'Evening Shift',
      'Morning Shift',
      'Night Shift',
    ]);
  });

  it('rolls back a dispenser and its first nozzle when the second fails mid-write', async () => {
    const key = 'it-591-mid-write';
    const eventsBefore = await eventCount();
    const failing = dispenserBody('DU-05', [
      twoNozzles[0],
      { name: FAIL_MARK, tankId: HSD_TANK, productId: HSD, currentReading: 0 },
    ]);

    const failed = await app.request('/setup/dispensers/with-nozzles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
      body: JSON.stringify(failing),
    });

    // The dispenser and N1 were inserted before Postgres refused the second
    // nozzle; the transaction takes all of it back, events included.
    expect(failed.status).toBe(500);
    expect(await dispensersWithCode('DU-05')).toEqual([]);
    expect(
      await db.select().from(schema.nozzles).where(eq(schema.nozzles.name, FAIL_MARK)),
    ).toEqual([]);
    expect(await eventCount()).toBe(eventsBefore);

    // A 5xx releases the key, so the corrected save goes through under it.
    const retry = await post<Created>(
      '/setup/dispensers/with-nozzles',
      dispenserBody('DU-05', twoNozzles),
      key,
    );
    expect(retry.json.success).toBe(true);
    const rows = await dispensersWithCode('DU-05');
    expect(rows.map((r) => r.id)).toEqual([retry.json.data.dispenser.id]);
    const nozzles = await db
      .select()
      .from(schema.nozzles)
      .where(eq(schema.nozzles.duId, retry.json.data.dispenser.id));
    expect(nozzles.map((n) => n.name).sort()).toEqual(['N1', 'N2']);
    expect(await eventCount()).toBe(eventsBefore + 3);
  });

  it('rolls back a template batch when a later template fails mid-write', async () => {
    const key = 'it-591-shifts-mid-write';
    const eventsBefore = await eventCount();
    const shift = (name: string) => ({ name, startTime: '08:00', endTime: '16:00' });

    const failed = await app.request('/setup/shift-templates/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
      body: JSON.stringify({ templates: [shift('Relief A'), shift(FAIL_MARK)] }),
    });

    expect(failed.status).toBe(500);
    const reliefs = async () =>
      (
        await db
          .select()
          .from(schema.shiftTemplates)
          .where(eq(schema.shiftTemplates.organizationId, ORG))
      )
        .map((r) => r.name)
        .filter((n) => n.startsWith('Relief') || n === FAIL_MARK)
        .sort();
    expect(await reliefs()).toEqual([]);
    expect(await eventCount()).toBe(eventsBefore);

    const retry = await post<unknown[]>(
      '/setup/shift-templates/batch',
      { templates: [shift('Relief A'), shift('Relief B')] },
      key,
    );
    expect(retry.json.success).toBe(true);
    expect(await reliefs()).toEqual(['Relief A', 'Relief B']);
    expect(await eventCount()).toBe(eventsBefore + 2);
  });
});
