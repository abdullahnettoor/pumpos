import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, sql as dsql } from 'drizzle-orm';
import { schema, type DbClient, type DbExecutor } from '@pump/db';
import { FixedClock, UpdateStationTankRules, UuidGenerator } from '@pump/core';
import type { ExecutionContext } from '@pump/core';
import { DrizzleStationRepository } from '../setup-repositories.js';

/**
 * UpdateStationTankRules against a real Postgres (#690).
 *
 * The use-case reads the Station, decides whether anything changed and builds
 * the STATION_UPDATED before/after from that read. Only a real server can prove
 * the Station row lock (`SELECT ... FOR UPDATE`, filtered by Organization)
 * makes two concurrent saves queue, so the second one reads the first one's
 * committed result: its `before` is the first's `after`, an identical save is
 * a no-op, and saves to different keys both survive.
 */

const CONNECTION = process.env.TEST_DATABASE_URL;
const TEST_SCHEMA = 'tank_rules_lock_it';

const ORG = '00000000-0000-0000-0000-00000000f101';
const OTHER_ORG = '00000000-0000-0000-0000-00000000f102';
const STATION = '00000000-0000-0000-0000-00000000f103';
const USER = '00000000-0000-0000-0000-00000000f104';

const STORED = {
  shift_grace_minutes: 15,
  report_config: { paper: 'A4' },
  tankLevels: { criticalBelowPct: 25, lowBelowPct: 40 },
};

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

const ctx = (): ExecutionContext => ({
  organizationId: ORG,
  stationId: null,
  businessDayId: null,
  actorId: USER,
  correlationId: null,
  clock: new FixedClock(new Date('2026-10-09T09:00:00+05:30')),
  ids: new UuidGenerator(),
});

describe.skipIf(!CONNECTION)('UpdateStationTankRules against real Postgres', () => {
  const clients: postgres.Sql[] = [];
  let dbA: DbClient;
  let dbB: DbClient;
  let probe: postgres.Sql;

  const connect = () => {
    const client = postgres(CONNECTION!, {
      max: 1,
      onnotice: () => {},
      connection: { search_path: TEST_SCHEMA },
    });
    clients.push(client);
    return client;
  };

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
    dbA = drizzle(connect(), { schema }) as unknown as DbClient;
    dbB = drizzle(connect(), { schema }) as unknown as DbClient;
    probe = connect();
    await dbA.insert(schema.organizations).values([
      { id: ORG, name: 'Tenant A' },
      { id: OTHER_ORG, name: 'Tenant B' },
    ]);
  }, 60_000);

  afterAll(async () => {
    const [first] = clients;
    if (first) {
      await first.unsafe('select pg_advisory_lock(872634)');
      await first.unsafe(`drop schema if exists ${TEST_SCHEMA} cascade`);
      await first.unsafe('select pg_advisory_unlock(872634)');
    }
    await Promise.all(clients.map((c) => c.end()));
  });

  const reset = async () => {
    await dbA.delete(schema.stations).where(eq(schema.stations.id, STATION));
    await dbA.insert(schema.stations).values({
      id: STATION,
      organizationId: ORG,
      name: 'Station A',
      code: 'STA',
      settings: STORED,
    });
  };
  const stored = async () =>
    (await dbA.select().from(schema.stations).where(eq(schema.stations.id, STATION)))[0]!
      .settings as Record<string, unknown>;

  async function waitUntilBlocked(pid: number) {
    for (let i = 0; i < 300; i++) {
      const [row] = await probe`select wait_event_type from pg_stat_activity where pid = ${pid}`;
      if (row?.wait_event_type === 'Lock') return;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error(`backend ${pid} never blocked on a lock`);
  }

  /**
   * Save `a` in one transaction and `b` in another that starts only after `a`
   * holds the Station lock; `a` commits once `b` is observed waiting on it.
   */
  async function raceSaves(a: Record<string, unknown>, b: Record<string, unknown>) {
    const events: Array<{ who: string; payload: Record<string, any> }> = [];
    const run = (
      db: DbClient,
      who: string,
      settings: Record<string, unknown>,
      hold?: Promise<void>,
      onLocked?: () => void,
    ) =>
      db.transaction(async (tx: DbExecutor) => {
        const base = new DrizzleStationRepository(tx);
        const repository = {
          lockForUpdate: async (...args: Parameters<typeof base.lockForUpdate>) => {
            const station = await base.lockForUpdate(...args);
            onLocked?.();
            await hold;
            return station;
          },
          patchSettings: base.patchSettings.bind(base),
        };
        const publisher = {
          publish: async (list: Array<{ payload: Record<string, any> }>) => {
            for (const e of list) events.push({ who, payload: e.payload });
          },
        };
        const [{ pid }] = (await tx.execute(dsql`select pg_backend_pid() as pid`)) as unknown as [
          { pid: number },
        ];
        pids[who] = pid;
        const result = await new UpdateStationTankRules({
          repository,
          events: publisher as never,
        }).execute({ id: STATION, settings: settings as never }, ctx());
        expect(result.success).toBe(true);
      });
    const pids: Record<string, number> = {};
    let release!: () => void;
    const hold = new Promise<void>((r) => (release = r));
    let aLocked!: () => void;
    const locked = new Promise<void>((r) => (aLocked = r));
    const first = run(dbA, 'a', a, hold, aLocked);
    await locked;
    const second = run(dbB, 'b', b);
    for (let i = 0; i < 300 && !pids.b; i++) await new Promise((r) => setTimeout(r, 10));
    await waitUntilBlocked(pids.b!);
    release();
    await Promise.all([first, second]);
    return events;
  }

  it("queues a second save behind the first, so its before is the first's after", async () => {
    await reset();
    const events = await raceSaves(
      { stock_variance_tolerance_pct: 1 },
      { stock_variance_tolerance_pct: 2 },
    );
    expect(events.map((e) => e.who)).toEqual(['a', 'b']);
    expect(events[1]!.payload.stockVarianceTolerancePct).toEqual({ before: 1, after: 2 });
    expect((await stored()).stock_variance_tolerance_pct).toBe(2);
  });

  it('treats an identical concurrent save as a no-op: one change, one event', async () => {
    await reset();
    const events = await raceSaves(
      { stock_variance_tolerance_pct: 1 },
      { stock_variance_tolerance_pct: 1 },
    );
    expect(events).toHaveLength(1);
    expect(events[0]!.who).toBe('a');
  });

  it('keeps both keys when concurrent saves touch different ones, and every other key', async () => {
    await reset();
    const levels = { criticalBelowPct: 10, lowBelowPct: 30 };
    await raceSaves({ tankLevels: levels }, { stock_variance_tolerance_pct: 1.5 });
    expect(await stored()).toEqual({
      ...STORED,
      tankLevels: levels,
      stock_variance_tolerance_pct: 1.5,
    });
  });

  it("does not find or lock another Organization's Station", async () => {
    await reset();
    await dbA.transaction(async (tx: DbExecutor) => {
      const repo = new DrizzleStationRepository(tx);
      expect(await repo.lockForUpdate(STATION, OTHER_ORG)).toBeNull();
      expect((await repo.lockForUpdate(STATION, ORG))?.id).toBe(STATION);
    });
  });
});
