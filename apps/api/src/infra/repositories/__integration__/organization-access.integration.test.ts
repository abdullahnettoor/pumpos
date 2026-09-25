import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { schema, type DbClient } from '@pump/db';
import { ensureStationCapacity } from '@pump/core';
import {
  DrizzleOrganizationAccessAdminRepository,
  DrizzleOrganizationAccessReader,
  DrizzleOrganizationSubscriptionRepository,
  DrizzleStationCapacityPort,
} from '../organization-access.repo.js';

/**
 * Organization access against a real Postgres.
 *
 * Everything else about this feature is tested with fakes, which is right for
 * decisions but useless for promises the *database* makes: a partial unique
 * index that admits a second active row, a CHECK that never fires, or a lock
 * that does not serialize would all pass a fake and fail a customer.
 *
 * The schema is created by executing the shipped migration chain verbatim,
 * so a change to it which breaks these guarantees fails here rather than in
 * production.
 *
 * Runs only when TEST_DATABASE_URL is set (CI provides a service container).
 *
 * Everything lives in a dedicated schema that is dropped afterwards, so the
 * suite is safe to point at any database — including a shared dev one — and
 * cannot touch a real `public` table even by accident.
 */

const CONNECTION = process.env.TEST_DATABASE_URL;
const TEST_SCHEMA = 'organization_access_it';
const ORG = '00000000-0000-0000-0000-0000000000a1';
const OTHER_ORG = '00000000-0000-0000-0000-0000000000b1';

/**
 * Roles and the schema itself, run before anything is pinned to that schema —
 * a connection whose search_path names a schema that does not exist yet cannot
 * create objects.
 *
 * `gen_random_uuid()` is core since Postgres 13, so no extension is needed.
 */
const BOOTSTRAP = `
  -- Supabase provides these; the adapters and the shipped migration expect them.
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

/**
 * The shipped chain (supabase/migrations, derived from packages/db/migrations),
 * executed as written apart from its schema qualifier. Drift in those files
 * fails these tests, which is the point of reading them rather than restating
 * the DDL here.
 */
function shippedSchema(): string {
  const dir = path.resolve(__dirname, '../../../../../../supabase/migrations');
  // The files qualify objects as both `public.x` and `"public"."x"`; both
  // forms have to move, or a table would be created in the test schema while
  // its foreign key still pointed at the real one.
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => readFileSync(path.join(dir, f), 'utf8'))
    .join('\n')
    .replace(/(?:"public"|public)\./g, `"${TEST_SCHEMA}".`);
}

/**
 * Mirror Supabase's default privileges for tenant roles, so the migration's
 * REVOKE statements have something to take away.
 */
const SUPABASE_DEFAULT_GRANTS = `
  grant usage on schema ${TEST_SCHEMA} to authenticated, anon;
  alter default privileges in schema ${TEST_SCHEMA}
    grant select, insert, update, delete on tables to authenticated;
