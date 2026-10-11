import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { schema, type DbClient } from '@pump/db';
import { DrizzleInsightsSalesReader } from '../insights-repositories.js';

/**
 * The Insights sales reader against a real Postgres.
 *
 * The use case and the composition are tested with fakes; what a fake cannot
 * prove is what this statement promises the database: which days it picks as the
 * window (the newest CLOSED day that has its DSSR snapshot, never an open one),
 * that it sums the right JSON fields, that the range bounds are inclusive and
 * the previous period is the equal span before, that it reaches Shift Summaries
 * through closed Business Days only, and that another Station's or another
 * Organization's rows never surface.
 *
 * Runs only when TEST_DATABASE_URL is set (CI provides a service container).
 * Everything lives in a dedicated schema that is dropped afterwards.
 */

const CONNECTION = process.env.TEST_DATABASE_URL;
const TEST_SCHEMA = 'insights_sales_it';

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const ORG = id(1);
const OTHER_ORG = id(2);
const STATION = id(10); // the station under test
const SIBLING = id(11); // same org, a more recent closed day than STATION's
const OTHER_TENANT_STATION = id(12);
const EMPTY_STATION = id(13); // same org, no history at all
const USER = id(20);
const OTHER_USER = id(21);
const MORNING = id(30);
const EVENING = id(31);
const OTHER_TEMPLATE = id(32);

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

let seq = 100;
const nextId = () => id(seq++);

/** A DSSR snapshot payload carrying only the fields Insights reads. */
function dssr(o: {
  fuelSales: number;
  merchSales?: number;
  volume: number;
  fuel?: Array<Record<string, unknown>>;
  pnl?: Array<Record<string, unknown>>;
}) {
  return {
    fuel: { totalSalesValue: o.fuelSales, totalNetVolume: o.volume, byProduct: o.fuel ?? [] },
    merchandise: { salesValue: o.merchSales ?? 0 },
    pnl: { byProduct: o.pnl ?? [] },
  };
}

