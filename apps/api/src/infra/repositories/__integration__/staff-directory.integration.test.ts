import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { schema, type DbClient } from '@pump/db';
import { DrizzleStaffDirectory } from '../station-ops-repositories.js';

/**
 * Who `OpenShift` may put on a dispenser (#286), against a real Postgres. The
 * rule is the same fragment the shift-open form's staff list uses, so a user
 * the form offers is never refused and a foreign/inactive one never accepted.
 * Any active user of the station qualifies, whatever their role, so a Manager,
 * Accountant or Staff member can cover a pump; an Owner qualifies without a
 * station assignment row (#301).
 *
 * Runs only when TEST_DATABASE_URL is set (CI provides a service container).
 */

const CONNECTION = process.env.TEST_DATABASE_URL;
const TEST_SCHEMA = 'staff_directory_it';

const ORG = '00000000-0000-0000-0000-00000000c201';
const OTHER_ORG = '00000000-0000-0000-0000-00000000c202';
const STATION = '00000000-0000-0000-0000-00000000c203';
const ATTENDANT = '00000000-0000-0000-0000-00000000c204';
const OWNER = '00000000-0000-0000-0000-00000000c205';
const INACTIVE = '00000000-0000-0000-0000-00000000c206';
const FOREIGN = '00000000-0000-0000-0000-00000000c207';
const OTHER_STATION = '00000000-0000-0000-0000-00000000c208';
const STAFF = '00000000-0000-0000-0000-00000000c209';
const MANAGER = '00000000-0000-0000-0000-00000000c20a';
const ACCOUNTANT = '00000000-0000-0000-0000-00000000c20b';
const ELSEWHERE = '00000000-0000-0000-0000-00000000c20c';
const UNASSIGNED = '00000000-0000-0000-0000-00000000c20d';

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

describe.skipIf(!CONNECTION)('DrizzleStaffDirectory against real Postgres', () => {
  let sql: postgres.Sql;
  let db: DbClient;

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

    await db.insert(schema.organizations).values([
      { id: ORG, name: 'Tenant A' },
      { id: OTHER_ORG, name: 'Tenant B' },
    ]);
    await db.insert(schema.stations).values([
      { id: STATION, organizationId: ORG, name: 'Station A', code: 'STA' },
      { id: OTHER_STATION, organizationId: ORG, name: 'Station B', code: 'STB' },
    ]);
    await db.insert(schema.users).values([
      { id: ATTENDANT, organizationId: ORG, fullName: 'Arun', role: 'Attendant' },
      { id: OWNER, organizationId: ORG, fullName: 'Omar', role: 'Owner' },
      { id: INACTIVE, organizationId: ORG, fullName: 'Ina', role: 'Attendant', status: 'INACTIVE' },
      { id: FOREIGN, organizationId: OTHER_ORG, fullName: 'Fay', role: 'Attendant' },
      { id: STAFF, organizationId: ORG, fullName: 'Sam', role: 'Staff' },
      { id: MANAGER, organizationId: ORG, fullName: 'Meera', role: 'Manager' },
      { id: ACCOUNTANT, organizationId: ORG, fullName: 'Asha', role: 'Accountant' },
      { id: ELSEWHERE, organizationId: ORG, fullName: 'Eli', role: 'Attendant' },
      { id: UNASSIGNED, organizationId: ORG, fullName: 'Uma', role: 'Attendant' },
    ]);
    // Station membership (#291): everyone at STATION except ELSEWHERE (other
    // station) and UNASSIGNED (no station at all).
    await db.insert(schema.userStationAssignments).values([
      ...[ATTENDANT, OWNER, INACTIVE, FOREIGN, STAFF, MANAGER, ACCOUNTANT].map((userId) => ({
        userId,
        stationId: STATION,
      })),
      { userId: ELSEWHERE, stationId: OTHER_STATION },
    ]);
  }, 60_000);

  afterAll(async () => {
    if (sql) {
      await sql.unsafe('select pg_advisory_lock(872634)');
      await sql.unsafe(`drop schema if exists ${TEST_SCHEMA} cascade`);
      await sql.unsafe('select pg_advisory_unlock(872634)');
      await sql.end();
    }
  });

  it('returns active users of the organization at this station, any role (#301)', async () => {
    const found = await new DrizzleStaffDirectory(db).findAssignableUserIds(ORG, STATION, [
      ATTENDANT,
      STAFF,
      OWNER,
      MANAGER,
      ACCOUNTANT,
      INACTIVE,
      FOREIGN,
      ELSEWHERE,
      UNASSIGNED,
      'not-a-uuid',
    ]);
    expect([...found].sort()).toEqual([ATTENDANT, STAFF, OWNER, MANAGER, ACCOUNTANT].sort());
  });

  it('checks membership of the station asked about', async () => {
    const found = await new DrizzleStaffDirectory(db).findAssignableUserIds(ORG, OTHER_STATION, [
      ATTENDANT,
      ELSEWHERE,
    ]);
    expect([...found]).toEqual([ELSEWHERE]);
  });

  it('accepts an Owner at a station they have no assignment row for', async () => {
    const found = await new DrizzleStaffDirectory(db).findAssignableUserIds(ORG, OTHER_STATION, [
      OWNER,
      MANAGER,
    ]);
    expect([...found]).toEqual([OWNER]);
  });

  it('asks nothing for an empty list', async () => {
    const found = await new DrizzleStaffDirectory(db).findAssignableUserIds(ORG, STATION, []);
    expect(found.size).toBe(0);
  });
});
