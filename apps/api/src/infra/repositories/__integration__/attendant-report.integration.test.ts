import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { schema, type DbClient } from '@pump/db';
import { DrizzleAttendantHandoverReportReader } from '../attendant-report-repositories.js';

/**
 * The Attendant Handover Report reader against a real Postgres.
 *
 * Everything the *use case* decides is tested with fakes. What cannot be
 * tested with a fake is what this reader promises the database will do: that
 * an OPEN shift is excluded, that a date outside the range is excluded, that
 * the range reaches shifts through their Business Day (shifts carry no date),
 * that a credit merchandise sale is not counted twice, and that another
 * tenant's rows never appear. A fake `where()` returns the same rows whatever
 * it is handed, so those filters would pass a fake and fail a customer.
 *
 * Runs only when TEST_DATABASE_URL is set (CI provides a service container).
 * Everything lives in a dedicated schema that is dropped afterwards.
 */

const CONNECTION = process.env.TEST_DATABASE_URL;
const TEST_SCHEMA = 'attendant_report_it';

const ORG = '00000000-0000-0000-0000-00000000a001';
const OTHER_ORG = '00000000-0000-0000-0000-00000000b001';
const STATION = '00000000-0000-0000-0000-00000000a002';
const OTHER_STATION = '00000000-0000-0000-0000-00000000b002';
const ATTENDANT = '00000000-0000-0000-0000-00000000a003';
const OTHER_ATTENDANT = '00000000-0000-0000-0000-00000000a004';
const DU = '00000000-0000-0000-0000-00000000a005';

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

/**
 * Every shipped migration in order, re-pointed at the test schema — so these
 * queries run against the tables production has, and a migration that changes
 * them fails here rather than in production.
 */
function shippedSchema(): string {
  const dir = path.resolve(__dirname, '../../../../../../supabase/migrations');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => readFileSync(path.join(dir, f), 'utf8'))
    .join('\n')
    .replace(/(?:"public"|public)\./g, `"${TEST_SCHEMA}".`);
}

