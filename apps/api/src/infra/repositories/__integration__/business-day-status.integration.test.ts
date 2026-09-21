import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { schema, type DbClient } from '@pump/db';
import { DrizzleBusinessDayStatusReader } from '../station-ops-repositories.js';

/**
 * The Business Day status reader against a real Postgres (#225).
 *
 * The bug this pins down could never be caught with a fake: the correlated
 * shift-count subqueries interpolated the root table's `id` unqualified, so
 * Postgres resolved it inside the subquery scope — `s.business_day_id = s.id`,
 * never true — and every day reported "0 closed · 0 open" while lastActivityAt
 * silently fell back to the day row's own updated_at. Only the real planner's
 * scoping rules can regress that, so only the real database can guard it.
 *
 * Runs only when TEST_DATABASE_URL is set (CI provides a service container).
 * Everything lives in a dedicated schema that is dropped afterwards.
 */

const CONNECTION = process.env.TEST_DATABASE_URL;
const TEST_SCHEMA = 'business_day_status_it';

const ORG = '00000000-0000-0000-0000-00000000a101';
const STATION = '00000000-0000-0000-0000-00000000a102';
const USER = '00000000-0000-0000-0000-00000000a103';
const TEMPLATE = '00000000-0000-0000-0000-00000000a104';
const DAY_WITH_SHIFTS = '00000000-0000-0000-0000-00000000c101';
const DAY_QUIET = '00000000-0000-0000-0000-00000000c102';

const DAY_UPDATED_AT = new Date('2026-03-10T10:00:00.000Z');
const SHIFT_1_UPDATED_AT = new Date('2026-03-10T14:00:00.000Z');
const SHIFT_2_UPDATED_AT = new Date('2026-03-10T22:00:00.000Z'); // the latest activity
const OPEN_SHIFT_UPDATED_AT = new Date('2026-03-10T18:00:00.000Z');

const BOOTSTRAP = `
  do $$ begin
    if not exists (select from pg_roles where rolname = 'authenticated') then
      create role authenticated;
    end if;
    if not exists (select from pg_roles where rolname = 'anon') then
      create role anon;
    end if;
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

describe.skipIf(!CONNECTION)('Business Day status reader against real Postgres', () => {
  let sql: postgres.Sql;
  let db: DbClient;

  beforeAll(async () => {
    const bootstrap = postgres(CONNECTION!, { max: 1, onnotice: () => {} });
    try {
      // The shipped migrations create shared/global objects (e.g. the
      // on_auth_user_created trigger on auth.users), so two integration files
      // replaying them concurrently collide — serialize the bootstrap.
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
      max: 4,
      onnotice: () => {},
      connection: { search_path: TEST_SCHEMA },
    });
    db = drizzle(sql, { schema }) as unknown as DbClient;

    await seed();
  }, 60_000);

  afterAll(async () => {
    if (sql) {
      // Same serialization as the bootstrap: cascade-dropping the schema also
      // drops the function behind the global auth.users trigger, which
      // deadlocks against another file's concurrent bootstrap DDL.
      await sql.unsafe('select pg_advisory_lock(872634)');
      await sql.unsafe(`drop schema if exists ${TEST_SCHEMA} cascade`);
      await sql.unsafe('select pg_advisory_unlock(872634)');
      await sql.end();
    }
  });

  /**
   * One OPEN day carrying two closed shifts and one open shift, whose
   * updated_at values all trail the day row's own — plus a second, quiet OPEN
   * day with no shifts at all, whose counts must be genuinely zero.
   */
  async function seed() {
    await db.insert(schema.organizations).values({ id: ORG, name: 'Tenant A' });
    await db
      .insert(schema.stations)
      .values({ id: STATION, organizationId: ORG, name: 'Station A', code: 'STA' });
    await db
      .insert(schema.users)
      .values({ id: USER, organizationId: ORG, fullName: 'Asha', role: 'Manager' });
    await db.insert(schema.shiftTemplates).values({
      id: TEMPLATE,
      organizationId: ORG,
      name: 'Morning',
      startTime: '06:00',
      endTime: '14:00',
    });

    for (const [id, date] of [
      [DAY_WITH_SHIFTS, '2026-03-10'],
      [DAY_QUIET, '2026-03-11'],
    ] as const) {
      await db.insert(schema.businessDays).values({
        id,
        organizationId: ORG,
        stationId: STATION,
        businessDate: date,
        status: 'OPEN',
        openedBy: USER,
        updatedAt: DAY_UPDATED_AT,
      });
    }

    const shifts = [
      ['00000000-0000-0000-0000-00000000d101', 'CLOSED', SHIFT_1_UPDATED_AT],
      ['00000000-0000-0000-0000-00000000d102', 'CLOSED', SHIFT_2_UPDATED_AT],
      ['00000000-0000-0000-0000-00000000d103', 'OPEN', OPEN_SHIFT_UPDATED_AT],
    ] as const;
    for (const [id, status, updatedAt] of shifts) {
      await db.insert(schema.shifts).values({
        id,
        organizationId: ORG,
        stationId: STATION,
        businessDayId: DAY_WITH_SHIFTS,
        shiftTemplateId: TEMPLATE,
        status,
        openedBy: USER,
        openingCash: '0',
        updatedAt,
      });
    }
  }

  const load = (requestedDate: string) =>
    new DrizzleBusinessDayStatusReader(db).loadSlices(ORG, STATION, requestedDate, '2026-03-12');

  it('counts the day’s closed and open shifts (not zero)', async () => {
    const slices = await load('2026-03-10');
    expect(slices.requested).toMatchObject({
      id: DAY_WITH_SHIFTS,
      closedShiftCount: 2,
      openShiftCount: 1,
    });
  });

  it('reports zero counts only for a day that truly has no shifts', async () => {
    const slices = await load('2026-03-11');
    expect(slices.requested).toMatchObject({
      id: DAY_QUIET,
      closedShiftCount: 0,
      openShiftCount: 0,
    });
  });

  it('derives last activity from the latest shift, not the day row’s updated_at', async () => {
    const slices = await load('2026-03-10');
    expect(slices.requested?.lastActivityAt).toBe(SHIFT_2_UPDATED_AT.toISOString());
  });

  it('keeps the quiet day’s last activity at its own updated_at', async () => {
    const slices = await load('2026-03-11');
    expect(slices.requested?.lastActivityAt).toBe(DAY_UPDATED_AT.toISOString());
  });
});
