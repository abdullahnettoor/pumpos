import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { schema, type DbClient } from '@pump/db';
import { composeDssr, ListBusinessDays } from '@pump/core';
import type { DssrSourceData, ExecutionContext } from '@pump/core';
import { DrizzleBusinessDayListReader } from '../reporting-repositories.js';

/**
 * The Business Day list reader against a real Postgres (#394).
 *
 * The list reads SEALED figures out of `dssr_snapshots.snapshot_data` with
 * `->` / `->>` and rolls every other day up from shift summaries + sales in SQL.
 * Two things can only be proven against the real planner and the real
 * `composeDssr` output:
 *  - the JSON paths the SQL reads are the ones the composer writes, and
 *  - a sealed day and the same day rolled up (Draft) report the same figures.
 *
 * Runs only when TEST_DATABASE_URL is set (CI provides a service container).
 */

const CONNECTION = process.env.TEST_DATABASE_URL;
const TEST_SCHEMA = 'business_day_list_it';

const ORG = '00000000-0000-0000-0000-00000000b101';
const OTHER_ORG = '00000000-0000-0000-0000-00000000b111';
const STATION = '00000000-0000-0000-0000-00000000b102';
const OTHER_STATION = '00000000-0000-0000-0000-00000000b112';
const USER = '00000000-0000-0000-0000-00000000b103';
const TEMPLATE = '00000000-0000-0000-0000-00000000b104';
const CURRENT = '2026-10-09';

const ctx = { organizationId: ORG, stationId: STATION } as ExecutionContext;

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

/** A Shift Summary snapshot with the fields the DSSR composer and the list read. */
const shiftSnapshot = (over: Record<string, unknown> = {}) => ({
  totalVolume: 1010,
  totalTesting: 10,
  totalNetVolume: 1000,
  totalFuelSalesValue: 100000,
  cashVariance: -40,
  readings: [],
  ...over,
});

let uuidSeq = 0;
const uuid = () => `00000000-0000-0000-0000-${String(++uuidSeq + 100000).padStart(12, '0')}`;

