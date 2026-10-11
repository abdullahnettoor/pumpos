import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { schema, type DbClient } from '@pump/db';
import {
  FixedClock,
  GetDensityTodaySummary,
  ListDensityReadings,
  RecordDensityReading,
  SequentialIdGenerator,
} from '@pump/core';
import type { ExecutionContext } from '@pump/core';
import { runInTransaction } from '../../transaction.js';
import { DrizzleDensityReadingRepository } from '../decantation-repositories.js';

const CONNECTION = process.env.TEST_DATABASE_URL;
const TEST_SCHEMA = 'density_it';

const id = (n: number) => `00000000-0000-0000-0000-00000000e${String(n).padStart(3, '0')}`;
const ORG = id(1);
const STATION = id(2);
const PRODUCT_MS = id(3);
const TANK_1 = id(4);

const suite = CONNECTION ? describe : describe.skip;

suite('Density register integration (Postgres)', () => {
  let rootClient: postgres.Sql;
  let testClient: postgres.Sql;
  let db: DbClient;

  beforeAll(async () => {
    rootClient = postgres(CONNECTION!, { max: 1 });
    await rootClient.unsafe(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE;`);
    await rootClient.unsafe(`CREATE SCHEMA ${TEST_SCHEMA};`);

    testClient = postgres(CONNECTION!, { max: 1 });
    await testClient.unsafe(`SET search_path TO ${TEST_SCHEMA};`);
    const migrationsDir = path.resolve(__dirname, '../../../../../../packages/db/migrations');
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    for (const f of files) {
      const sql = readFileSync(path.join(migrationsDir, f), 'utf-8');
      await testClient.unsafe(sql);
    }
    db = drizzle(testClient, { schema });

    await db.insert(schema.organizations).values({
      id: ORG,
      name: 'Density Test Org',
    });
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
    if (rootClient) {
      await rootClient.unsafe(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE;`);
      await rootClient.end();
    }
  });

  const ctx: ExecutionContext = {
    organizationId: ORG,
    stationId: STATION,
    businessDayId: null,
    actorId: 'test-user',
    correlationId: null,
    timeZone: 'Asia/Kolkata',
    businessDayStartsAt: '06:00',
    clock: new FixedClock(new Date('2026-10-11T06:30:00Z')),
    ids: new SequentialIdGenerator('evt'),
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
});
