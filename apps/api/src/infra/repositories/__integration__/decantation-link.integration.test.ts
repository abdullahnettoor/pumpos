import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { schema, type DbClient } from '@pump/db';
import {
  FixedClock,
  LinkDecantationPurchase,
  RecordDecantation,
  RecordStockCount,
  UnlinkDecantationPurchase,
  UuidGenerator,
} from '@pump/core';
import type { ExecutionContext } from '@pump/core';
import { runInTransaction } from '../../transaction.js';
import { TimestampDocumentNumberGenerator } from '../../doc-numbers.js';
import {
  createDecantationLinker,
  createDecantationMeasurement,
  DrizzleDecantationLinkRepository,
  DrizzleDecantationPurchaseRepository,
  DrizzleDecantationRepository,
  DrizzleDensityReadingRepository,
  DrizzleTankSalesReader,
} from '../decantation-repositories.js';
import {
  DrizzleStockMovementRepository,
  DrizzleStockVarianceRepository,
} from '../inventory-repositories.js';
import {
  DrizzleShiftRepository,
  DrizzleShiftWriteGateReader,
} from '../station-ops-repositories.js';
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
const TEST_SCHEMA = 'decantation_link_it';

const id = (n: number) => `00000000-0000-0000-0000-00000000e${String(n).padStart(3, '0')}`;
const ORG = id(1);

const STATION = id(3);

const USER = id(6);
const PRODUCT = id(7);
const T1 = id(8);
const T2 = id(9);
const SUPPLIER = id(11);
const PURCHASE = id(12);
const OTHER_STATION = id(13);
const ORG_B = id(14);

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