describe.skipIf(!CONNECTION)('Business Day list reader against real Postgres', () => {
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

  /** One day with `summaries` closed shifts and a list of product sale totals. */
  async function seedDay(
    organizationId: string,
    stationId: string,
    businessDate: string,
    status: 'OPEN' | 'CLOSED',
    summaries: Record<string, unknown>[],
    saleTotals: number[],
    snapshot: boolean,
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
    const shiftIds: string[] = [];
    for (const snap of summaries) {
      const shiftId = uuid();
      shiftIds.push(shiftId);
      await db.insert(schema.shifts).values({
        id: shiftId,
        organizationId,
        stationId,
        businessDayId,
        shiftTemplateId: TEMPLATE,
        status: 'CLOSED',
        openedBy: USER,
      });
      await db.insert(schema.shiftSummaries).values({ shiftId, snapshotData: snap });
    }
    // An open (not yet summarised) shift must not count. A station has at most
    // one open Shift, so only the Live day carries it.
    if (status === 'OPEN' && businessDate === CURRENT && organizationId === ORG) {
      await db.insert(schema.shifts).values({
        id: uuid(),
        organizationId,
        stationId,
        businessDayId,
        shiftTemplateId: TEMPLATE,
        status: 'OPEN',
        openedBy: USER,
      });
    }
    let n = 0;
    for (const total of saleTotals) {
      await db.insert(schema.sales).values({
        id: uuid(),
        documentNumber: `S-${businessDate}-${++n}`,
        shiftId: shiftIds[0] ?? uuid(),
        businessDayId,
        saleType: 'Product',
        subtotalAmount: String(total),
        taxAmount: '0',
        totalAmount: String(total),
      });
    }
    if (snapshot) {
      const source: DssrSourceData = {
        shiftSummaries: summaries.map((s, i) => ({ shiftId: shiftIds[i]!, snapshot: s })),
        purchases: [],
        sales: saleTotals.map((totalAmount) => ({
          paymentMethod: 'Cash',
          saleType: 'Product',
          totalAmount,
        })),
        creditSales: [],
        stockVariances: [],
        saleItems: [],
        products: {},
        nozzles: {},
      };
      await db.insert(schema.dssrSnapshots).values({
        organizationId,
        stationId,
        businessDate,
        snapshotData: { businessDate, ...composeDssr(source) },
      });
    }
  }

  async function seed() {
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
    await db.insert(schema.shiftTemplates).values({
      id: TEMPLATE,
      organizationId: ORG,
      name: 'Morning',
      startTime: '06:00',
      endTime: '14:00',
    });

    const two = [shiftSnapshot(), shiftSnapshot({ totalFuelSalesValue: 50000, totalNetVolume: 480 })];
    // Same figures sealed (06) and unsealed-but-closed-shifts (the Draft rollup, 07).
    await seedDay(ORG, STATION, '2026-10-06', 'CLOSED', two, [1200, 300], true);
    await seedDay(ORG, STATION, '2026-10-07', 'OPEN', two, [1200, 300], false);
    // Live today: one closed shift so far.
    await seedDay(ORG, STATION, CURRENT, 'OPEN', [shiftSnapshot({ cashVariance: 0 })], [], false);
    // A CLOSED day whose snapshot is missing falls back to the rollup instead of zeros.
    await seedDay(ORG, STATION, '2026-10-03', 'CLOSED', [shiftSnapshot()], [], false);
    // Previous month (older page) and a pre-testing snapshot without totalNetVolume.
    await seedDay(
      ORG,
      STATION,
      '2026-09-30',
      'OPEN',
      [{ totalVolume: 510, totalTesting: 10, totalFuelSalesValue: 40000, cashVariance: 5 }],
      [],
      false,
    );
    await seedDay(ORG, STATION, '2026-08-20', 'CLOSED', [shiftSnapshot()], [], true);
    // Another tenant's station with the same dates: must never leak in.
    await seedDay(OTHER_ORG, OTHER_STATION, '2026-10-06', 'OPEN', [shiftSnapshot()], [999], false);
  }

  const list = async (month?: string) => {
    const result = await new ListBusinessDays(new DrizzleBusinessDayListReader(db)).execute(
      { stationId: STATION, currentBusinessDate: CURRENT, month },
      ctx,
    );
    if (!result.success) throw new Error(result.error.message);
    return result.data;
  };

  it('lists the month newest first with status and per-day figures', async () => {
    const page = await list();
    expect(page.month).toBe('2026-10');
    expect(page.days.map((d) => [d.businessDate, d.status])).toEqual([
      ['2026-10-09', 'LIVE'],
      ['2026-10-07', 'DRAFT'],
      ['2026-10-06', 'SEALED'],
      ['2026-10-03', 'SEALED'],
    ]);
  });

  it('reports a sealed day and the same day rolled up (Draft) with identical figures', async () => {
    const page = await list();
    const sealed = page.days.find((d) => d.businessDate === '2026-10-06')!;
    const draft = page.days.find((d) => d.businessDate === '2026-10-07')!;
    expect(sealed).toMatchObject({
      fuelSales: 150000,
      productSales: 1500,
      totalSales: 151500,
      volume: 1480,
      cashVariance: -80,
      shiftCount: 2,
    });
    const { businessDate: _a, status: _b, ...sealedFigures } = sealed;
    const { businessDate: _c, status: _d, ...draftFigures } = draft;
    expect(draftFigures).toEqual(sealedFigures);
  });

  it('counts only closed shifts for a Live day', async () => {
    const live = (await list()).days.find((d) => d.status === 'LIVE')!;
    expect(live).toMatchObject({ shiftCount: 1, fuelSales: 100000, cashVariance: 0 });
  });

  it('rolls up a closed day with no snapshot rather than reporting zeros', async () => {
    const day = (await list()).days.find((d) => d.businessDate === '2026-10-03')!;
    expect(day).toMatchObject({ status: 'SEALED', fuelSales: 100000, shiftCount: 1 });
  });

  it('computes the week tiles across the month boundary and counts Past Open Days', async () => {
    const { week } = await list();
    // Window 10-03..10-09: 10-03 (100000) + 10-06 (151500) + 10-07 (151500) + live (100000).
    expect(week.total).toBe(503000);
    // Previous window 09-26..10-02: 09-30 (40000, volume derived without totalNetVolume).
    expect(week.previousTotal).toBe(40000);
    // 09-30 and 10-07 are OPEN and before the Current Business Date.
    expect(week.openPastDays).toBe(2);
  });

  it('derives volume from gross minus testing for a snapshot without net volume', async () => {
    const page = await list('2026-09');
    expect(page.days).toHaveLength(1);
    expect(page.days[0]).toMatchObject({
      businessDate: '2026-09-30',
      status: 'DRAFT',
      volume: 500,
      cashVariance: 5,
    });
  });

  it('points to the next older month that has days, skipping empty ones', async () => {
    expect((await list()).olderMonth).toBe('2026-09');
    expect((await list('2026-09')).olderMonth).toBe('2026-08');
    expect((await list('2026-08')).olderMonth).toBeNull();
    expect((await list('2026-07')).days).toEqual([]);
  });

  it('never returns another organization’s days, even for the same dates', async () => {
    const { week, days } = await list();
    expect(days.find((d) => d.businessDate === '2026-10-06')?.status).toBe('SEALED');
    expect(week.total).toBe(503000);
    const foreign = await new DrizzleBusinessDayListReader(db).load({
      organizationId: ORG,
      stationId: OTHER_STATION,
      monthFrom: '2026-10-01',
      monthTo: '2026-10-31',
      weekFrom: '2026-09-26',
      currentBusinessDate: CURRENT,
    });
    expect(foreign).toEqual({ days: [], openPastDays: 0, olderBusinessDate: null });
  });
});
