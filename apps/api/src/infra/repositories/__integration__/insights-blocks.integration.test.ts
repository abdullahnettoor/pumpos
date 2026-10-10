import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { schema, type DbClient } from '@pump/db';
import {
  DrizzleInsightsAttendantVarianceReader,
  DrizzleInsightsCreditHealthReader,
  DrizzleInsightsStockLossReader,
} from '../insights-blocks-repositories.js';

/**
 * The Insights part 2 readers (#402) against a real Postgres.
 *
 * What a fake cannot prove, and this does: the window is the same as the sales
 * block's (newest CLOSED sealed day, inclusive bounds, an open day never moves
 * it); the attendant level is read from two-level Shift Summaries only and
 * classified per Shift by the shared balanced rule; dips recorded while a Shift
 * was open do not count as loss; Credit Sales follow the Business Date and
 * Collections the Entry Date (a Collection dated on a day that never closed
 * still counts); and nothing from a sibling station or another tenant leaks.
 *
 * Runs only when TEST_DATABASE_URL is set (CI provides a service container).
 * Everything lives in a dedicated schema that is dropped afterwards.
 */

const CONNECTION = process.env.TEST_DATABASE_URL;
const TEST_SCHEMA = 'insights_blocks_it';

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const ORG = id(1);
const OTHER_ORG = id(2);
const STATION = id(10);
const SIBLING = id(11);
const OTHER_TENANT_STATION = id(12);
const EMPTY_STATION = id(13);
const USER = id(20);
const OTHER_USER = id(21);
const ATT1 = id(22); // Ravi
const ATT2 = id(23); // Meena
const ATT_GHOST = id(24); // only in the snapshot, no user row
const MORNING = id(30);
const EVENING = id(31);
const OTHER_TEMPLATE = id(32);
const P_MS = id(40);
const P_HSD = id(41);
const OTHER_PRODUCT = id(42);
const DU = id(50);
const SIB_DU = id(51);
const T_MS = id(60);
const T_HSD = id(61);
const T_IDLE = id(62);
const T_SIB = id(63);
const T_OTHER = id(64);
const N_MS = id(70);
const N_HSD = id(71);
const N_IDLE = id(72);
const N_SIB = id(73);
const CUSTOMER = id(80);
const OTHER_CUSTOMER = id(81);
const ACCOUNT = id(82);
const OTHER_ACCOUNT = id(83);

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

const drawer = (attendantId: string, variance: number | null, attendantName = 'snapshot name') => ({
  attendantId,
  attendantName,
  duId: DU,
  variance,
});

/** A DSSR snapshot payload carrying only the fields these blocks read. */
function dssr(o: {
  fuelSales: number;
  merchSales?: number;
  credit?: number;
  nozzles?: Array<Record<string, unknown>>;
}) {
  return {
    fuel: { totalSalesValue: o.fuelSales, byProduct: [], nozzles: o.nozzles ?? [] },
    merchandise: { salesValue: o.merchSales ?? 0 },
    credit: { total: o.credit ?? 0 },
  };
}

