import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';
import postgres from 'postgres';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { schema, type DbClient } from '@pump/db';
import {
  FixedClock,
  GetDecantation,
  ListDecantations,
  RecordDecantation,
  UuidGenerator,
} from '@pump/core';
import type { ExecutionContext } from '@pump/core';
import { runInTransaction } from '../../transaction.js';
import { TimestampDocumentNumberGenerator } from '../../doc-numbers.js';
import {
  DrizzleDecantationRepository,
  DrizzleDensityReadingRepository,
} from '../decantation-repositories.js';
import { DrizzleTankRepository } from '../setup-repositories.js';
import { DrizzleBusinessDayRepository } from '../station-ops-repositories.js';

/**
 * RecordDecantation / Get / List against real Postgres (#467): tank lines,
 * chambers, density readings and the outbox events commit together; update
 * replaces children; reads are organization + station scoped.
 *
 * Runs only when TEST_DATABASE_URL is set.
 */

const CONNECTION = process.env.TEST_DATABASE_URL;
const TEST_SCHEMA = 'decantation_it';

const id = (n: number) => `00000000-0000-0000-0000-00000000d${String(n).padStart(3, '0')}`;
const ORG = id(1);
const OTHER_ORG = id(2);
const STATION = id(3);
const OTHER_STATION = id(4);
const FOREIGN_STATION = id(5);
const USER = id(6);
const PRODUCT = id(7);
const T1 = id(8);
const T2 = id(9);
const T_OTHER = id(10);

const ctx = (organizationId: string, stationId: string): ExecutionContext => ({
  organizationId,
  stationId,
  businessDayId: null,
  actorId: USER,
  correlationId: null,
  timeZone: 'Asia/Kolkata',
  businessDayStartsAt: '06:00',
  clock: new FixedClock(new Date('2026-10-09T09:00:00+05:30')),
  ids: new UuidGenerator(),
});

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

