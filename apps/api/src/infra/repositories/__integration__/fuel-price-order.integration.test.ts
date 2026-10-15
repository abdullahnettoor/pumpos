import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { schema, type DbClient } from '@pump/db';
import { listCurrentFuelPrices, listFuelPriceHistory } from '../fuel-price-queries.js';
import { DrizzleFuelPriceRepository } from '../setup-repositories.js';

/**
 * Fuel prices that share an effective time (#537 review): Pricing's current
 * price, its history and the list shift close prices sales from all resolve
 * the tie the same way, by recorded time and then id, whatever order the rows
 * were inserted in. A pricing fix: before, Postgres returned tied rows in any
 * order, so the price shown and the price sold at could differ.
 *
 * Runs only when TEST_DATABASE_URL is set (CI provides a service container).
 */

const CONNECTION = process.env.TEST_DATABASE_URL;
const TEST_SCHEMA = 'fuel_price_order_it';

const ORG = '00000000-0000-0000-0000-00000000f501';
const STATION = '00000000-0000-0000-0000-00000000f502';
const PETROL = '00000000-0000-0000-0000-00000000f503';
const DIESEL = '00000000-0000-0000-0000-00000000f504';
// Ids chosen so the later-recorded row has the SMALLER id: the order must come
// from created_at first, not from the id.
const P_OLD = '00000000-0000-0000-0000-00000000f5ff';
const P_EARLY = '00000000-0000-0000-0000-00000000f5fe';
const P_LATE = '00000000-0000-0000-0000-00000000f5a1';
// Diesel: same effective AND recorded time, so the id decides.
const D_LOW = '00000000-0000-0000-0000-00000000f5b1';
const D_HIGH = '00000000-0000-0000-0000-00000000f5b2';

const EFFECTIVE = new Date('2026-10-10T00:30:00Z');
const RECORDED = new Date('2026-10-09T12:00:00Z');

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

describe.skipIf(!CONNECTION)('fuel price order against real Postgres', () => {
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

    await db.insert(schema.organizations).values({ id: ORG, name: 'Tenant A' });
    await db
      .insert(schema.stations)
      .values({ id: STATION, organizationId: ORG, name: 'Station A', code: 'STA' });
    await db.insert(schema.products).values([
      {
        id: PETROL,
        organizationId: ORG,
        name: 'Petrol',
        code: 'MS',
        productType: 'FUEL',
        unit: 'L',
      },
      {
        id: DIESEL,
        organizationId: ORG,
        name: 'Diesel',
        code: 'HSD',
        productType: 'FUEL',
        unit: 'L',
      },
    ]);
    const price = (
      id: string,
      productId: string,
      value: string,
      createdAt: Date,
      at = EFFECTIVE,
    ) => ({
      id,
      organizationId: ORG,
      stationId: STATION,
      productId,
      price: value,
      effectiveFrom: at,
      createdAt,
    });
    // Inserted earliest-first: without the tie-breakers Postgres hands tied
    // rows back in insertion order, which picks the wrong winner.
    await db
      .insert(schema.fuelPrices)
      .values([
        price(P_EARLY, PETROL, '100.00', RECORDED),
        price(P_LATE, PETROL, '104.00', new Date(RECORDED.getTime() + 60_000)),
        price(P_OLD, PETROL, '98.00', RECORDED, new Date('2026-09-01T00:00:00Z')),
        price(D_LOW, DIESEL, '90.00', RECORDED),
        price(D_HIGH, DIESEL, '91.00', RECORDED),
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

  it('the current price is the tied price recorded last, then the higher id', async () => {
    const current = await listCurrentFuelPrices(db, ORG, STATION);
    const byId = Object.fromEntries(current.map((p) => [p.productId, p.price]));
    expect(byId).toEqual({ [PETROL]: 104, [DIESEL]: 91 });
  });

  it('the history lists tied prices in that same order', async () => {
    const history = await listFuelPriceHistory(db, ORG, STATION);
    expect(history.filter((h) => h.productId === PETROL).map((h) => h.id)).toEqual([
      P_LATE,
      P_EARLY,
      P_OLD,
    ]);
    expect(history.filter((h) => h.productId === DIESEL).map((h) => h.id)).toEqual([D_HIGH, D_LOW]);
  });

  it('shift close reads the same order (listByStation)', async () => {
    const list = await new DrizzleFuelPriceRepository(db).listByStation(ORG, STATION);
    expect(list.map((p) => p.id)).toEqual([P_LATE, P_EARLY, D_HIGH, D_LOW, P_OLD]);
  });
});
