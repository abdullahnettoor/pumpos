import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { schema, type DbClient } from '@pump/db';
import {
  FixedClock,
  GetDensityTodaySummary,
  ListDensityReadings,
  RecordDecantation,
  RecordDensityReading,
  UuidGenerator,
} from '@pump/core';
import type { ExecutionContext } from '@pump/core';
import { runInTransaction } from '../../transaction.js';
import { TimestampDocumentNumberGenerator } from '../../doc-numbers.js';
import {
  DrizzleDecantationRepository,
  DrizzleDensityReadingRepository,
} from '../decantation-repositories.js';
import { DrizzleBusinessDayRepository } from '../station-ops-repositories.js';
import { DrizzleTankRepository } from '../setup-repositories.js';

const CONNECTION = process.env.TEST_DATABASE_URL;
const TEST_SCHEMA = 'density_it';

const id = (n: number) => `00000000-0000-0000-0000-00000000e${String(n).padStart(3, '0')}`;
const ORG = id(1);
const STATION = id(2);
const PRODUCT_MS = id(3);
const TANK_1 = id(4);
const USER = id(5);

const suite = CONNECTION ? describe : describe.skip;

suite('Density register integration (Postgres)', () => {
  let testClient: postgres.Sql;
  let db: DbClient;

  beforeAll(async () => {
    const bootstrap = postgres(CONNECTION!, { max: 1, onnotice: () => {} });
    try {
      await bootstrap.unsafe('select pg_advisory_lock(872635)');
      await bootstrap.unsafe(`
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
      `);
      const dir = path.resolve(__dirname, '../../../../../../supabase/migrations');
      const migrations = readdirSync(dir)
        .filter((f) => f.endsWith('.sql'))
        .sort()
        .map((f) => readFileSync(path.join(dir, f), 'utf8'))
        .join('\n')
        .replace(/(?:"public"|public)\./g, `"${TEST_SCHEMA}".`)
        .replace(
          /create trigger on_auth_user_created/gi,
          'create or replace trigger on_auth_user_created',
        );
      await bootstrap.unsafe(`set search_path to ${TEST_SCHEMA};` + migrations);
      await bootstrap.unsafe('select pg_advisory_unlock(872635)');
    } finally {
      await bootstrap.end();
    }
    testClient = postgres(CONNECTION!, {
      max: 4,
      onnotice: () => {},
      connection: { search_path: TEST_SCHEMA },
    });
    db = drizzle(testClient, { schema });

    await db.insert(schema.organizations).values({
      id: ORG,
      name: 'Density Test Org',
    });
    await db
      .insert(schema.users)
      .values({ id: USER, organizationId: ORG, fullName: 'Asha', role: 'Owner' });
    await db.insert(schema.stations).values({
      id: STATION,
      organizationId: ORG,
      name: 'Highway Express',
      code: 'HE01',
    });
    await db.insert(schema.products).values({
      id: PRODUCT_MS,
      organizationId: ORG,
      name: 'Motor Spirit',
      code: 'MS',
      productType: 'FUEL',
      unit: 'L',
    });
    await db.insert(schema.tanks).values({
      id: TANK_1,
      organizationId: ORG,
      stationId: STATION,
      productId: PRODUCT_MS,
      name: 'MS Underground Tank 1',
      capacity: '20000',
    });
  });

  afterAll(async () => {
    if (testClient) await testClient.end();
  });

  const ctx: ExecutionContext = {
    organizationId: ORG,
    stationId: STATION,
    businessDayId: null,
    actorId: USER,
    correlationId: null,
    timeZone: 'Asia/Kolkata',
    businessDayStartsAt: '06:00',
    clock: new FixedClock(new Date('2026-10-11T06:30:00Z')),
    ids: new UuidGenerator(),
  };

  it('records morning hydrometer reading, computes 15 °C, and appears in today summary and register list', async () => {
    const recordResult = await runInTransaction(db, async (tx, events) => {
      const repo = new DrizzleDensityReadingRepository(tx);
      const useCase = new RecordDensityReading({
        densityReadings: repo,
        events,
      });

      return useCase.execute(
        {
          stationId: STATION,
          productId: PRODUCT_MS,
          kind: 'MORNING',
          entryMethod: 'HYDROMETER',
          observedDensity: 745.0,
          observedTempC: 28.5,
          sampledFrom: 'TANK',
          tankId: TANK_1,
        },
        ctx,
      );
    });

    expect(recordResult.success).toBe(true);
    if (!recordResult.success) return;

    const repo = new DrizzleDensityReadingRepository(db);

    // List readings
    const listResult = await new ListDensityReadings({ densityReadings: repo }).execute(
      { stationId: STATION },
      ctx,
    );
    expect(listResult.success).toBe(true);
    if (!listResult.success) return;
    expect(listResult.data.length).toBeGreaterThanOrEqual(1);
    const item = listResult.data[0];
    expect(item.productId).toBe(PRODUCT_MS);
    expect(item.productName).toBe('Motor Spirit');
    expect(item.tankName).toBe('MS Underground Tank 1');

    // Today summary
    const summaryResult = await new GetDensityTodaySummary({ densityReadings: repo }).execute(
      { stationId: STATION, businessDate: '2026-10-11' },
      ctx,
    );
    expect(summaryResult.success).toBe(true);
    if (!summaryResult.success) return;
    expect(summaryResult.data.totalProducts).toBe(1);
    expect(summaryResult.data.recordedCount).toBe(1);
    expect(summaryResult.data.missingCount).toBe(0);
    expect(summaryResult.data.products[0].todayRecorded).toBe(true);
  });

  it('shows Decantation RO-density readings in the register and product history; latestToday is the newest', async () => {
    const decantCtx = { ...ctx, ids: new UuidGenerator() };
    const rec = await runInTransaction(db, (tx, events) =>
      new RecordDecantation({
        decantations: new DrizzleDecantationRepository(tx),
        densityReadings: new DrizzleDensityReadingRepository(tx),
        tanks: new DrizzleTankRepository(tx),
        businessDays: new DrizzleBusinessDayRepository(tx),
        docNumbers: new TimestampDocumentNumberGenerator(),
        events,
      }).execute(
        {
          stationId: STATION,
          tankerNumber: 'KA01AB1234',
          lines: [{ tankId: TANK_1, beforeDip: 1000, roDensity: 751.2 }],
        },
        decantCtx,
      ),
    );
    if (!rec.success) throw new Error(JSON.stringify(rec.error));

    const repo = new DrizzleDensityReadingRepository(db);
    const list = await new ListDensityReadings({ densityReadings: repo }).execute(
      { stationId: STATION, kind: 'DECANTATION' },
      ctx,
    );
    if (!list.success) throw new Error(JSON.stringify(list.error));
    expect(list.data.map((r) => r.density15)).toContain(751.2);

    const history = await new ListDensityReadings({ densityReadings: repo }).execute(
      { stationId: STATION, productId: PRODUCT_MS },
      ctx,
    );
    if (!history.success) throw new Error(JSON.stringify(history.error));
    expect(history.data.some((r) => r.kind === 'DECANTATION' && r.density15 === 751.2)).toBe(true);

    // The decantation reading is the newest of today: latestToday follows recorded_at.
    const bd = history.data.find((r) => r.kind === 'DECANTATION')!.businessDate;
    const summary = await new GetDensityTodaySummary({ densityReadings: repo }).execute(
      { stationId: STATION, businessDate: bd },
      ctx,
    );
    if (!summary.success) throw new Error(JSON.stringify(summary.error));
    const newest = history.data
      .filter((r) => r.businessDate === bd)
      .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))[0]!;
    expect(summary.data.products[0]!.latestToday?.id).toBe(newest.id);
  });

  it('counts only active fuel products with an active tank, with no fallback', async () => {
    const repo = new DrizzleDensityReadingRepository(db);
    expect(await repo.listFuelProductsWithActiveTanks(ORG, STATION)).toHaveLength(1);
    await db.update(schema.tanks).set({ status: 'INACTIVE' });
    expect(await repo.listFuelProductsWithActiveTanks(ORG, STATION)).toEqual([]);
    await db.update(schema.tanks).set({ status: 'ACTIVE' });
  });
});
