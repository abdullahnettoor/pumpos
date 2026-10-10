import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { schema, type DbClient } from '@pump/db';
import { composeDssr } from '@pump/core';
import { DrizzleDssrDataReader } from '../reporting-repositories.js';

/**
 * The DSSR source reader's per-tank stock movement (#395) against a real
 * Postgres: opening = Σ movements of earlier Business Days, then the day's
 * Purchases, net Sale litres and other adjustments, with dip reconciliations
 * ('Variance') kept out so `closing` is the book the dip is compared against.
 * Runs only when TEST_DATABASE_URL is set.
 */
const CONNECTION = process.env.TEST_DATABASE_URL;
const TEST_SCHEMA = 'dssr_tank_movement_it';

const ORG = '00000000-0000-0000-0000-00000000c101';
const OTHER_ORG = '00000000-0000-0000-0000-00000000c111';
const STATION = '00000000-0000-0000-0000-00000000c102';
const OTHER_STATION = '00000000-0000-0000-0000-00000000c112';
const USER = '00000000-0000-0000-0000-00000000c103';
const PRODUCT = '00000000-0000-0000-0000-00000000c104';
const TANK = '00000000-0000-0000-0000-00000000c105';
const TANK_2 = '00000000-0000-0000-0000-00000000c106';
const DAY_1 = '00000000-0000-0000-0000-00000000c201';
const DAY_2 = '00000000-0000-0000-0000-00000000c202';
const DAY_3 = '00000000-0000-0000-0000-00000000c203';
const OTHER_DAY = '00000000-0000-0000-0000-00000000c211';

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

describe.skipIf(!CONNECTION)('DSSR tank stock movement against real Postgres', () => {
  let sql: postgres.Sql;
  let db: DbClient;

  const move = (businessDayId: string, tankId: string, movementType: string, quantity: number) =>
    db.insert(schema.stockMovements).values({
      businessDayId,
      productId: PRODUCT,
      tankId,
      movementType,
      quantity: String(quantity),
    });

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

    for (const [id, name] of [
      [ORG, 'Tenant A'],
      [OTHER_ORG, 'Tenant B'],
    ] as const)
      await db.insert(schema.organizations).values({ id, name });
    await db
      .insert(schema.stations)
      .values({ id: STATION, organizationId: ORG, name: 'Station A', code: 'STA' });
    await db
      .insert(schema.stations)
      .values({ id: OTHER_STATION, organizationId: OTHER_ORG, name: 'Station B', code: 'STB' });
    await db
      .insert(schema.users)
      .values({ id: USER, organizationId: ORG, fullName: 'Asha', role: 'Manager' });
    await db.insert(schema.products).values({
      id: PRODUCT,
      organizationId: ORG,
      name: 'Petrol',
      code: 'MS',
      productType: 'FUEL',
      inventoryType: 'BULK',
      unit: 'Litre',
    } as never);
    for (const [id, name] of [
      [TANK, 'Tank 1'],
      [TANK_2, 'Tank 2'],
    ] as const)
      await db.insert(schema.tanks).values({
        id,
        organizationId: ORG,
        stationId: STATION,
        name,
        productId: PRODUCT,
        capacity: '20000',
      });
    for (const [id, date, org, station] of [
      [DAY_1, '2026-10-06', ORG, STATION],
      [DAY_2, '2026-10-07', ORG, STATION],
      [DAY_3, '2026-10-08', ORG, STATION],
      [OTHER_DAY, '2026-10-06', OTHER_ORG, OTHER_STATION],
    ] as const)
      await db.insert(schema.businessDays).values({
        id,
        organizationId: org,
        stationId: station,
        businessDate: date,
        status: 'CLOSED',
        openedBy: USER,
      });

    // Day 1: opening balance 10000 and a purchase of 6000, 1500 sold, dip posts -50.
    await move(DAY_1, TANK, 'OpeningBalance', 10000);
    await move(DAY_1, TANK, 'Purchase', 6000);
    await move(DAY_1, TANK, 'Sale', -1500);
    await move(DAY_1, TANK, 'Variance', -50);
    // Day 2 (the day under test): 2210.5 sold across two movements, 300 delivered, +20 adjustment.
    await move(DAY_2, TANK, 'Sale', -1200.25);
    await move(DAY_2, TANK, 'Sale', -1010.25);
    await move(DAY_2, TANK, 'Purchase', 300);
    await move(DAY_2, TANK, 'Adjustment', 20);
    await move(DAY_2, TANK, 'Variance', -18);
    // Day 3 is later than the day under test: it must never count.
    await move(DAY_3, TANK, 'Sale', -999);
    // Another tank with nothing before the day.
    await move(DAY_2, TANK_2, 'Sale', -100);
    await db.insert(schema.stockVariances).values([
      {
        organizationId: ORG,
        stationId: STATION,
        businessDayId: DAY_2,
        productId: PRODUCT,
        tankId: TANK,
        expectedQuantity: '12308',
        actualQuantity: '12290',
        varianceQuantity: '-18',
      },
      {
        organizationId: ORG,
        stationId: STATION,
        businessDayId: DAY_2,
        productId: PRODUCT,
        tankId: TANK_2,
        expectedQuantity: '-100',
        actualQuantity: '-100',
        varianceQuantity: '0',
      },
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

  it("reads each dipped tank's opening, receipts, sales and adjustments for the day", async () => {
    const source = await new DrizzleDssrDataReader(db).readBusinessDay(DAY_2);
    const byTank = new Map(source.stockVariances.map((v) => [v.tankName, v.tankMovement]));
    expect(byTank.get('Tank 1')).toEqual({
      tankId: TANK,
      // 10000 + 6000 - 1500 - 50 (day 1 dip reconciliation counts in the book).
      openingQuantity: 14450,
      receivedQuantity: 300,
      soldQuantity: 2210.5,
      adjustedQuantity: 20,
    });
    expect(byTank.get('Tank 2')).toEqual({
      tankId: TANK_2,
      openingQuantity: 0,
      receivedQuantity: 0,
      soldQuantity: 100,
      adjustedQuantity: 0,
    });
  });

  it('composes a closing book that the dip variance reconciles against', async () => {
    const source = await new DrizzleDssrDataReader(db).readBusinessDay(DAY_2);
    const payload = composeDssr(source) as { fuelStockVariance: Record<string, any>[] };
    const row = payload.fuelStockVariance.find((r) => r.tankName === 'Tank 1')!;
    // 14450 + 300 - 2210.5 + 20 = 12559.5
    expect(row.tankMovement.closingQuantity).toBe(12559.5);
  });

  it('leaves a day with no dips without a movement read', async () => {
    const source = await new DrizzleDssrDataReader(db).readBusinessDay(DAY_3);
    expect(source.stockVariances).toEqual([]);
  });
});
