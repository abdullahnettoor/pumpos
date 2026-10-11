import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { schema, type DbClient } from '@pump/db';
import { FixedClock, RecordDecantation, RecordStockCount, UuidGenerator } from '@pump/core';
import type { ExecutionContext } from '@pump/core';
import { runInTransaction } from '../../transaction.js';
import { TimestampDocumentNumberGenerator } from '../../doc-numbers.js';
import {
  createDecantationMeasurement,
  DrizzleDecantationPurchaseRepository,
  DrizzleDecantationRepository,
  DrizzleDensityReadingRepository,
  DrizzleTankSalesReader,
} from '../decantation-repositories.js';
import {
  DrizzleStockMovementRepository,
  DrizzleStockVarianceRepository,
} from '../inventory-repositories.js';
import { DrizzleShiftRepository } from '../station-ops-repositories.js';
import { DrizzleTankRepository } from '../setup-repositories.js';
import { DrizzleBusinessDayRepository } from '../station-ops-repositories.js';

/**
 * RecordDecantation / Get / List against real Postgres (#467): tank lines,
 * chambers, density readings and the outbox events commit together; update
 * replaces children; reads are organization + station scoped.
 *
 * Runs only when TEST_DATABASE_URL is set.
 */

const CONNECTION = process.env.TEST_DATABASE_URL;
const TEST_SCHEMA = 'decantation_measure_it';

const id = (n: number) => `00000000-0000-0000-0000-00000000e${String(n).padStart(3, '0')}`;
const ORG = id(1);

const STATION = id(3);

const USER = id(6);
const PRODUCT = id(7);
const T1 = id(8);
const T2 = id(9);
const SUPPLIER = id(11);
const PURCHASE = id(12);

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