describe.skipIf(!CONNECTION)('Insights sales reader against real Postgres', () => {
  let sql: postgres.Sql;
  let db: DbClient;
  let reader: DrizzleInsightsSalesReader;

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
    reader = new DrizzleInsightsSalesReader(db);
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
    org: string,
    station: string,
    openedBy: string,
    date: string,
    status: 'OPEN' | 'CLOSED',
    snapshot?: ReturnType<typeof dssr>,
  ) {
    const dayId = nextId();
    await db.insert(schema.businessDays).values({
      id: dayId,
      organizationId: org,
      stationId: station,
      businessDate: date,
      status,
      openedBy,
    });
    if (snapshot) {
      await db.insert(schema.dssrSnapshots).values({
        organizationId: org,
        stationId: station,
        businessDate: date,
        snapshotData: snapshot,
      });
    }
    return dayId;
  }

  async function shift(
    org: string,
    station: string,
    openedBy: string,
    dayId: string,
    template: string,
    summary?: { sales: number; volume: number; cashVariance: number },
  ) {
    const shiftId = nextId();
    await db.insert(schema.shifts).values({
      id: shiftId,
      organizationId: org,
      stationId: station,
      businessDayId: dayId,
      shiftTemplateId: template,
      status: summary ? 'CLOSED' : 'OPEN',
      openedBy,
    });
    if (summary) {
      await db.insert(schema.shiftSummaries).values({
        shiftId,
        snapshotData: {
          totalFuelSalesValue: summary.sales,
          totalNetVolume: summary.volume,
          cashVariance: summary.cashVariance,
        },
      });
    }
  }

  /**
   * STATION, with the 7-day window 2026-03-04..03-10 and the previous one
   * 02-25..03-03:
   *   03-11 OPEN, with a snapshot  -> must not move the window
   *   03-10 closed                 -> in
   *   03-09 closed, NO snapshot    -> not a sealed day
   *   03-08 closed                 -> in
   *   03-02 closed                 -> previous period
   *   02-20 closed                 -> outside both 7-day windows (inside the 30-day one)
   * Plus a sibling station and another tenant with newer days that must not leak.
   */
  async function seed() {
    await db.insert(schema.organizations).values([
      { id: ORG, name: 'Tenant A' },
      { id: OTHER_ORG, name: 'Tenant B' },
    ]);
    await db.insert(schema.stations).values([
      { id: STATION, organizationId: ORG, name: 'Station A', code: 'STA' },
      { id: SIBLING, organizationId: ORG, name: 'Sibling', code: 'STS' },
      { id: EMPTY_STATION, organizationId: ORG, name: 'Empty', code: 'STE' },
      { id: OTHER_TENANT_STATION, organizationId: OTHER_ORG, name: 'Station B', code: 'STB' },
    ]);
    await db.insert(schema.users).values([
      { id: USER, organizationId: ORG, fullName: 'Owner', role: 'Owner' },
      { id: OTHER_USER, organizationId: OTHER_ORG, fullName: 'Other', role: 'Owner' },
    ]);
    await db.insert(schema.shiftTemplates).values([
      { id: MORNING, organizationId: ORG, name: 'Morning', startTime: '06:00', endTime: '14:00' },
      { id: EVENING, organizationId: ORG, name: 'Evening', startTime: '14:00', endTime: '22:00' },
      {
        id: OTHER_TEMPLATE,
        organizationId: OTHER_ORG,
        name: 'Other Morning',
        startTime: '06:00',
        endTime: '14:00',
      },
    ]);

    await day(ORG, STATION, USER, '2026-03-11', 'OPEN', dssr({ fuelSales: 777777, volume: 7777 }));
    const d10 = await day(
      ORG,
      STATION,
      USER,
      '2026-03-10',
      'CLOSED',
      dssr({
        fuelSales: 100000,
        merchSales: 5000,
        volume: 1000,
        fuel: [
          { productCode: 'MS', unit: 'L', netVolume: 600 },
          { productCode: 'HSD', unit: 'L', netVolume: 400 },
          { productCode: 'CNG', unit: 'kg', netVolume: 50 },
        ],
        pnl: [
          { productId: 'p-oil', name: 'Oil 1L', kind: 'merchandise', quantity: 30, revenue: 1500 },
          {
            productId: 'p-cool',
            name: 'Coolant 5L',
            kind: 'merchandise',
            quantity: 5,
            revenue: 3500,
          },
          { productId: 'f-ms', name: 'Petrol', kind: 'fuel', quantity: 600, revenue: 99999 },
        ],
      }),
    );
    await day(ORG, STATION, USER, '2026-03-09', 'CLOSED'); // closed, never sealed
    const d08 = await day(
      ORG,
      STATION,
      USER,
      '2026-03-08',
      'CLOSED',
      dssr({
        fuelSales: 50000,
        merchSales: 1000,
        volume: 500,
        fuel: [{ productCode: 'MS', unit: 'L', netVolume: 300 }],
        pnl: [
          { productId: 'p-oil', name: 'Oil 1L', kind: 'merchandise', quantity: 10, revenue: 500 },
        ],
      }),
    );
    const d02 = await day(
      ORG,
      STATION,
      USER,
      '2026-03-02',
      'CLOSED',
      dssr({ fuelSales: 70000, merchSales: 2000, volume: 700 }),
    );
    await day(
      ORG,
      STATION,
      USER,
      '2026-02-20',
      'CLOSED',
      dssr({
        fuelSales: 30000,
        merchSales: 400,
        volume: 300,
        fuel: [{ productCode: 'MS', unit: 'L', netVolume: 300 }],
      }),
    );

    // Shift Summaries: two templates in range, one outside, one open shift.
    await shift(ORG, STATION, USER, d10, MORNING, {
      sales: 60000,
      volume: 600,
      cashVariance: -100,
    });
    await shift(ORG, STATION, USER, d10, EVENING, { sales: 40000, volume: 400, cashVariance: 20 });
    await shift(ORG, STATION, USER, d08, MORNING, { sales: 50000, volume: 500, cashVariance: -50 });
    await shift(ORG, STATION, USER, d02, MORNING, { sales: 9999, volume: 99, cashVariance: 999 });
    await shift(ORG, STATION, USER, d08, EVENING); // OPEN shift, no summary: not counted

    // Another station of the same org, with a NEWER closed day.
    const sib = await day(
      ORG,
      SIBLING,
      USER,
      '2026-03-12',
      'CLOSED',
      dssr({ fuelSales: 123456, merchSales: 1, volume: 1234 }),
    );
    await shift(ORG, SIBLING, USER, sib, MORNING, { sales: 5, volume: 5, cashVariance: 5 });

    // Another tenant, same dates and a newer day.
    const other = await day(
      OTHER_ORG,
      OTHER_TENANT_STATION,
      OTHER_USER,
      '2026-03-12',
      'CLOSED',
      dssr({ fuelSales: 888888, merchSales: 8, volume: 8888 }),
    );
    await shift(OTHER_ORG, OTHER_TENANT_STATION, OTHER_USER, other, OTHER_TEMPLATE, {
      sales: 8,
      volume: 8,
      cashVariance: 8,
    });
  }

  const read = (stationId: string, days: 7 | 30 | 90 = 7, organizationId = ORG) =>
    reader.read({ organizationId, stationId, days });

  it('windows on the newest CLOSED sealed day, not an open one or one without a snapshot', async () => {
    const r = await read(STATION);
    expect(r.range).toEqual({ from: '2026-03-04', to: '2026-03-10' });
    expect(r.previousRange).toEqual({ from: '2026-02-25', to: '2026-03-03' });
  });

  it('lists the sealed closed days of the range with their sales and net litres', async () => {
    const r = await read(STATION);
    // 03-09 (closed, no snapshot) and 03-11 (open) are absent; sales = fuel + products.
    expect(r.days).toEqual([
      { date: '2026-03-08', sales: 51000, volume: 500 },
      { date: '2026-03-10', sales: 105000, volume: 1000 },
    ]);
  });

  it('totals the previous period over its closed days only', async () => {
    const r = await read(STATION);
    expect(r.previous).toEqual({ sales: 72000, closedDays: 1, otherSales: 2000 });
  });

  it('includes both ends of the range and excludes the day just outside it', async () => {
    // days=7 ends 03-10 and starts 03-04: 03-02 is previous, not current.
    expect((await read(STATION)).days.map((d) => d.date)).not.toContain('2026-03-02');
    // days=30 reaches back to 02-09: 02-20 and 03-02 are now current, and the previous period is empty.
    const wide = await read(STATION, 30);
    expect(wide.range).toEqual({ from: '2026-02-09', to: '2026-03-10' });
    expect(wide.days.map((d) => d.date)).toEqual([
      '2026-02-20',
      '2026-03-02',
      '2026-03-08',
      '2026-03-10',
    ]);
    expect(wide.previous.closedDays).toBe(0);
  });

  it('sums litres per grade and keeps non-litre fuel with its own unit', async () => {
    const r = await read(STATION);
    const sorted = [...r.fuelVolumes].sort((a, b) => a.productCode.localeCompare(b.productCode));
    expect(sorted).toEqual([
      { productCode: 'CNG', unit: 'kg', quantity: 50 },
      { productCode: 'HSD', unit: 'L', quantity: 400 },
      { productCode: 'MS', unit: 'L', quantity: 900 },
    ]);
  });

  it('picks the top product by revenue, not by quantity', async () => {
    const r = await read(STATION);
    expect(r.other.total).toBe(6000);
    // Oil sold 40 units for 2,000; Coolant 5 units for 3,500.
    expect(r.other.top).toEqual({ name: 'Coolant 5L', quantity: 5, revenue: 3500 });
  });

  it('sums each Shift Template over closed Shifts of the range, in template order', async () => {
    const r = await read(STATION);
    expect(r.templates).toEqual([
      {
        templateId: MORNING,
        name: 'Morning',
        shifts: 2,
        totalSales: 110000,
        totalVolume: 1100,
        totalCashVariance: -150,
      },
      {
        templateId: EVENING,
        name: 'Evening',
        shifts: 1,
        totalSales: 40000,
        totalVolume: 400,
        totalCashVariance: 20,
      },
    ]);
  });

  it('never mixes in another station of the same organization', async () => {
    const sibling = await read(SIBLING);
    expect(sibling.range?.to).toBe('2026-03-12');
    expect(sibling.days).toEqual([{ date: '2026-03-12', sales: 123457, volume: 1234 }]);
    expect(sibling.templates.map((t) => t.totalSales)).toEqual([5]);
    // ...and STATION's window is unmoved by the sibling's newer day.
    expect((await read(STATION)).range?.to).toBe('2026-03-10');
  });

  it('never reads another tenant, and refuses a station the organization does not own', async () => {
    // Tenant B's own read sees only its rows.
    const own = await read(OTHER_TENANT_STATION, 7, OTHER_ORG);
    expect(own.days).toEqual([{ date: '2026-03-12', sales: 888896, volume: 8888 }]);
    expect(own.templates.map((t) => t.name)).toEqual(['Other Morning']);
    // Tenant A asking for Tenant B's station gets an empty window, not their data.
    const crossed = await read(OTHER_TENANT_STATION, 7, ORG);
    expect(crossed.range).toBeNull();
    expect(crossed.days).toEqual([]);
    expect(crossed.templates).toEqual([]);
    // And the reverse.
    const reverse = await read(STATION, 7, OTHER_ORG);
    expect(reverse.range).toBeNull();
    expect(reverse.days).toEqual([]);
  });

  it('is empty, not an error, for a station with no closed history', async () => {
    const r = await read(EMPTY_STATION);
    expect(r).toEqual({
      range: null,
      previousRange: null,
      days: [],
      previous: { sales: 0, closedDays: 0, otherSales: 0 },
      fuelVolumes: [],
      other: { total: 0, top: null },
      templates: [],
    });
  });
});
