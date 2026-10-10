import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { schema, type DbClient } from '@pump/db';
import { FixedClock, GetTankDaysOfCover, SequentialIdGenerator } from '@pump/core';
import type { ExecutionContext } from '@pump/core';
import { DrizzleTankSalesWindowReader } from '../inventory-repositories.js';

/**
 * Tank days of cover (#403) against a real Postgres: the window SQL, not a fake.
 *
 * Proves what a unit test cannot: only the 7 NEWEST closed Business Days count
 * (older ones and open ones do not), sold volume is per tank (two tanks of one
 * product are told apart), purchases / opening stock / merchandise (no tank)
 * never count as sold, and another organization's or station's movements never
 * leak in.
 *
 * Runs only when TEST_DATABASE_URL is set (CI provides a service container).
 */

const CONNECTION = process.env.TEST_DATABASE_URL;
const TEST_SCHEMA = 'tank_cover_it';

const id = (n: number) => `00000000-0000-0000-0000-00000000c${String(n).padStart(3, '0')}`;
const ORG = id(1);
const OTHER_ORG = id(2);
const STATION = id(3);
const NEW_STATION = id(4); // only 3 closed days
const EMPTY_STATION = id(5); // no closed day
const OTHER_STATION = id(6); // other org
const USER = id(7);
const PRODUCT = id(8); // petrol, shared by T1 and T2
const MERCH = id(9);
const OTHER_PRODUCT = id(10);
const T1 = id(11);
const T2 = id(12);
const T3 = id(13); // never sells
const T_NEW = id(14);
const T_EMPTY = id(15);
const T_OTHER = id(16);

