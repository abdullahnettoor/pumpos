import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { schema, type DbClient } from '@pump/db';
import { FixedClock, GetDecantationReport, UuidGenerator } from '@pump/core';
import type { ExecutionContext } from '@pump/core';
import { DrizzleDecantationReportReader } from '../decantation-report-repositories.js';

const CONNECTION = process.env.TEST_DATABASE_URL;
const TEST_SCHEMA = 'decantation_report_it';

const id = (n: number) => `00000000-0000-0000-0000-00000000e${String(n).padStart(3, '0')}`;
const ORG = id(1);
const OTHER_ORG = id(2);
const STATION = id(3);
const OTHER_STATION = id(4);
const USER = id(6);
const PRODUCT = id(7);
const T1 = id(8);
const T2 = id(9);
const SUPPLIER = id(10);

const BD1 = id(21);
const BD2 = id(22);
const BD3 = id(23);
const BD_OUTSIDE = id(24);

const DEC1 = id(31);
const DEC2 = id(32);
const DEC3 = id(33);
const DEC_OUTSIDE = id(34);
const DEC_OTHER = id(35);

const PURCH1 = id(41);
const PURCH2 = id(42);

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

describe.skipIf(!CONNECTION)('Decantation Report against real Postgres (ticket #473)', () => {
  let sql: postgres.Sql;
  let db: DbClient;

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

    // Organizations
    await db.insert(schema.organizations).values([
      { id: ORG, name: 'Main Org' },
      { id: OTHER_ORG, name: 'Other Org' },
    ]);

    // Stations
    await db.insert(schema.stations).values([
      { id: STATION, organizationId: ORG, name: 'Station Alpha', code: 'STA' },
      { id: OTHER_STATION, organizationId: OTHER_ORG, name: 'Station Foreign', code: 'STF' },
    ]);

    // User
    await db.insert(schema.users).values({
      id: USER,
      organizationId: ORG,
      fullName: 'Asha Manager',
      role: 'Manager',
    });

    // Product
    await db.insert(schema.products).values({
      id: PRODUCT,
      organizationId: ORG,
      name: 'Motor Spirit',
      code: 'MS',
      productType: 'FUEL',
      unit: 'L',
    });

    // Tanks
    await db.insert(schema.tanks).values([
      {
        id: T1,
        organizationId: ORG,
        stationId: STATION,
        name: 'Tank 1',
        productId: PRODUCT,
        capacity: '20000',
      },
      {
        id: T2,
        organizationId: ORG,
        stationId: STATION,
        name: 'Tank 2',
        productId: PRODUCT,
        capacity: '20000',
      },
    ]);

    // Supplier
    await db.insert(schema.suppliers).values({
      id: SUPPLIER,
      organizationId: ORG,
      name: 'IOCL',
    });

    // Business Days
    await db.insert(schema.businessDays).values([
      {
        id: BD1,
        organizationId: ORG,
        stationId: STATION,
        businessDate: '2026-03-05',
        status: 'CLOSED',
        openedBy: USER,
      },
      {
        id: BD2,
        organizationId: ORG,
        stationId: STATION,
        businessDate: '2026-03-06',
        status: 'CLOSED',
        openedBy: USER,
      },
      {
        id: BD3,
        organizationId: ORG,
        stationId: STATION,
        businessDate: '2026-03-07',
        status: 'CLOSED',
        openedBy: USER,
      },
      {
        id: BD_OUTSIDE,
        organizationId: ORG,
        stationId: STATION,
        businessDate: '2026-03-25',
        status: 'CLOSED',
        openedBy: USER,
      },
    ]);

    // Purchases & Purchase Items
    await db.insert(schema.purchases).values([
      {
        id: PURCH1,
        organizationId: ORG,
        stationId: STATION,
        supplierId: SUPPLIER,
        businessDayId: BD1,
        documentNumber: 'PUR-001',
        invoiceNumber: 'INV-IOCL-9001',
        amount: '850000.00',
        taxableAmount: '800000.00',
      },
      {
        id: PURCH2,
        organizationId: ORG,
        stationId: STATION,
        supplierId: SUPPLIER,
        businessDayId: BD2,
        documentNumber: 'PUR-002',
        invoiceNumber: 'INV-IOCL-9002',
        amount: '950000.00',
        taxableAmount: '900000.00',
      },
    ]);

    await db.insert(schema.purchaseItems).values([
      {
        id: id(51),
        purchaseId: PURCH1,
        productId: PRODUCT,
        quantity: '9150.000',
        unitPrice: '90.00',
        lineTotal: '823500.00',
        taxableAmount: '823500.00',
        invoiceDensity: '750.00',
      },
      {
        id: id(52),
        purchaseId: PURCH2,
        productId: PRODUCT,
        quantity: '10000.000',
        unitPrice: '90.00',
        lineTotal: '900000.00',
        taxableAmount: '900000.00',
        invoiceDensity: '751.00',
      },
    ]);

    // 1. Visit 1: Measured + linked with short variance
    await db.insert(schema.decantations).values({
      id: DEC1,
      organizationId: ORG,
      stationId: STATION,
      businessDayId: BD1,
      documentNumber: 'DEC-2026-001',
      tankerNumber: 'KA-01-AA-1111',
      driverName: 'Driver 1',
      status: 'MEASURED',
      chambersChecked: true,
      flags: [{ code: 'CHAMBER_SHORT', chamberNo: 1, message: 'Transit shortage' }],
      recordedBy: USER,
    });

    const LINE1 = id(61);
    await db.insert(schema.decantationTankLines).values({
      id: LINE1,
      organizationId: ORG,
      stationId: STATION,
      decantationId: DEC1,
      tankId: T1,
      productId: PRODUCT,
      beforeDip: '1000.00',
      afterDip: '10000.00',
      salesDuring: '100.00',
      receivedQty: '9100.000',
      roDensity: '750.50',
      measuredBy: 'AFTER_DIP',
      status: 'MEASURED',
    });

    await db.insert(schema.decantationChambers).values([
      {
        id: id(71),
        organizationId: ORG,
        stationId: STATION,
        decantationId: DEC1,
        tankLineId: LINE1,
        chamberNo: 1,
        capacityL: '4000.00',
        sealOk: true,
        mark: 'SHORT',
        dipMm: '990.00',
        emptied: true,
      },
      {
        id: id(72),
        organizationId: ORG,
        stationId: STATION,
        decantationId: DEC1,
        tankLineId: LINE1,
        chamberNo: 2,
        capacityL: '4000.00',
        sealOk: true,
        mark: 'OK',
        dipMm: '1000.00',
        emptied: false, // not emptied
      },
      {
        id: id(73),
        organizationId: ORG,
        stationId: STATION,
        decantationId: DEC1,
        tankLineId: LINE1,
        chamberNo: 3,
        capacityL: '2000.00',
        sealOk: false, // seal broken
        mark: 'OK',
        dipMm: '500.00',
        emptied: true,
      },
    ]);

    await db.insert(schema.decantationPurchases).values({
      id: id(81),
      organizationId: ORG,
      stationId: STATION,
      decantationId: DEC1,
      purchaseId: PURCH1,
      productId: PRODUCT,
      receivedQty: '9100.000',
      invoiceQty: '9150.000',
      varianceQty: '-50.000',
      varianceComputedAt: new Date('2026-03-05T12:00:00Z'),
    });

    // 2. Visit 2: Pending measurement
    await db.insert(schema.decantations).values({
      id: DEC2,
      organizationId: ORG,
      stationId: STATION,
      businessDayId: BD2,
      documentNumber: 'DEC-2026-002',
      tankerNumber: 'KA-01-BB-2222',
      driverName: 'Driver 2',
      status: 'PENDING_MEASUREMENT',
      chambersChecked: true,
      flags: [],
      recordedBy: USER,
    });

    await db.insert(schema.decantationTankLines).values({
      id: id(62),
      organizationId: ORG,
      stationId: STATION,
      decantationId: DEC2,
      tankId: T2,
      productId: PRODUCT,
      beforeDip: '2000.00',
      status: 'PENDING_MEASUREMENT',
    });

    await db.insert(schema.decantationPurchases).values({
      id: id(82),
      organizationId: ORG,
      stationId: STATION,
      decantationId: DEC2,
      purchaseId: PURCH2,
      productId: PRODUCT,
      invoiceQty: '10000.000',
    });

    // 3. Visit 3: Unlinked decantation
    await db.insert(schema.decantations).values({
      id: DEC3,
      organizationId: ORG,
      stationId: STATION,
      businessDayId: BD3,
      documentNumber: 'DEC-2026-003',
      tankerNumber: 'KA-01-CC-3333',
      driverName: 'Driver 3',
      status: 'MEASURED',
      chambersChecked: false,
      flags: [],
      recordedBy: USER,
    });

    await db.insert(schema.decantationTankLines).values({
      id: id(63),
      organizationId: ORG,
      stationId: STATION,
      decantationId: DEC3,
      tankId: T1,
      productId: PRODUCT,
      beforeDip: '1000.00',
      afterDip: '6000.00',
      salesDuring: '0.00',
      receivedQty: '5000.000',
      roDensity: '749.00',
      measuredBy: 'AFTER_DIP',
      status: 'MEASURED',
    });

    // 4. Visit outside range
    await db.insert(schema.decantations).values({
      id: DEC_OUTSIDE,
      organizationId: ORG,
      stationId: STATION,
      businessDayId: BD_OUTSIDE,
      documentNumber: 'DEC-2026-OUTSIDE',
      tankerNumber: 'KA-01-XX-9999',
      status: 'MEASURED',
      chambersChecked: true,
      flags: [],
      recordedBy: USER,
    });

    // 5. Visit other tenant
    await db.insert(schema.decantations).values({
      id: DEC_OTHER,
      organizationId: OTHER_ORG,
      stationId: OTHER_STATION,
      businessDayId: BD1,
      documentNumber: 'DEC-FOREIGN',
      tankerNumber: 'FOREIGN-TANKER',
      status: 'MEASURED',
      chambersChecked: true,
      flags: [],
      recordedBy: USER,
    });
  }, 60_000);

  afterAll(async () => {
    if (sql) {
      await sql.unsafe('select pg_advisory_lock(872635)');
      await sql.unsafe(`drop schema if exists ${TEST_SCHEMA} cascade`);
      await sql.unsafe('select pg_advisory_unlock(872635)');
      await sql.end();
    }
  });

  it('queries mixed visits (measured+linked short variance, pending, unlinked, chambers short)', async () => {
    const reader = new DrizzleDecantationReportReader(db);
    const useCase = new GetDecantationReport({ reader });

    const result = await useCase.execute(
      { stationId: STATION, from: '2026-03-01', to: '2026-03-10' },
      ctx(ORG, STATION),
    );

    expect(result.success).toBe(true);
    if (!result.success) return;

    const report = result.data;
    expect(report.stationName).toBe('Station Alpha');
    // Exactly 3 visits in range for this station (outside date and other tenant excluded)
    expect(report.visits).toHaveLength(3);

    // 1. Visit 1 (DEC1 - measured & linked)
    const v1 = report.visits.find((v) => v.id === DEC1);
    expect(v1).toBeDefined();
    expect(v1!.status).toBe('MEASURED');
    expect(v1!.flags).toHaveLength(1);
    expect(v1!.chamberSummary).toEqual({
      totalChambers: 3,
      shortCount: 1,
      excessCount: 0,
      notEmptiedCount: 1,
      sealsBrokenCount: 1,
      hasTransitDiscrepancy: true,
    });
    expect(v1!.tankLines[0].roDensity).toBe(750.5);
    expect(v1!.tankLines[0].invoiceDensity).toBe(750.0);
    expect(v1!.tankLines[0].densityDeviation).toBe(0.5);
    expect(v1!.invoiceLinks[0].status).toBe('LINKED');
    expect(v1!.invoiceLinks[0].invoiceNumber).toBe('INV-IOCL-9001');
    expect(v1!.invoiceLinks[0].invoiceQty).toBe(9150);
    expect(v1!.invoiceLinks[0].receivedQty).toBe(9100);
    expect(v1!.invoiceLinks[0].varianceQty).toBe(-50);
    expect(v1!.invoiceLinks[0].varianceType).toBe('SHORT');
    expect(v1!.invoiceLinks[0].statusLabel).toBe('Short');

    // 2. Visit 2 (DEC2 - pending)
    const v2 = report.visits.find((v) => v.id === DEC2);
    expect(v2).toBeDefined();
    expect(v2!.status).toBe('PENDING_MEASUREMENT');
    expect(v2!.invoiceLinks[0].status).toBe('PENDING_MEASUREMENT');
    expect(v2!.invoiceLinks[0].statusLabel).toBe('Pending measurement');
    expect(v2!.invoiceLinks[0].varianceQty).toBeNull();

    // 3. Visit 3 (DEC3 - unlinked)
    const v3 = report.visits.find((v) => v.id === DEC3);
    expect(v3).toBeDefined();
    expect(v3!.status).toBe('MEASURED');
    expect(v3!.invoiceLinks[0].status).toBe('NOT_LINKED');
    expect(v3!.invoiceLinks[0].statusLabel).toBe('Purchase not linked');
    expect(v3!.invoiceLinks[0].invoiceNumber).toBeNull();
    expect(v3!.invoiceLinks[0].varianceQty).toBeNull();

    // Product Totals
    const msTotals = report.productTotals.find((p) => p.productCode === 'MS');
    expect(msTotals).toBeDefined();
    expect(msTotals!.totalReceivedQty).toBe(14100); // 9100 + 5000
    expect(msTotals!.totalInvoiceQty).toBe(19150); // 9150 + 10000
    expect(msTotals!.totalVarianceQty).toBe(-50);
    expect(msTotals!.shortVarianceQty).toBe(50);
    expect(msTotals!.visitCount).toBe(3);
    expect(msTotals!.measuredLineCount).toBe(2);
    expect(msTotals!.pendingLineCount).toBe(1);

    // Grand Totals
    expect(report.totals.totalVisits).toBe(3);
    expect(report.totals.measuredVisits).toBe(2);
    expect(report.totals.pendingVisits).toBe(1);
    expect(report.totals.totalChambersShort).toBe(1);
    expect(report.totals.totalChambersNotEmptied).toBe(1);
    expect(report.totals.totalSealsBroken).toBe(1);
  });
});