describe.skipIf(!CONNECTION)('Decantation use-cases against real Postgres', () => {
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
      max: 4,
      onnotice: () => {},
      connection: { search_path: TEST_SCHEMA },
    });
    db = drizzle(sql, { schema }) as unknown as DbClient;

    for (const [oid, name] of [
      [ORG, 'Tenant A'],
      [OTHER_ORG, 'Tenant B'],
    ] as const)
      await db.insert(schema.organizations).values({ id: oid, name });
    for (const [sid, oid, code] of [
      [STATION, ORG, 'STA'],
      [OTHER_STATION, ORG, 'STO'],
      [FOREIGN_STATION, OTHER_ORG, 'STF'],
    ] as const)
      await db
        .insert(schema.stations)
        .values({ id: sid, organizationId: oid, name: `Station ${code}`, code });
    await db
      .insert(schema.users)
      .values({ id: USER, organizationId: ORG, fullName: 'Asha', role: 'Owner' });
    await db.insert(schema.products).values({
      id: PRODUCT,
      organizationId: ORG,
      name: 'MS',
      code: 'MS',
      productType: 'FUEL',
      unit: 'L',
    });
    for (const [tid, oid, sid, name] of [
      [T1, ORG, STATION, 'Tank 1'],
      [T2, ORG, STATION, 'Tank 2'],
      [T_OTHER, ORG, OTHER_STATION, 'Tank O'],
    ] as const)
      await db.insert(schema.tanks).values({
        id: tid,
        organizationId: oid,
        stationId: sid,
        name,
        productId: PRODUCT,
        capacity: '20000',
      });
  }, 60_000);

  afterAll(async () => {
    if (sql) {
      await sql.unsafe('select pg_advisory_lock(872634)');
      await sql.unsafe(`drop schema if exists ${TEST_SCHEMA} cascade`);
      await sql.unsafe('select pg_advisory_unlock(872634)');
      await sql.end();
    }
  });

  const record = (cmd: any, c = ctx(ORG, STATION)) =>
    runInTransaction(db, (tx, events) =>
      new RecordDecantation({
        decantations: new DrizzleDecantationRepository(tx),
        densityReadings: new DrizzleDensityReadingRepository(tx),
        tanks: new DrizzleTankRepository(tx),
        businessDays: new DrizzleBusinessDayRepository(tx),
        docNumbers: new TimestampDocumentNumberGenerator(),
        events,
      }).execute(cmd, c),
    );

  const repo = () => new DrizzleDecantationRepository(db);

  it('creates, then updates a visit; children and readings are replaced atomically', async () => {
    const created = await record({
      stationId: STATION,
      tankerNumber: 'KA01AB1234',
      unloadEndedAt: '2026-10-09T09:00:00+05:30',
      lines: [
        { tankId: T1, beforeDip: 3000, roDensity: 745.5, observedDensity: 748, observedTempC: 30 },
      ],
      chambers: [
        { chamberNo: 1, capacityL: 4000, mark: 'SHORT', tankLineIndex: 0, emptied: false },
        { chamberNo: 2, capacityL: 4000, mark: 'OK', sealOk: true, emptied: true },
      ],
    });
    expect(created.success).toBe(true);
    if (!created.success) return;
    const d = created.data.decantation;
    expect(d.documentNumber).toMatch(/^DEC-/);

    const stored = await repo().findById(ORG, d.id);
    expect(stored?.status).toBe('PENDING_MEASUREMENT');
    expect(stored?.businessDate).toBe('2026-10-09');
    expect(stored?.lines).toHaveLength(1);
    expect(stored?.lines[0]).toMatchObject({
      productId: PRODUCT,
      beforeDip: 3000,
      roDensity: 745.5,
    });
    expect(stored?.chambers.map((c) => c.chamberNo)).toEqual([1, 2]);
    expect(stored?.chambers[0].tankLineId).toBe(stored?.lines[0].id);
    expect(stored?.flags.map((f) => f.code).sort()).toEqual([
      'CHAMBER_NOT_EMPTIED',
      'TANKER_SHORT',
    ]);

    const readings = await db.select().from(schema.densityReadings);
    expect(readings).toHaveLength(1);
    expect(readings[0]).toMatchObject({
      kind: 'DECANTATION',
      entryMethod: 'HYDROMETER',
      density15: '745.50',
    });

    const types = (await db.select().from(schema.events)).map((e) => e.eventType).sort();
    expect(types).toEqual(['DECANTATION_FLAGGED', 'DECANTATION_RECORDED', 'DENSITY_RECORDED']);

    // Update: add the after dip + a second tank; density reading replaced, not duplicated.
    const updated = await record({
      decantationId: d.id,
      stationId: STATION,
      tankerNumber: 'KA01AB1234',
      lines: [
        { id: stored!.lines[0].id, tankId: T1, beforeDip: 3000, roDensity: 746, afterDip: 11000 },
        { tankId: T2, beforeDip: 500 },
      ],
    });
    expect(updated.success).toBe(true);
    const after = await repo().findById(ORG, d.id);
    expect(after?.lines).toHaveLength(2);
    expect(after?.lines.find((l) => l.tankId === T1)).toMatchObject({
      afterDip: 11000,
      roDensity: 746,
    });
    expect(after?.chambers).toHaveLength(0);
    const readings2 = await db.select().from(schema.densityReadings);
    expect(readings2).toHaveLength(1);
    expect(readings2[0].density15).toBe('746.00');
  });

  it('rolls everything back when the command is refused (foreign tank)', async () => {
    const before = (await db.select().from(schema.decantations)).length;
    const r = await record({
      stationId: STATION,
      tankerNumber: 'X',
      lines: [{ tankId: T_OTHER, beforeDip: 1 }],
    });
    expect(r.success).toBe(false);
    expect((await db.select().from(schema.decantations)).length).toBe(before);
  });

  it('scopes reads by organization and station', async () => {
    const list = (stationId: string, organizationId = ORG) =>
      new ListDecantations({ decantations: repo() }).execute(
        { stationId, from: '2026-10-01', to: '2026-10-31' },
        ctx(organizationId, stationId),
      );
    const mine = await list(STATION);
    expect(mine.success && mine.data.length).toBe(1);
    const sibling = await list(OTHER_STATION);
    expect(sibling.success && sibling.data.length).toBe(0);
    const foreign = await list(STATION, OTHER_ORG);
    expect(foreign.success && foreign.data.length).toBe(0);

    const [row] = await db
      .select({ id: schema.decantations.id })
      .from(schema.decantations)
      .where(and(eq(schema.decantations.stationId, STATION)));
    const get = (organizationId: string, stationId?: string) =>
      new GetDecantation({ decantations: repo() }).execute(
        { decantationId: row.id, stationId },
        ctx(organizationId, STATION),
      );
    expect((await get(ORG)).success).toBe(true);
    expect((await get(OTHER_ORG)).success).toBe(false);
    expect((await get(ORG, OTHER_STATION)).success).toBe(false);
  });
});