const ctx = (organizationId: string, stationId: string): ExecutionContext => ({
  organizationId,
  stationId,
  businessDayId: null,
  actorId: USER,
  correlationId: null,
  timeZone: 'Asia/Kolkata',
  businessDayStartsAt: '06:00',
  clock: new FixedClock(new Date('2026-10-09T09:00:00+05:30')),
  ids: new SequentialIdGenerator(),
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

let seq = 0;
const uuid = () => `00000000-0000-0000-0001-${String(++seq + 100000).padStart(12, '0')}`;

describe.skipIf(!CONNECTION)('Tank days of cover window against real Postgres', () => {
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
    await seed();
  }, 60_000);

  afterAll(async () => {
    if (sql) {
      await sql.unsafe('select pg_advisory_lock(872634)');
      await sql.unsafe(`drop schema if exists ${TEST_SCHEMA} cascade`);
      await sql.unsafe('select pg_advisory_unlock(872634)');
      await sql.end();
    }
  });

  async function day(
    organizationId: string,
    stationId: string,
    businessDate: string,
    status: 'OPEN' | 'CLOSED' = 'CLOSED',
  ) {
    const businessDayId = uuid();
    await db.insert(schema.businessDays).values({
      id: businessDayId,
      organizationId,
      stationId,
      businessDate,
      status,
      openedBy: USER,
    });
    return businessDayId;
  }

  async function move(
    businessDayId: string,
    tankId: string | null,
    productId: string,
    movementType: string,
    quantity: number,
  ) {
    await db.insert(schema.stockMovements).values({
      businessDayId,
      productId,
      tankId,
      movementType,
      quantity: String(quantity),
    });
  }

  async function seed() {
    for (const [oid, name] of [
      [ORG, 'Tenant A'],
      [OTHER_ORG, 'Tenant B'],
    ] as const)
      await db.insert(schema.organizations).values({ id: oid, name });
    for (const [sid, oid, code] of [
      [STATION, ORG, 'STA'],
      [NEW_STATION, ORG, 'STN'],
      [EMPTY_STATION, ORG, 'STE'],
      [OTHER_STATION, OTHER_ORG, 'STB'],
    ] as const)
      await db
        .insert(schema.stations)
        .values({ id: sid, organizationId: oid, name: `Station ${code}`, code });
    await db
      .insert(schema.users)
      .values({ id: USER, organizationId: ORG, fullName: 'Asha', role: 'Owner' });
    for (const [pid, oid, code, type] of [
      [PRODUCT, ORG, 'MS', 'FUEL'],
      [MERCH, ORG, 'OIL', 'LUBRICANT'],
      [OTHER_PRODUCT, OTHER_ORG, 'MS', 'FUEL'],
    ] as const)
      await db.insert(schema.products).values({
        id: pid,
        organizationId: oid,
        name: code,
        code,
        productType: type,
        unit: 'L',
      });
    for (const [tid, oid, sid, name, pid] of [
      [T1, ORG, STATION, 'Tank 1', PRODUCT],
      [T2, ORG, STATION, 'Tank 2', PRODUCT],
      [T3, ORG, STATION, 'Tank 3', PRODUCT],
      [T_NEW, ORG, NEW_STATION, 'Tank N', PRODUCT],
      [T_EMPTY, ORG, EMPTY_STATION, 'Tank E', PRODUCT],
      [T_OTHER, OTHER_ORG, OTHER_STATION, 'Tank O', OTHER_PRODUCT],
    ] as const)
      await db
        .insert(schema.tanks)
        .values({
          id: tid,
          organizationId: oid,
          stationId: sid,
          name,
          productId: pid,
          capacity: '20000',
        });

    // STATION: 9 closed days (10-01..10-09), the 7 newest are 10-03..10-09.
    // The two oldest sold a huge amount that must NOT count; T1 sells 100 L a day.
    for (let d = 1; d <= 9; d++) {
      const bd = await day(ORG, STATION, `2026-10-0${d}`);
      await move(bd, T1, PRODUCT, 'Sale', d <= 2 ? -10000 : -100);
      // T2 (same product) sells 70 L on three of the window's days only.
      if (d === 3 || d === 5 || d === 9) await move(bd, T2, PRODUCT, 'Sale', -70);
      // Merchandise sale: no tank, never counted.
      await move(bd, null, MERCH, 'Sale', -3);
    }
    // Stock that arrives or is counted is not "sold".
    const bd5 = await day(ORG, STATION, '2026-10-10', 'OPEN');
    await move(bd5, T1, PRODUCT, 'Sale', -5000); // open day: excluded
    const bdPurchase = await day(ORG, STATION, '2026-09-20');
    await move(bdPurchase, T1, PRODUCT, 'Purchase', 12000);
    await move(bdPurchase, T1, PRODUCT, 'OpeningBalance', 4000);
    await move(bdPurchase, T1, PRODUCT, 'Variance', -50);
    await move(bdPurchase, T1, PRODUCT, 'Adjustment', -25);

    // NEW_STATION: only 3 closed days -> averaged over 3.
    for (let d = 1; d <= 3; d++) {
      const bd = await day(ORG, NEW_STATION, `2026-10-0${d}`);
      await move(bd, T_NEW, PRODUCT, 'Sale', -300);
    }
    // EMPTY_STATION: an open day with sales but no closed day at all.
    await move(await day(ORG, EMPTY_STATION, '2026-10-09', 'OPEN'), T_EMPTY, PRODUCT, 'Sale', -999);

    // Another tenant, same dates, big sales: must never appear anywhere.
    for (let d = 1; d <= 9; d++) {
      const bd = await day(OTHER_ORG, OTHER_STATION, `2026-10-0${d}`);
      await move(bd, T_OTHER, OTHER_PRODUCT, 'Sale', -50000);
    }
  }

  const reader = () => new DrizzleTankSalesWindowReader(db);

  it('reads the 7 newest closed Business Days, per tank, sales only', async () => {
    const w = await reader().read({ organizationId: ORG, stationId: STATION, days: 7 });
    expect(w.closedDays).toBe(7);
    const byTank = Object.fromEntries(w.sold.map((s) => [s.tankId, s.volume]));
    // 10-03..10-09 = 7 days x 100 L (the 10000 L days and the open day are outside).
    expect(byTank[T1]).toBe(700);
    // Same product, other tank: its own 3 x 70 L.
    expect(byTank[T2]).toBe(210);
    // Never sold, merchandise (no tank), purchases/counts: absent.
    expect(byTank[T3]).toBeUndefined();
    expect(w.sold).toHaveLength(2);
  });

  it('averages a young station over the closed days it has', async () => {
    const w = await reader().read({ organizationId: ORG, stationId: NEW_STATION, days: 7 });
    expect(w).toEqual({ closedDays: 3, sold: [{ tankId: T_NEW, volume: 900 }] });
  });

  it('finds no window for a station with no closed day', async () => {
    const w = await reader().read({ organizationId: ORG, stationId: EMPTY_STATION, days: 7 });
    expect(w).toEqual({ closedDays: 0, sold: [] });
  });

  it('never reads another organization or station', async () => {
    expect(await reader().read({ organizationId: OTHER_ORG, stationId: STATION, days: 7 })).toEqual(
      { closedDays: 0, sold: [] },
    );
    expect(await reader().read({ organizationId: ORG, stationId: OTHER_STATION, days: 7 })).toEqual(
      { closedDays: 0, sold: [] },
    );
    const other = await reader().read({
      organizationId: OTHER_ORG,
      stationId: OTHER_STATION,
      days: 7,
    });
    expect(other.sold).toEqual([{ tankId: T_OTHER, volume: 350000 }]);
  });

  it('turns the window into days of cover through the use case', async () => {
    const res = await new GetTankDaysOfCover({ reader: reader() }).execute(
      {
        stationId: STATION,
        tanks: [
          { tankId: T1, currentVolume: 260 },
          { tankId: T2, currentVolume: 600 },
          { tankId: T3, currentVolume: 800 },
        ],
      },
      ctx(ORG, STATION),
    );
    expect(res.success && res.data).toEqual({
      [T1]: { avgDailyVolume7d: 100, daysOfCover: 2.6 },
      [T2]: { avgDailyVolume7d: 30, daysOfCover: 20 },
      [T3]: { avgDailyVolume7d: 0, daysOfCover: null },
    });
  });
});