describe.skipIf(!CONNECTION)('Attendant Handover Report reader against real Postgres', () => {
  let sql: postgres.Sql;
  let db: DbClient;

  beforeAll(async () => {
    const bootstrap = postgres(CONNECTION!, { max: 1, onnotice: () => {} });
    try {
      // The shipped migrations create shared/global objects (e.g. the
      // on_auth_user_created trigger on auth.users), so two integration files
      // replaying them concurrently collide — serialize the bootstrap.
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
      // Same serialization as the bootstrap: cascade-dropping the schema also
      // drops the function behind the global auth.users trigger, which
      // deadlocks against another file's concurrent bootstrap DDL.
      await sql.unsafe('select pg_advisory_lock(872634)');
      await sql.unsafe(`drop schema if exists ${TEST_SCHEMA} cascade`);
      await sql.unsafe('select pg_advisory_unlock(872634)');
      await sql.end();
    }
  });

  /**
   * One station with three shifts on three business dates: a closed shift in
   * range, an OPEN shift in range, and a closed shift outside the range. Plus
   * a second organization whose rows must never surface.
   */
  async function seed() {
    for (const [org, name] of [
      [ORG, 'Tenant A'],
      [OTHER_ORG, 'Tenant B'],
    ]) {
      await db.insert(schema.organizations).values({ id: org, name });
    }
    await db.insert(schema.stations).values([
      { id: STATION, organizationId: ORG, name: 'Station A', code: 'STA' },
      { id: OTHER_STATION, organizationId: OTHER_ORG, name: 'Station B', code: 'STB' },
    ]);
    await db.insert(schema.users).values([
      { id: ATTENDANT, organizationId: ORG, fullName: 'Ravi', role: 'Attendant' },
      { id: OTHER_ATTENDANT, organizationId: ORG, fullName: 'Suresh', role: 'Attendant' },
    ]);
    await db
      .insert(schema.dispenserUnits)
      .values({ id: DU, organizationId: ORG, stationId: STATION, name: 'DU 1', code: 'DU1' });

    const template = '00000000-0000-0000-0000-00000000a006';
    await db.insert(schema.shiftTemplates).values({
      id: template,
      organizationId: ORG,
      name: 'Morning',
      startTime: '06:00',
      endTime: '14:00',
    });

    const days = [
      ['00000000-0000-0000-0000-00000000c001', '2026-03-10'],
      ['00000000-0000-0000-0000-00000000c002', '2026-03-11'],
      ['00000000-0000-0000-0000-00000000c003', '2026-02-01'],
    ];
    for (const [id, date] of days) {
      await db.insert(schema.businessDays).values({
        id,
        organizationId: ORG,
        stationId: STATION,
        businessDate: date,
        status: 'CLOSED',
        openedBy: ATTENDANT,
      });
    }

    // closed + in range | OPEN + in range | closed + outside range
    const shifts = [
      ['00000000-0000-0000-0000-00000000d001', days[0][0], 'CLOSED'],
      ['00000000-0000-0000-0000-00000000d002', days[1][0], 'OPEN'],
      ['00000000-0000-0000-0000-00000000d003', days[2][0], 'CLOSED'],
    ];
    for (const [id, businessDayId, status] of shifts) {
      await db.insert(schema.shifts).values({
        id,
        organizationId: ORG,
        stationId: STATION,
        businessDayId,
        shiftTemplateId: template,
        status,
        openedBy: ATTENDANT,
      });
      await db.insert(schema.attendantHandovers).values({
        organizationId: ORG,
        stationId: STATION,
        shiftId: id,
        userId: ATTENDANT,
        duId: DU,
        cashHandedOver: '1000',
        expectedSales: '1000',
        varianceAmount: '-50',
      });
    }

    // A tank + nozzle for our DU, and a reading in the in-range closed shift.
    const tank = '00000000-0000-0000-0000-00000000f001';
    const product = '00000000-0000-0000-0000-00000000f002';
    await db.insert(schema.products).values({
      id: product,
      organizationId: ORG,
      name: 'Petrol',
      code: 'MS',
      productType: 'FUEL',
      unit: 'Litre',
    });
    await db.insert(schema.tanks).values({
      id: tank,
      organizationId: ORG,
      stationId: STATION,
      name: 'T1',
      productId: product,
      capacity: '10000',
    });
    const nozzle = '00000000-0000-0000-0000-00000000f003';
    await db.insert(schema.nozzles).values({
      id: nozzle,
      organizationId: ORG,
      stationId: STATION,
      duId: DU,
      tankId: tank,
      productId: product,
      name: 'N1',
      currentReading: '1100',
    });
    await db.insert(schema.nozzleReadings).values({
      shiftId: shifts[0][0],
      nozzleId: nozzle,
      openingReading: '1000',
      closingReading: '1100',
      volumeSold: '100',
    });

    // A credit MERCHANDISE sale: a `sales` row AND its mirroring ledger entry.
    // The ledger entry references the sale, so counting it as a credit sale
    // would double-count the money already reported as a Billed Sale.
    const saleId = '00000000-0000-0000-0000-00000000e001';
    await db.insert(schema.sales).values({
      id: saleId,
      documentNumber: 'SAL-1',
      shiftId: shifts[0][0],
      businessDayId: days[0][0],
      saleType: 'Product',
      captureMechanism: 'POS',
      paymentMethod: 'Credit',
      attendantId: ATTENDANT,
      subtotalAmount: '400',
      taxAmount: '0',
      totalAmount: '400',
    });
    await db.insert(schema.customerTransactions).values([
      {
        shiftId: shifts[0][0],
        businessDayId: days[0][0],
        attendantId: ATTENDANT,
        transactionType: 'Credit Sale',
        referenceType: 'SALE',
        referenceId: saleId,
        amount: '400',
      },
      {
        shiftId: shifts[0][0],
        businessDayId: days[0][0],
        attendantId: ATTENDANT,
        transactionType: 'Credit Sale',
        referenceType: 'CREDIT_SALE',
        amount: '800',
      },
    ]);
  }

  const read = () =>
    new DrizzleAttendantHandoverReportReader(db).read({
      organizationId: ORG,
      stationId: STATION,
      from: '2026-03-01',
      to: '2026-03-31',
    });

  it('returns only handovers of closed shifts whose business date is in range', async () => {
    const source = await read();
    expect(source.handovers).toHaveLength(1);
    expect(source.handovers[0]).toMatchObject({
      shiftId: '00000000-0000-0000-0000-00000000d001',
      businessDate: '2026-03-10',
      attendantName: 'Ravi',
      duName: 'DU 1',
    });
  });

  it('counts a credit merchandise sale once, as a billed sale, not also as a credit sale', async () => {
    const source = await read();
    expect(source.sales.map((s) => s.totalAmount)).toEqual([400]);
    // Only the fuel-on-credit chit — the ledger row mirroring the sale is excluded.
    expect(source.creditSales.map((c) => c.amount)).toEqual([800]);
  });

  it('returns the readings of the handover’s own dispenser', async () => {
    const source = await read();
    expect(source.nozzleReadings).toHaveLength(1);
    expect(source.nozzleReadings[0]).toMatchObject({
      nozzleName: 'N1',
      productName: 'Petrol',
      volumeSold: 100,
    });
  });

  it('never returns another tenant’s handovers', async () => {
    const source = await new DrizzleAttendantHandoverReportReader(db).read({
      organizationId: OTHER_ORG,
      stationId: OTHER_STATION,
      from: '2026-03-01',
      to: '2026-03-31',
    });
    expect(source.handovers).toEqual([]);
  });

  it('narrows to one attendant when asked', async () => {
    const source = await new DrizzleAttendantHandoverReportReader(db).read({
      organizationId: ORG,
      stationId: STATION,
      from: '2026-03-01',
      to: '2026-03-31',
      attendantId: OTHER_ATTENDANT,
    });
    expect(source.handovers).toEqual([]);
  });
});