describe.skipIf(!CONNECTION)('Insights part 2 readers against real Postgres', () => {
  let sql: postgres.Sql;
  let db: DbClient;
  let attendants: DrizzleInsightsAttendantVarianceReader;
  let stock: DrizzleInsightsStockLossReader;
  let credit: DrizzleInsightsCreditHealthReader;

  beforeAll(async () => {
    const bootstrap = postgres(CONNECTION!, { max: 1, onnotice: () => {} });
    try {
      await bootstrap.unsafe('select pg_advisory_lock(872635)');
      await bootstrap.unsafe(BOOTSTRAP);
      await bootstrap.unsafe(
        `set search_path to ${TEST_SCHEMA};` +
          shippedSchema().replace(
            /create trigger on_auth_user_created/gi,
            'create or replace trigger on_auth_user_created',
          ),
      );
      await bootstrap.unsafe('select pg_advisory_unlock(872635)');
    } finally {
      await bootstrap.end();
    }

    sql = postgres(CONNECTION!, {
      max: 4,
      onnotice: () => {},
      connection: { search_path: TEST_SCHEMA },
    });
    db = drizzle(sql, { schema }) as unknown as DbClient;
    attendants = new DrizzleInsightsAttendantVarianceReader(db);
    stock = new DrizzleInsightsStockLossReader(db);
    credit = new DrizzleInsightsCreditHealthReader(db);
    await seed();
  }, 60_000);

  afterAll(async () => {
    if (sql) {
      await sql.unsafe('select pg_advisory_lock(872635)');
      await sql.unsafe(`drop schema if exists ${TEST_SCHEMA} cascade`);
      await sql.unsafe('select pg_advisory_unlock(872635)');
      await sql.end();
    }
  });

  async function day(
    org: string,
    station: string,
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
      openedBy: org === ORG ? USER : OTHER_USER,
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
    dayId: string,
    template: string,
    snapshot: Record<string, unknown> | null,
    status: 'OPEN' | 'CLOSED' | 'LOCKED' = 'CLOSED',
  ) {
    const shiftId = nextId();
    await db.insert(schema.shifts).values({
      id: shiftId,
      organizationId: org,
      stationId: station,
      businessDayId: dayId,
      shiftTemplateId: template,
      status,
      openedBy: org === ORG ? USER : OTHER_USER,
    });
    if (snapshot)
      await db.insert(schema.shiftSummaries).values({ shiftId, snapshotData: snapshot });
  }

  const twoLevel = (drawers: unknown[]) => ({ cashVarianceModel: 2, drawers });

  async function dip(
    org: string,
    station: string,
    dayId: string,
    tankId: string,
    productId: string,
    variance: number,
    metadata: Record<string, unknown> = {},
  ) {
    await db.insert(schema.stockVariances).values({
      organizationId: org,
      stationId: station,
      businessDayId: dayId,
      productId,
      tankId,
      expectedQuantity: '1000',
      actualQuantity: String(1000 + variance),
      varianceQuantity: String(variance),
      metadata,
    });
  }

  async function collection(
    org: string,
    station: string,
    customer: string,
    account: string,
    entryDate: string,
    amount: number,
  ) {
    await db.insert(schema.collections).values({
      documentNumber: `COL-${nextId()}`,
      organizationId: org,
      stationId: station,
      entryDate,
      customerId: customer,
      amount: String(amount),
      paymentMethod: 'Cash',
      fundingAccountId: account,
    });
  }

  /**
   * STATION, 7-day window 2026-03-04..03-10, previous 02-25..03-03:
   *   03-11 OPEN with a snapshot (must not move the window or count)
   *   03-10 closed, sealed   03-09 closed, NOT sealed   03-08 closed, sealed
   *   03-02 closed, sealed (previous period)
   * Plus a sibling station and another tenant that must not leak.
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
      { id: ATT1, organizationId: ORG, fullName: 'Ravi', role: 'Attendant' },
      { id: ATT2, organizationId: ORG, fullName: 'Meena', role: 'Attendant' },
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
    await db.insert(schema.products).values([
      {
        id: P_MS,
        organizationId: ORG,
        name: 'Petrol',
        code: 'MS',
        productType: 'FUEL',
        inventoryType: 'BULK',
        unit: 'L',
        costBasis: '90.0000',
      },
      {
        id: P_HSD,
        organizationId: ORG,
        name: 'Diesel',
        code: 'HSD',
        productType: 'FUEL',
        inventoryType: 'BULK',
        unit: 'L',
        costBasis: '80.0000',
      },
      {
        id: OTHER_PRODUCT,
        organizationId: OTHER_ORG,
        name: 'Petrol',
        code: 'MS',
        productType: 'FUEL',
        inventoryType: 'BULK',
        unit: 'L',
        costBasis: '1.0000',
      },
    ]);
    await db.insert(schema.dispenserUnits).values([
      { id: DU, organizationId: ORG, stationId: STATION, name: 'DU 1', code: 'D1' },
      { id: SIB_DU, organizationId: ORG, stationId: SIBLING, name: 'DU S', code: 'DS' },
    ]);
    await db.insert(schema.tanks).values([
      {
        id: T_MS,
        organizationId: ORG,
        stationId: STATION,
        name: 'Tank MS',
        productId: P_MS,
        capacity: '20000',
      },
      {
        id: T_HSD,
        organizationId: ORG,
        stationId: STATION,
        name: 'Tank HSD',
        productId: P_HSD,
        capacity: '20000',
      },
      {
        id: T_IDLE,
        organizationId: ORG,
        stationId: STATION,
        name: 'Tank idle',
        productId: P_MS,
        capacity: '20000',
      },
      {
        id: T_SIB,
        organizationId: ORG,
        stationId: SIBLING,
        name: 'Sibling tank',
        productId: P_MS,
        capacity: '20000',
      },
      {
        id: T_OTHER,
        organizationId: OTHER_ORG,
        stationId: OTHER_TENANT_STATION,
        name: 'Other tank',
        productId: OTHER_PRODUCT,
        capacity: '20000',
      },
    ]);
    await db.insert(schema.nozzles).values([
      {
        id: N_MS,
        organizationId: ORG,
        stationId: STATION,
        duId: DU,
        tankId: T_MS,
        productId: P_MS,
        name: 'N1',
        currentReading: '0',
      },
      {
        id: N_HSD,
        organizationId: ORG,
        stationId: STATION,
        duId: DU,
        tankId: T_HSD,
        productId: P_HSD,
        name: 'N2',
        currentReading: '0',
      },
      {
        id: N_IDLE,
        organizationId: ORG,
        stationId: STATION,
        duId: DU,
        tankId: T_IDLE,
        productId: P_MS,
        name: 'N3',
        currentReading: '0',
      },
      {
        id: N_SIB,
        organizationId: ORG,
        stationId: SIBLING,
        duId: SIB_DU,
        tankId: T_SIB,
        productId: P_MS,
        name: 'N9',
        currentReading: '0',
      },
    ]);
    await db.insert(schema.customers).values([
      { id: CUSTOMER, organizationId: ORG, customerType: 'Credit', name: 'Fleet Co' },
      { id: OTHER_CUSTOMER, organizationId: OTHER_ORG, customerType: 'Credit', name: 'Other Co' },
    ]);
    await db.insert(schema.financialAccounts).values([
      { id: ACCOUNT, organizationId: ORG, accountType: 'CASH_IN_HAND', name: 'Cash in Hand' },
      { id: OTHER_ACCOUNT, organizationId: OTHER_ORG, accountType: 'CASH_IN_HAND', name: 'Cash' },
    ]);

    const d11 = await day(
      ORG,
      STATION,
      '2026-03-11',
      'OPEN',
      dssr({
        fuelSales: 777777,
        credit: 99999,
        nozzles: [{ nozzleId: N_MS, netVolume: 99999 }],
      }),
    );
    const d10 = await day(
      ORG,
      STATION,
      '2026-03-10',
      'CLOSED',
      dssr({
        fuelSales: 100000,
        merchSales: 5000,
        credit: 10000,
        nozzles: [
          { nozzleId: N_MS, netVolume: 6000 },
          { nozzleId: N_HSD, netVolume: 4000 },
          { nozzleId: N_IDLE, netVolume: 0 },
        ],
      }),
    );
    await day(ORG, STATION, '2026-03-09', 'CLOSED'); // closed, never sealed
    const d08 = await day(
      ORG,
      STATION,
      '2026-03-08',
      'CLOSED',
      dssr({
        fuelSales: 50000,
        merchSales: 1000,
        credit: 4000,
        // A snapshot frozen before net volume was stored: gross less testing.
        nozzles: [{ nozzleId: N_MS, grossVolume: 3100, testingVolume: 100 }],
      }),
    );
    const d02 = await day(
      ORG,
      STATION,
      '2026-03-02',
      'CLOSED',
      dssr({
        fuelSales: 70000,
        merchSales: 2000,
        credit: 3000,
        nozzles: [{ nozzleId: N_MS, netVolume: 5000 }],
      }),
    );

    // --- Attendant variance (Shift Summaries) ---
    await shift(
      ORG,
      STATION,
      d10,
      MORNING,
      twoLevel([
        drawer(ATT1, -100),
        drawer(ATT1, 30), // same Attendant, second Drawer: the Shift nets to -70
        drawer(ATT2, 0.004), // under half a paisa: balanced
        drawer(ATT2, null), // not handed over yet: no figure
      ]),
    );
    await shift(
      ORG,
      STATION,
      d10,
      EVENING,
      twoLevel([drawer(ATT1, -20), drawer(ATT2, 50)]),
      'LOCKED',
    );
    await shift(
      ORG,
      STATION,
      d08,
      MORNING,
      twoLevel([drawer(ATT1, 10), drawer(ATT2, -0.001), drawer(ATT_GHOST, -5, 'Ghost Rider')]),
    );
    // Closed before the two-level model: the single cash variance already holds
    // the attendant shortage, so there is no attendant level to read.
    await shift(ORG, STATION, d08, EVENING, { cashVariance: -999, drawers: [drawer(ATT2, -999)] });
    // An OPEN Shift has no sealed figure.
    await shift(ORG, STATION, d08, EVENING, twoLevel([drawer(ATT2, -888)]), 'OPEN');
    // Outside the range / on a day that is not closed.
    await shift(ORG, STATION, d02, MORNING, twoLevel([drawer(ATT1, -500)]));
    await shift(ORG, STATION, d11, MORNING, twoLevel([drawer(ATT1, -777)]));

    // --- Stock loss (Tank Dips) ---
    await dip(ORG, STATION, d10, T_MS, P_MS, -30);
    await dip(ORG, STATION, d08, T_MS, P_MS, -20);
    await dip(ORG, STATION, d10, T_MS, P_MS, -999, { openShiftAtRecording: true }); // not reconciled
    await dip(ORG, STATION, d02, T_MS, P_MS, -500); // previous period
    await dip(ORG, STATION, d11, T_MS, P_MS, -888); // open day
    await dip(ORG, STATION, d10, T_HSD, P_HSD, 10);

    // --- Credit health (Collections by Entry Date) ---
    await collection(ORG, STATION, CUSTOMER, ACCOUNT, '2026-03-04', 1000); // first day of the range
    await collection(ORG, STATION, CUSTOMER, ACCOUNT, '2026-03-09', 500); // the day that never sealed
    await collection(ORG, STATION, CUSTOMER, ACCOUNT, '2026-03-10', 2500); // last day
    await collection(ORG, STATION, CUSTOMER, ACCOUNT, '2026-03-03', 7000); // previous period
    await collection(ORG, STATION, CUSTOMER, ACCOUNT, '2026-03-11', 9000); // after the window
    await collection(ORG, OTHER_TENANT_STATION, OTHER_CUSTOMER, OTHER_ACCOUNT, '2026-03-05', 5);

    // --- A sibling station and another tenant with newer closed days ---
    const sib = await day(
      ORG,
      SIBLING,
      '2026-03-12',
      'CLOSED',
      dssr({
        fuelSales: 123456,
        credit: 11111,
        nozzles: [{ nozzleId: N_SIB, netVolume: 1234 }],
      }),
    );
    await shift(ORG, SIBLING, sib, MORNING, twoLevel([drawer(ATT1, -4242)]));
    await dip(ORG, SIBLING, sib, T_SIB, P_MS, -777);
    await collection(ORG, SIBLING, CUSTOMER, ACCOUNT, '2026-03-08', 3);
    const other = await day(
      OTHER_ORG,
      OTHER_TENANT_STATION,
      '2026-03-12',
      'CLOSED',
      dssr({
        fuelSales: 888888,
        credit: 88888,
        nozzles: [],
      }),
    );
    await shift(
      OTHER_ORG,
      OTHER_TENANT_STATION,
      other,
      OTHER_TEMPLATE,
      twoLevel([drawer(ATT1, -9999)]),
    );
    await dip(OTHER_ORG, OTHER_TENANT_STATION, other, T_OTHER, OTHER_PRODUCT, -555);
  }

  const q = (stationId: string, days: 7 | 30 | 90 = 7, organizationId = ORG) => ({
    organizationId,
    stationId,
    days,
  });

  describe('attendant variance', () => {
    it('nets each Attendant over the closed Shifts of the range, the largest absolute net first', async () => {
      const r = await attendants.read(q(STATION));
      expect(r.map((a) => a.attendantId)).toEqual([ATT1, ATT2, ATT_GHOST]);
      // Ravi: Shifts -70, -20, +10. Meena: 0 (balanced), +50, 0 (balanced).
      expect(r[0]).toMatchObject({ name: 'Ravi', shifts: 3, shortShifts: 2, overShifts: 1 });
      expect(Number(r[0].netVariance)).toBe(-80);
      expect(r[1]).toMatchObject({ name: 'Meena', shifts: 3, shortShifts: 0, overShifts: 1 });
      expect(Number(r[1].netVariance)).toBe(50);
    });

    it('classifies a Shift by its summed Drawers, not Drawer by Drawer', async () => {
      // Ravi's first Shift holds -100 and +30: one short Shift, not a short and an over.
      const [ravi] = await attendants.read(q(STATION));
      expect(ravi.shortShifts + ravi.overShifts).toBe(3);
    });

    it('names an Attendant from the user record, else from the snapshot', async () => {
      const r = await attendants.read(q(STATION));
      expect(r.find((a) => a.attendantId === ATT_GHOST)?.name).toBe('Ghost Rider');
      expect(r.find((a) => a.attendantId === ATT1)?.name).toBe('Ravi');
    });

    it('skips pre-two-level snapshots, open Shifts, other periods and days that are not closed', async () => {
      const r = await attendants.read(q(STATION));
      // Meena would read -999 / -888 if the legacy and open Shifts leaked; Ravi -500 / -777 for the others.
      expect(Number(r.find((a) => a.attendantId === ATT2)?.netVariance)).toBe(50);
      expect(Number(r.find((a) => a.attendantId === ATT1)?.netVariance)).toBe(-80);
    });

    it('widens with the range', async () => {
      const [ravi] = await attendants.read(q(STATION, 30));
      // The previous-period Shift (03-02) joins at 30 days: -80 - 500.
      expect(Number(ravi.netVariance)).toBe(-580);
      expect(ravi.shifts).toBe(4);
    });

    it('never mixes in a sibling station or another tenant', async () => {
      const sib = await attendants.read(q(SIBLING));
      expect(sib.map((a) => Number(a.netVariance))).toEqual([-4242]);
      const crossed = await attendants.read(q(OTHER_TENANT_STATION, 7, ORG));
      expect(crossed).toEqual([]);
      const own = await attendants.read(q(OTHER_TENANT_STATION, 7, OTHER_ORG));
      expect(own.map((a) => Number(a.netVariance))).toEqual([-9999]);
      // The other tenant's user table has no ATT1: the name falls back to the snapshot.
      expect(own[0].name).toBe('snapshot name');
    });

    it('is empty for a station with no history', async () => {
      expect(await attendants.read(q(EMPTY_STATION))).toEqual([]);
    });
  });

  describe('stock loss', () => {
    it('sums reconciled dips per tank against the litres the tank sold', async () => {
      const r = await stock.read(q(STATION));
      const ms = r.find((t) => t.tankId === T_MS)!;
      // -30 and -20: the mid-shift dip, the previous period and the open day are out.
      expect(ms).toMatchObject({ tankName: 'Tank MS', productCode: 'MS' });
      expect(ms.varianceLitres).toBe(-50);
      // 6000 (net) + 3000 (gross 3100 less testing 100 on the older snapshot); the open day's 99999 and 03-02's 5000 are out.
      expect(Number(ms.soldLitres)).toBe(9000);
      expect(Number(ms.costBasis)).toBe(90);

      const hsd = r.find((t) => t.tankId === T_HSD)!;
      expect(hsd.varianceLitres).toBe(10);
      expect(Number(hsd.soldLitres)).toBe(4000);
      expect(Number(hsd.costBasis)).toBe(80);
    });

    it('lists only tanks that recorded a dip variance', async () => {
      const ids = (await stock.read(q(STATION))).map((t) => t.tankId);
      expect(ids).not.toContain(T_IDLE);
      expect(ids).toHaveLength(2);
    });

    it('widens with the range', async () => {
      const ms = (await stock.read(q(STATION, 30))).find((t) => t.tankId === T_MS)!;
      expect(ms.varianceLitres).toBe(-550);
      expect(Number(ms.soldLitres)).toBe(14000);
    });

    it('never mixes in a sibling station or another tenant', async () => {
      expect((await stock.read(q(SIBLING))).map((t) => t.tankId)).toEqual([T_SIB]);
      expect(await stock.read(q(OTHER_TENANT_STATION, 7, ORG))).toEqual([]);
      const own = await stock.read(q(OTHER_TENANT_STATION, 7, OTHER_ORG));
      expect(own.map((t) => t.tankId)).toEqual([T_OTHER]);
      expect(Number(own[0].costBasis)).toBe(1);
    });

    it('is empty for a station with no history', async () => {
      expect(await stock.read(q(EMPTY_STATION))).toEqual([]);
    });
  });

  describe('credit health', () => {
    it('places Credit Sales by Business Date and Collections by Entry Date', async () => {
      const r = await credit.read(q(STATION));
      expect(r.range).toEqual({ from: '2026-03-04', to: '2026-03-10' });
      expect(r.closedDays).toBe(2);
      // Closed sealed days 03-10 and 03-08; the open 03-11 credit (99999) is not counted.
      expect(r.creditGiven).toBe(14000);
      expect(r.sales).toBe(156000);
      // Entry Dates 03-04, 03-09 (a day that never sealed) and 03-10; not 03-03 or 03-11.
      expect(r.collected).toBe(4000);
    });

    it('reads the previous equal period for the comparison', async () => {
      const r = await credit.read(q(STATION));
      expect(r.previous).toEqual({ creditGiven: 3000, closedDays: 1 });
    });

    it('widens with the range', async () => {
      const r = await credit.read(q(STATION, 30));
      expect(r.range).toEqual({ from: '2026-02-09', to: '2026-03-10' });
      expect(r.creditGiven).toBe(17000);
      expect(r.collected).toBe(11000);
      expect(r.previous).toEqual({ creditGiven: 0, closedDays: 0 });
    });

    it('never mixes in a sibling station or another tenant', async () => {
      const sib = await credit.read(q(SIBLING));
      expect(sib.creditGiven).toBe(11111);
      // Its own Collection (03-08, inside its window 03-06..03-12) counts for it only: STATION's stays 4000.
      expect(sib.collected).toBe(3);
      const crossed = await credit.read(q(OTHER_TENANT_STATION, 7, ORG));
      expect(crossed).toMatchObject({ range: null, creditGiven: 0, collected: 0, closedDays: 0 });
    });

    it('is all zeros for a station with no history', async () => {
      expect(await credit.read(q(EMPTY_STATION))).toEqual({
        range: null,
        closedDays: 0,
        creditGiven: 0,
        sales: 0,
        collected: 0,
        previous: { creditGiven: 0, closedDays: 0 },
      });
    });
  });
});