describe.skipIf(!CONNECTION)(
  'Decantation ↔ Fuel Purchase linking against real Postgres (#469)',
  () => {
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
      await db
        .insert(schema.stations)
        .values({ id: OTHER_STATION, organizationId: ORG, name: 'Other', code: 'OTH' });
      await db.insert(schema.purchaseItems).values({
        purchaseId: PURCHASE,
        productId: PRODUCT,
        quantity: '12000',
        unitPrice: '100',
        invoiceDensity: '745',
        taxableAmount: '1200000',
        lineTotal: '1200000',
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
          linking: createDecantationLinker(tx, events, {
            densityToleranceKgM3: 3,
            settlingTimeMinutes: 30,
          }),
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
          shiftWriteGate: new DrizzleShiftWriteGateReader(tx),
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

    const linkUc = (decantationId: string, productId: string, purchaseId: string) =>
      runInTransaction(db, (tx, events) =>
        new LinkDecantationPurchase({
          links: new DrizzleDecantationLinkRepository(tx),
          decantations: new DrizzleDecantationRepository(tx),
          settler: createDecantationMeasurement(tx, events),
          events,
          settings: { densityToleranceKgM3: 3, settlingTimeMinutes: 30 },
        }).execute({ decantationId, productId, purchaseId }, ctx(ORG, STATION)),
      );
    const unlinkUc = (decantationId: string, productId: string) =>
      runInTransaction(db, (tx, events) =>
        new UnlinkDecantationPurchase({
          links: new DrizzleDecantationLinkRepository(tx),
          decantations: new DrizzleDecantationRepository(tx),
          settler: createDecantationMeasurement(tx, events),
          events,
        }).execute({ decantationId, productId }, ctx(ORG, STATION)),
      );
    const links = () =>
      db
        .select()
        .from(schema.decantationPurchases)
        .where(eq(schema.decantationPurchases.purchaseId, PURCHASE));

    it('link after measurement computes variance and flags density; unlink removes the flag', async () => {
      const created = await record({
        stationId: STATION,
        tankerNumber: 'L1',
        lines: [{ tankId: T1, beforeDip: 0, afterDip: 7000, roDensity: 751 }],
      });
      if (!created.success) throw new Error(JSON.stringify(created.error));
      const d = created.data.decantation;
      expect(d.status).toBe('MEASURED');

      const linked = await linkUc(d.id, PRODUCT, PURCHASE);
      if (!linked.success) throw new Error(JSON.stringify(linked.error));
      expect(linked.data.unlinkedProductIds).toEqual([]);
      expect(linked.data.links[0]).toMatchObject({
        purchaseId: PURCHASE,
        invoiceQty: 12000,
        invoiceDensity: 745,
        receivedQty: 7000,
        varianceQty: -5000,
      });
      expect(linked.data.flags.map((f) => f.code)).toEqual(['DENSITY_OUT_OF_TOLERANCE']);

      const un = await unlinkUc(d.id, PRODUCT);
      if (!un.success) throw new Error(JSON.stringify(un.error));
      expect(un.data.links).toEqual([]);
      expect(un.data.unlinkedProductIds).toEqual([PRODUCT]);
      expect(un.data.flags).toEqual([]);
      expect(await links()).toHaveLength(0);
    });

    it('one invoice split across two Decantations: variance is Σ received − invoice', async () => {
      const a = await record({
        stationId: STATION,
        tankerNumber: 'S1',
        lines: [{ tankId: T1, beforeDip: 0, afterDip: 5000 }],
        links: [{ productId: PRODUCT, purchaseId: PURCHASE }],
      });
      if (!a.success) throw new Error(JSON.stringify(a.error));
      const b = await record({
        stationId: STATION,
        tankerNumber: 'S2',
        lines: [{ tankId: T2, beforeDip: 0 }],
      });
      if (!b.success) throw new Error(JSON.stringify(b.error));
      await linkUc(b.data.decantation.id, PRODUCT, PURCHASE);
      // While b is pending the invoice is not fully measured: a shows Settling, no stale variance.
      expect(
        (await links()).find((l) => l.decantationId === a.data.decantation.id)?.varianceQty,
      ).toBeNull();

      const c = await record({
        decantationId: b.data.decantation.id,
        stationId: STATION,
        tankerNumber: 'S2',
        lines: [{ tankId: T2, beforeDip: 0, afterDip: 6900 }],
      });
      if (!c.success) throw new Error(JSON.stringify(c.error));
      const rows = await links();
      expect(rows).toHaveLength(2);
      for (const r of rows) {
        expect(Number(r.invoiceQty)).toBe(12000);
        expect(Number(r.varianceQty)).toBe(-100);
      }
      expect(rows.map((r) => Number(r.receivedQty)).sort()).toEqual([5000, 6900]);
    });

    it('rejects a purchase of another station and an unknown product', async () => {
      const created = await record({
        stationId: STATION,
        tankerNumber: 'X1',
        lines: [{ tankId: T1, beforeDip: 0 }],
      });
      if (!created.success) throw new Error(JSON.stringify(created.error));
      const FOREIGN_PURCHASE = id(70);
      await db.insert(schema.purchases).values({
        id: FOREIGN_PURCHASE,
        documentNumber: 'PUR-F',
        organizationId: ORG,
        stationId: OTHER_STATION,
        supplierId: SUPPLIER,
        entryDate: '2026-10-09',
        amount: '1',
      });
      await db.insert(schema.purchaseItems).values({
        purchaseId: FOREIGN_PURCHASE,
        productId: PRODUCT,
        quantity: '1',
        unitPrice: '1',
        taxableAmount: '1',
        lineTotal: '1',
      });
      const r = await linkUc(created.data.decantation.id, PRODUCT, FOREIGN_PURCHASE);
      expect(r.success).toBe(false);
      const wrong = await linkUc(created.data.decantation.id, id(99), PURCHASE);
      expect(wrong.success).toBe(false);
    });

    it('linkable purchases list the station fuel purchases with their link state', async () => {
      const rows = await new DrizzleDecantationLinkRepository(db).listLinkable(
        ORG,
        STATION,
        PRODUCT,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        purchaseId: PURCHASE,
        invoiceQty: 12000,
        invoiceDensity: 745,
        awaitingDecantation: false,
      });
      expect(rows[0].linkedDecantationCount).toBeGreaterThanOrEqual(2);
      expect(
        await new DrizzleDecantationLinkRepository(db).listLinkable(ORG_B, STATION, PRODUCT),
      ).toEqual([]);
    });
  },
);