describe.skipIf(!CONNECTION)('Decantation measurement against real Postgres (#468)', () => {
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
    await db.insert(schema.organizations).values({ id: ORG, name: 'Tenant A' });
    await db
      .insert(schema.stations)
      .values({ id: STATION, organizationId: ORG, name: 'Station', code: 'STA' });
    await db
      .insert(schema.users)
      .values({ id: USER, organizationId: ORG, fullName: 'Asha', role: 'Owner' });
    await db.insert(schema.products).values({
      id: PRODUCT,
      organizationId: ORG,
      name: 'MS',
      code: 'MS',
      productType: 'FUEL',
      unit: 'L',
      costBasis: '90',
    });
    for (const [tid, name] of [
      [T1, 'Tank 1'],
      [T2, 'Tank 2'],
    ] as const)
      await db.insert(schema.tanks).values({
        id: tid,
        organizationId: ORG,
        stationId: STATION,
        name,
        productId: PRODUCT,
        capacity: '30000',
      });
    await db.insert(schema.suppliers).values({ id: SUPPLIER, organizationId: ORG, name: 'IOCL' });
    await db.insert(schema.purchases).values({
      id: PURCHASE,
      documentNumber: 'PUR-1',
      organizationId: ORG,
      stationId: STATION,
      supplierId: SUPPLIER,
      entryDate: '2026-10-09',
      amount: '1200000',
    });
    await db.insert(schema.purchaseItems).values({
      purchaseId: PURCHASE,
      productId: PRODUCT,
      quantity: '12000',
      unitPrice: '100',
      taxableAmount: '1200000',
      lineTotal: '1200000',
    });
  }, 60_000);

  afterAll(async () => {
    if (sql) {
      await sql.unsafe('select pg_advisory_lock(872634)');
      await sql.unsafe(`drop schema if exists ${TEST_SCHEMA} cascade`);
      await sql.unsafe('select pg_advisory_unlock(872634)');
      await sql.end();
    }
  });

  const record = (cmd: any, c = ctx(ORG, STATION)) =>
    runInTransaction(db, (tx, events) =>
      new RecordDecantation({
        decantations: new DrizzleDecantationRepository(tx),
        densityReadings: new DrizzleDensityReadingRepository(tx),
        tanks: new DrizzleTankRepository(tx),
        businessDays: new DrizzleBusinessDayRepository(tx),
        docNumbers: new TimestampDocumentNumberGenerator(),
        events,
        measurement: createDecantationMeasurement(tx, events),
      }).execute(cmd, c),
    );

  const dip = (tankId: string, actualQuantity: number, c = ctx(ORG, STATION)) =>
    runInTransaction(db, (tx, events) =>
      new RecordStockCount({
        movements: new DrizzleStockMovementRepository(tx),
        variances: new DrizzleStockVarianceRepository(tx),
        tanks: new DrizzleTankRepository(tx),
        shifts: new DrizzleShiftRepository(tx),
        businessDays: new DrizzleBusinessDayRepository(tx),
        events,
        decantationMeasurement: createDecantationMeasurement(tx, events),
      }).execute({ stationId: STATION, tankId, actualQuantity }, c),
    );

  const stock = async (tankId: string) =>
    Number(
      (
        await sql.unsafe(
          `select coalesce(sum(quantity),0) q from stock_movements where tank_id = '${tankId}'`,
        )
      )[0].q,
    );

  const link = async (decantationId: string) => {
    const [row] = await db
      .insert(schema.decantationPurchases)
      .values({
        organizationId: ORG,
        stationId: STATION,
        decantationId,
        purchaseId: PURCHASE,
        productId: PRODUCT,
      })
      .returning();
    return row;
  };

  it('pending adds no stock; a tank dip resolves it before expected is read; variance and WAC follow', async () => {
    await db.insert(schema.stockMovements).values({
      businessDayId: (await businessDay())!,
      productId: PRODUCT,
      tankId: T1,
      movementType: 'OpeningBalance',
      quantity: '4000',
    } as never);

    const created = await record({
      stationId: STATION,
      tankerNumber: 'KA01',
      lines: [{ tankId: T1, beforeDip: 4000 }],
    });
    if (!created.success) throw new Error(JSON.stringify(created.error));
    const d = created.data.decantation;
    expect(await stock(T1)).toBe(4000);
    await link(d.id);

    const r = await dip(T1, 15900);
    if (!r.success) throw new Error(JSON.stringify(r.error));
    // 4000 + received 11900 = 15900: the dip matches, nothing double counted.
    expect(r.data.expectedQuantity).toBe(15900);
    expect(r.data.varianceQuantity).toBe(0);
    expect(await stock(T1)).toBe(15900);

    const stored = await new DrizzleDecantationRepository(db).findById(ORG, d.id);
    expect(stored?.status).toBe('MEASURED');
    expect(stored?.lines[0]).toMatchObject({
      status: 'MEASURED',
      receivedQty: 11900,
      measuredBy: 'TANK_DIP',
      measurementRefId: r.data.variance.id,
    });
    const [lk] = await db
      .select()
      .from(schema.decantationPurchases)
      .where(eq(schema.decantationPurchases.decantationId, d.id));
    expect(Number(lk.receivedQty)).toBe(11900);
    expect(Number(lk.invoiceQty)).toBe(12000);
    expect(Number(lk.varianceQty)).toBe(-100);
    expect(lk.varianceComputedAt).not.toBeNull();
    const [p] = await db.select().from(schema.products).where(eq(schema.products.id, PRODUCT));
    expect(Number(p.costBasis)).toBeCloseTo((4000 * 90 + 1_200_000) / 15900, 3);
    const mv = await sql.unsafe(
      `select movement_type, reference_type from stock_movements where reference_id = '${stored!.lines[0].id}'`,
    );
    expect(mv[0]).toMatchObject({
      movement_type: 'Decantation',
      reference_type: 'decantation_tank_line',
    });
  });

  it('after dip path measures at save', async () => {
    const r = await record({
      stationId: STATION,
      tankerNumber: 'KA02',
      lines: [{ tankId: T2, beforeDip: 0, afterDip: 5000, salesDuring: 50 }],
    });
    if (!r.success) throw new Error(JSON.stringify(r.error));
    expect(r.data.decantation.status).toBe('MEASURED');
    expect(await stock(T2)).toBe(5050);
  });

  it('reads are tenant and station scoped: a foreign org or station gets nothing', async () => {
    const FOREIGN = id(90);
    const OTHER_STATION = id(91);
    await db.insert(schema.stockMovements).values({
      businessDayId: (await businessDay())!,
      productId: PRODUCT,
      tankId: T1,
      movementType: 'Sale',
      quantity: '-250',
    } as never);
    const sales = new DrizzleTankSalesReader(db);
    const from = '2000-01-01T00:00:00Z';
    const to = '2100-01-01T00:00:00Z';
    expect(await sales.litresSoldBetween(ORG, STATION, T1, from, to)).toBe(250);
    expect(await sales.litresSoldBetween(FOREIGN, STATION, T1, from, to)).toBe(0);
    expect(await sales.litresSoldBetween(ORG, OTHER_STATION, T1, from, to)).toBe(0);

    const links = new DrizzleDecantationPurchaseRepository(db);
    expect(await links.invoiceLine(ORG, STATION, PURCHASE, PRODUCT)).toMatchObject({
      quantity: 12000,
    });
    expect(await links.invoiceLine(FOREIGN, STATION, PURCHASE, PRODUCT)).toBeNull();
    expect(await links.invoiceLine(ORG, OTHER_STATION, PURCHASE, PRODUCT)).toBeNull();

    const decantations = new DrizzleDecantationRepository(db);
    const [any] = await decantations.list({ organizationId: ORG, stationId: STATION });
    expect(any).toBeDefined();
    expect(await decantations.findById(FOREIGN, any.id)).toBeNull();
    expect(await decantations.findPendingForTank(FOREIGN, STATION, T1)).toEqual([]);
    expect(await decantations.list({ organizationId: FOREIGN, stationId: STATION })).toEqual([]);
  });

  const businessDay = async () => {
    const rows = await sql.unsafe(`select id from business_days limit 1`);
    if (rows[0]) return rows[0].id as string;
    const [bd] = await db
      .insert(schema.businessDays)
      .values({
        organizationId: ORG,
        stationId: STATION,
        businessDate: '2026-10-09',
        status: 'OPEN',
        openedBy: USER,
      } as never)
      .returning();
    return bd.id;
  };
});
