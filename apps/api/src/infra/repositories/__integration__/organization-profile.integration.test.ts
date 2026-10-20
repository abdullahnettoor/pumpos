import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vite-plus/test';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import { schema, type DbClient } from '@pump/db';
import { UpdateOrganization, type EventPublisher } from '@pump/core';
import type { Role } from '@pump/shared';
import { buildContext } from '../../context.js';
import { runInTransaction } from '../../transaction.js';
import { DrizzleOrganizationProfileRepository } from '../organization-profile.repo.js';

/**
 * `UpdateOrganization` against a real Postgres (#634): the profile write and
 * its ORGANIZATION_UPDATED event commit together or not at all, and a refused
 * update leaves both the row and the event log untouched.
 *
 * Runs only when TEST_DATABASE_URL is set (CI provides a service container).
 */

const CONNECTION = process.env.TEST_DATABASE_URL;
const TEST_SCHEMA = 'organization_profile_it';

const ORG = '00000000-0000-0000-0000-00000000d601';
const OWNER = '00000000-0000-0000-0000-00000000d602';
const MANAGER = '00000000-0000-0000-0000-00000000d603';

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

const STORED_METADATA = {
  legalName: 'Sri Lakshmi Fuels Pvt Ltd',
  gstin: '32AAACS1234A1Z5',
  integration: { tally: 'on' },
};

const UPDATE = {
  name: 'Sri Lakshmi Fuels LLP',
  metadata: { legalName: 'Sri Lakshmi Fuels Pvt Ltd', gstin: '32AAACS1234A1Z6' },
};

const principal = (id: string, role: Role) => ({
  id,
  email: `${role.toLowerCase()}@example.com`,
  fullName: role,
  organizationId: ORG,
  role,
  assignedStationIds: [],
});

describe.skipIf(!CONNECTION)('UpdateOrganization against real Postgres (#634)', () => {
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
  }, 60_000);

  afterAll(async () => {
    if (sql) {
      await sql.unsafe('select pg_advisory_lock(872634)');
      await sql.unsafe(`drop schema if exists ${TEST_SCHEMA} cascade`);
      await sql.unsafe('select pg_advisory_unlock(872634)');
      await sql.end();
    }
  });

  beforeEach(async () => {
    await sql`delete from events`;
    await sql`delete from users`;
    await sql`delete from organizations`;
    await db
      .insert(schema.organizations)
      .values({ id: ORG, name: 'Sri Lakshmi Fuels', metadata: STORED_METADATA });
    await db.insert(schema.users).values([
      { id: OWNER, organizationId: ORG, fullName: 'Omar', role: 'Owner' },
      { id: MANAGER, organizationId: ORG, fullName: 'Meera', role: 'Manager' },
    ]);
  });

  const update = (
    user: ReturnType<typeof principal>,
    body: unknown,
    publisher?: (tx: DbClient) => EventPublisher,
  ) =>
    runInTransaction(
      db,
      (tx, events) =>
        new UpdateOrganization({
          repository: new DrizzleOrganizationProfileRepository(tx),
          events,
        }).execute(body, buildContext(user)),
      publisher,
    );

  const organization = async () =>
    (await db.select().from(schema.organizations).where(eq(schema.organizations.id, ORG)))[0];
  const events = () => db.select().from(schema.events);

  it('commits the profile and exactly one ORGANIZATION_UPDATED event', async () => {
    const result = await update(principal(OWNER, 'Owner'), UPDATE);
    expect(result.success).toBe(true);

    const row = await organization();
    expect(row.name).toBe('Sri Lakshmi Fuels LLP');
    expect(row.metadata).toEqual({ ...UPDATE.metadata, integration: { tally: 'on' } });

    const written = await events();
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({
      eventType: 'ORGANIZATION_UPDATED',
      organizationId: ORG,
      stationId: null,
      businessDayId: null,
      aggregateType: 'Organization',
      aggregateId: ORG,
      actorId: OWNER,
      payload: {
        changes: {
          name: { from: 'Sri Lakshmi Fuels', to: 'Sri Lakshmi Fuels LLP' },
          gstin: { from: '32AAACS1234A1Z5', to: '32AAACS1234A1Z6' },
        },
      },
    });
  });

  it('writes no row and no event when a Manager is refused', async () => {
    const result = await update(principal(MANAGER, 'Manager'), UPDATE);
    expect(result).toMatchObject({ success: false, error: { code: 'FORBIDDEN' } });
    expect((await organization()).name).toBe('Sri Lakshmi Fuels');
    expect(await events()).toEqual([]);
  });

  it('rolls the profile back when the event cannot be written', async () => {
    const failing = (): EventPublisher => ({
      publish: () => Promise.reject(new Error('event store down')),
    });
    await expect(update(principal(OWNER, 'Owner'), UPDATE, failing)).rejects.toThrow(
      'event store down',
    );
    const row = await organization();
    expect(row.name).toBe('Sri Lakshmi Fuels');
    expect(row.metadata).toEqual(STORED_METADATA);
    expect(await events()).toEqual([]);
  });
});