`;

const actor = { email: 'admin@pumpos.app', subjectId: 'auth-1' };

/**
 * The Postgres error code behind a failure. Drizzle wraps driver errors, so the
 * SQLSTATE lives on the cause rather than the thrown error.
 */
const sqlState = (error: unknown): string | undefined =>
  (error as { code?: string; cause?: { code?: string } })?.cause?.code ??
  (error as { code?: string })?.code;

/** Run `fn` and report the SQLSTATE it failed with, or undefined if it succeeded. */
async function sqlStateOf(fn: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await fn();
    return undefined;
  } catch (error) {
    return sqlState(error);
  }
}

describe.skipIf(!CONNECTION)('Organization access against real Postgres', () => {
  let sql: postgres.Sql;
  let db: DbClient;

  beforeAll(async () => {
    const bootstrap = postgres(CONNECTION!, { max: 1, onnotice: () => {} });
    try {
      // Serialized with the other integration files: the shipped migrations
      // inside BOOTSTRAP create shared/global objects that collide when
      // replayed concurrently.
      await bootstrap.unsafe('select pg_advisory_lock(872634)');
      await bootstrap.unsafe(BOOTSTRAP);
      await bootstrap.unsafe(
        `set search_path to ${TEST_SCHEMA};` +
          SUPABASE_DEFAULT_GRANTS +
          shippedSchema().replace(
            /create trigger on_auth_user_created/gi,
            'create or replace trigger on_auth_user_created',
          ),
      );
      await bootstrap.unsafe('select pg_advisory_unlock(872634)');
    } finally {
      await bootstrap.end();
    }

    // Every connection in this pool resolves unqualified names to the test
    // schema, so neither Drizzle nor the raw probes can reach `public`.
    sql = postgres(CONNECTION!, {
      max: 4,
      onnotice: () => {},
      connection: { search_path: TEST_SCHEMA },
    });
    db = drizzle(sql, { schema }) as unknown as DbClient;
  }, 60_000);

  afterAll(async () => {
    // Serialized like the bootstrap: the cascade drop touches the global
    // auth.users trigger's function and deadlocks against concurrent DDL.
    await sql?.unsafe('select pg_advisory_lock(872634)').catch(() => undefined);
    await sql?.unsafe(`drop schema if exists ${TEST_SCHEMA} cascade`).catch(() => undefined);
    await sql?.unsafe('select pg_advisory_unlock(872634)').catch(() => undefined);
    await sql?.end();
  });

  beforeEach(async () => {
    await sql`delete from organization_capability_grants`;
    await sql`delete from organization_limit_overrides`;
    await sql`delete from stations`;
    await sql`delete from organizations`;
    await sql`insert into organizations (id, name) values (${ORG}, 'Org A'), (${OTHER_ORG}, 'Org B')`;
  });

  const repository = () => new DrizzleOrganizationAccessAdminRepository(db);

  describe('capability grants', () => {
    it('admits one active grant per Organization and key, and no more', async () => {
      const repo = repository();
      await repo.insertGrant({
        organizationId: ORG,
        capabilityKey: 'exports.tally',
        actor,
        reason: null,
      });

      const state = await sqlStateOf(() =>
        repo.insertGrant({
          organizationId: ORG,
          capabilityKey: 'exports.tally',
          actor,
          reason: null,
        }),
      );

      expect(state, 'a second active grant must violate the partial unique index').toBe('23505');
    });

    it('lets another Organization hold the same capability', async () => {
      const repo = repository();
      await repo.insertGrant({
        organizationId: ORG,
        capabilityKey: 'exports.tally',
        actor,
        reason: null,
      });

      await expect(
        repo.insertGrant({
          organizationId: OTHER_ORG,
          capabilityKey: 'exports.tally',
          actor,
          reason: null,
        }),
      ).resolves.toMatchObject({ organizationId: OTHER_ORG });
    });

    it('frees the key on revocation and keeps the closed row as history', async () => {
      const repo = repository();
      const first = await repo.insertGrant({
        organizationId: ORG,
        capabilityKey: 'exports.tally',
        actor,
        reason: 'pilot',
      });
      await repo.revokeGrant(first.id, { email: 'other@pumpos.app', subjectId: null });

      const regrant = await repo.insertGrant({
        organizationId: ORG,
        capabilityKey: 'exports.tally',
        actor,
        reason: 'renewed',
      });

      expect(regrant.id).not.toBe(first.id);
      const history = await repo.listGrants(ORG);
      expect(history).toHaveLength(2);
      expect(history.filter((g) => g.revokedAt === null)).toHaveLength(1);
      // The closed period keeps who closed it, not just that it closed.
      const closed = history.find((g) => g.id === first.id)!;
      expect(closed.revokedByEmail).toBe('other@pumpos.app');
      expect(closed.reason).toBe('pilot');
    });

    it('is invisible to the effective access document once revoked', async () => {
      const repo = repository();
      const grant = await repo.insertGrant({
        organizationId: ORG,
        capabilityKey: 'exports.tally',
        actor,
        reason: null,
      });
      const before = await new DrizzleOrganizationAccessReader(db).load(ORG);
      await repo.revokeGrant(grant.id, actor);
      const after = await new DrizzleOrganizationAccessReader(db).load(ORG);

      expect(before.grantedCapabilities).toEqual(['exports.tally']);
      expect(after.grantedCapabilities).toEqual([]);
      // …but the history is still readable, which is the point of closing rows.
      expect(await repo.listGrants(ORG)).toHaveLength(1);
    });
  });

  describe('Limit overrides', () => {
    it('admits one active override per Organization and key', async () => {
      const repo = repository();
      await repo.insertOverride({
        organizationId: ORG,
        limitKey: 'station_count',
        value: 3,
        actor,
        reason: 'three sites',
      });

      const state = await sqlStateOf(() =>
        repo.insertOverride({
          organizationId: ORG,
          limitKey: 'station_count',
          value: 5,
          actor,
          reason: 'five sites',
        }),
      );

      expect(state, 'a second active override must violate the partial unique index').toBe('23505');
    });

    it('rejects a non-positive value at the database, not just in code', async () => {
      const state = await sqlStateOf(
        () =>
          sql`insert into organization_limit_overrides (organization_id, limit_key, value, assigned_by_email)
              values (${ORG}, 'station_count', 0, 'admin@pumpos.app')`,
      );

      expect(state, 'a non-positive Limit must violate the CHECK constraint').toBe('23514');
    });

    it('keeps the old value when an override is replaced', async () => {
      const repo = repository();
      const first = await repo.insertOverride({
        organizationId: ORG,
        limitKey: 'station_count',
        value: 3,
        actor,
        reason: 'three sites',
      });
      await repo.revokeOverride(first.id, actor);
      await repo.insertOverride({
        organizationId: ORG,
        limitKey: 'station_count',
        value: 5,
        actor,
        reason: 'expanded',
      });

      const history = await repo.listOverrides(ORG);
      expect(history.map((o) => o.value).sort()).toEqual([3, 5]);
      expect(history.filter((o) => o.revokedAt === null)).toEqual([
        expect.objectContaining({ value: 5 }),
      ]);
      const reader = await new DrizzleOrganizationAccessReader(db).load(ORG);
      expect(reader.limitOverrides.station_count).toBe(5);
    });
  });

  describe('tenant roles cannot reach commercial history', () => {
    it('reads nothing and writes nothing, even for its own Organization', async () => {
      await repository().insertGrant({
        organizationId: ORG,
        capabilityKey: 'exports.tally',
        actor,
        reason: null,
      });

      await sql.begin(async (tx) => {
        await tx`set local role authenticated`;

        // The migration revokes the grants outright *and* enables RLS with no
        // tenant policy, so a read is refused rather than merely empty. Accept
        // either shape: both mean the tenant cannot see commercial history.
        const readGrants = await sqlStateOf(() =>
          tx.savepoint((s) => s`select count(*) from organization_capability_grants`),
        );
        const readOverrides = await sqlStateOf(() =>
          tx.savepoint((s) => s`select count(*) from organization_limit_overrides`),
        );
        expect(readGrants, 'reading grants as a tenant must be denied').toBe('42501');
        expect(readOverrides, 'reading overrides as a tenant must be denied').toBe('42501');

        // Nor can a tenant grant itself access.
        const write = await sqlStateOf(() =>
          tx.savepoint(
            (s) =>
              s`insert into organization_capability_grants (organization_id, capability_key, granted_by_email)
                values (${ORG}, 'exports.tally', 'tenant@example.com')`,
          ),
        );
        expect(write, 'writing a grant as a tenant must be denied').toBe('42501');
      });
    });
  });

  describe('Station capacity under concurrency', () => {
    const addStation = (code: string) =>
      sql`insert into stations (organization_id, name, code) values (${ORG}, ${'Station ' + code}, ${code})`;

    it('counts every Station row, inactive ones included', async () => {
      await addStation('ST1');
      await sql`insert into stations (organization_id, name, code, is_active, onboarding_status)
                values (${ORG}, 'Idle', 'ST2', false, 'NOT_STARTED')`;

      const inputs = await new DrizzleOrganizationAccessReader(db).load(ORG);

      expect(inputs.usage.station_count).toBe(2);
    });

    it('serializes two concurrent capacity checks so only one may proceed', async () => {
      // The property `SELECT ... FOR UPDATE` exists for: two requests that both
      // read "0 of 1 used" would otherwise both provision. Each attempt gets
      // its own pinned connection so the lock is really held across statements,
      // and holds it until after inserting — exactly like the real route, whose
      // check and insert share one transaction.
      const attempt = async (code: string) => {
        const client = postgres(CONNECTION!, {
          max: 1,
          onnotice: () => {},
          connection: { search_path: TEST_SCHEMA },
        });
        const clientDb = drizzle(client, { schema }) as unknown as DbClient;
        try {
          await client.unsafe('begin');
          const decision = await ensureStationCapacity(
            new DrizzleStationCapacityPort(clientDb),
            ORG,
          );
          if (!decision.success) {
            await client.unsafe('rollback');
            return { ok: false as const, code: decision.error.code };
          }
          await client.unsafe(
            `insert into stations (organization_id, name, code) values ('${ORG}', 'Station ${code}', '${code}')`,
          );
          await client.unsafe('commit');
          return { ok: true as const, code: null };
        } catch (error) {
          await client.unsafe('rollback').catch(() => undefined);
          return { ok: false as const, code: sqlState(error) ?? (error as Error).message };
        } finally {
          await client.end();
        }
      };

      const [a, b] = await Promise.all([attempt('C1'), attempt('C2')]);

      const succeeded = [a, b].filter((r) => r.ok);
      expect(succeeded, `outcomes: ${JSON.stringify([a, b])}`).toHaveLength(1);
      const refused = [a, b].find((r) => !r.ok)!;
      expect(refused.code).toBe('LIMIT_REACHED');

      const [count] =
        await sql`select count(*)::int as n from stations where organization_id = ${ORG}`;
      expect(count.n).toBe(1);
    }, 30_000);

    it('lets a raised Limit admit another Station', async () => {
      await addStation('ST1');
      await repository().insertOverride({
        organizationId: ORG,
        limitKey: 'station_count',
        value: 3,
        actor,
        reason: 'contracted',
      });

      const result = await ensureStationCapacity(new DrizzleStationCapacityPort(db), ORG);

      expect(result.success).toBe(true);
    });

    it('carries usage above a lowered Limit without disturbing it', async () => {
      await addStation('ST1');
      await addStation('ST2');
      await addStation('ST3');
      await repository().insertOverride({
        organizationId: ORG,
        limitKey: 'station_count',
        value: 1,
        actor,
        reason: 'downgrade',
      });

      const result = await ensureStationCapacity(new DrizzleStationCapacityPort(db), ORG);
      const [count] =
        await sql`select count(*)::int as n from stations where organization_id = ${ORG}`;

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.details).toMatchObject({ value: 1, used: 3 });
      // Nothing was deactivated: a downgrade blocks growth, it does not prune.
      expect(count.n).toBe(3);
    });
  });

  describe('suspension is stored apart from billing', () => {
    it('survives a billing change, and a restore leaves billing alone', async () => {
      const subscriptions = new DrizzleOrganizationSubscriptionRepository(db);
      await subscriptions.setStatus({
        organizationId: ORG,
        status: 'PAST_DUE',
        accessUntil: '2026-09-27T00:00:00.000Z',
      });
      await subscriptions.setSuspension({
        organizationId: ORG,
        suspendedAt: '2026-09-20T00:00:00.000Z',
      });

      // A confirmed payment writes the billing columns only.
      await subscriptions.setStatus({ organizationId: ORG, status: 'ACTIVE', accessUntil: null });
      const afterPayment = await subscriptions.load(ORG);
      expect(afterPayment).toMatchObject({
        status: 'ACTIVE',
        suspendedAt: '2026-09-20T00:00:00.000Z',
      });

      await subscriptions.setSuspension({ organizationId: ORG, suspendedAt: null });
      expect(await subscriptions.load(ORG)).toMatchObject({
        status: 'ACTIVE',
        suspendedAt: null,
      });
    });
  });
});
