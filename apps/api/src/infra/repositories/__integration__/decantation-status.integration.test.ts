import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { Hono } from 'hono';
import { schema, type DbClient } from '@pump/db';
import { transactionsRouter } from '../../../routes/transactions.js';
import { decantationsRouter } from '../../../routes/decantations.js';

const CONNECTION = process.env.TEST_DATABASE_URL;
const TEST_SCHEMA = 'decantation_status_it';

const id = (n: number) => `00000000-0000-0000-0000-00000000f${String(n).padStart(3, '0')}`;
const ORG = id(1);
const STATION = id(2);
const USER = id(3);
const PRODUCT = id(4);
const TANK_PENDING = id(5);
const TANK_DRAFT = id(6);
const TANK_MEASURED = id(7);
const DAY = id(8);
const PENDING = id(9);
const DRAFT = id(10);
const FLAGGED = id(11);
const LINKED = id(12);
const PURCHASE = id(13);
const PRODUCT_DIESEL = id(19);
const OLD_DAY = id(20);
const PARTIAL = id(21);
const OLD_PENDING = id(22);
const EMPTY_PENDING = id(26);

const BOOTSTRAP = `
  do $$ begin
    if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
    if not exists (select from pg_roles where rolname = 'anon') then create role anon; end if;
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
  'Decantation status and day-close warnings against real Postgres',
  () => {
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
      if (!sql) return;
      await sql.unsafe('select pg_advisory_lock(872634)');
      await sql.unsafe(`drop schema if exists ${TEST_SCHEMA} cascade`);
      await sql.unsafe('select pg_advisory_unlock(872634)');
      await sql.end();
    });

    async function seed() {
      await db.insert(schema.organizations).values({ id: ORG, name: 'Tenant' });
      await db
        .insert(schema.stations)
        .values({ id: STATION, organizationId: ORG, name: 'RO', code: 'RO' });
      await db
        .insert(schema.users)
        .values({ id: USER, organizationId: ORG, fullName: 'Owner', role: 'Owner' });
      await db.insert(schema.products).values({
        id: PRODUCT,
        organizationId: ORG,
        name: 'Petrol',
        code: 'MS',
        productType: 'FUEL',
        unit: 'L',
      });
      await db.insert(schema.products).values({
        id: PRODUCT_DIESEL,
        organizationId: ORG,
        name: 'Diesel',
        code: 'HSD',
        productType: 'FUEL',
        unit: 'L',
      });
      await db.insert(schema.tanks).values([
        {
          id: TANK_PENDING,
          organizationId: ORG,
          stationId: STATION,
          name: 'Pending tank',
          productId: PRODUCT,
          capacity: '20000',
        },
        {
          id: TANK_DRAFT,
          organizationId: ORG,
          stationId: STATION,
          name: 'Draft tank',
          productId: PRODUCT,
          capacity: '20000',
        },
        {
          id: TANK_MEASURED,
          organizationId: ORG,
          stationId: STATION,
          name: 'Measured tank',
          productId: PRODUCT,
          capacity: '20000',
        },
      ]);
      await db.insert(schema.businessDays).values({
        id: DAY,
        organizationId: ORG,
        stationId: STATION,
        businessDate: '2026-10-10',
        status: 'OPEN',
        openedBy: USER,
      });
      await db.insert(schema.businessDays).values({
        id: OLD_DAY,
        organizationId: ORG,
        stationId: STATION,
        businessDate: '2026-10-09',
        status: 'OPEN',
        openedBy: USER,
      });
      await db
        .insert(schema.suppliers)
        .values({ id: id(14), organizationId: ORG, name: 'Supplier' });
      await db.insert(schema.purchases).values({
        id: PURCHASE,
        documentNumber: 'PUR-1',
        organizationId: ORG,
        stationId: STATION,
        supplierId: id(14),
        entryDate: '2026-10-10',
        amount: '1000',
      });
      await db.insert(schema.decantations).values([
        {
          id: PENDING,
          organizationId: ORG,
          stationId: STATION,
          businessDayId: DAY,
          documentNumber: 'DEC-1',
          tankerNumber: 'T1',
          status: 'PENDING_MEASUREMENT',
          flags: [],
        },
        {
          id: DRAFT,
          organizationId: ORG,
          stationId: STATION,
          businessDayId: DAY,
          documentNumber: 'DEC-DRAFT',
          tankerNumber: 'T2',
          status: 'DRAFT',
          flags: [],
        },
        {
          id: FLAGGED,
          organizationId: ORG,
          stationId: STATION,
          businessDayId: DAY,
          documentNumber: 'DEC-3',
          tankerNumber: 'T3',
          status: 'MEASURED',
          flags: [{ code: 'TANKER_SHORT', message: 'Short chamber' }],
        },
        {
          id: LINKED,
          organizationId: ORG,
          stationId: STATION,
          businessDayId: DAY,
          documentNumber: 'DEC-4',
          tankerNumber: 'T4',
          status: 'MEASURED',
          flags: [],
        },
        {
          id: PARTIAL,
          organizationId: ORG,
          stationId: STATION,
          businessDayId: DAY,
          documentNumber: 'DEC-PARTIAL',
          tankerNumber: 'T5',
          status: 'MEASURED',
          flags: [],
        },
        {
          id: OLD_PENDING,
          organizationId: ORG,
          stationId: STATION,
          businessDayId: OLD_DAY,
          documentNumber: 'DEC-OLD',
          tankerNumber: 'T6',
          status: 'PENDING_MEASUREMENT',
          flags: [{ code: 'TANKER_SHORT', message: 'Older flagged record' }],
        },
        {
          id: EMPTY_PENDING,
          organizationId: ORG,
          stationId: STATION,
          businessDayId: DAY,
          documentNumber: 'DEC-EMPTY',
          tankerNumber: 'T7',
          status: 'PENDING_MEASUREMENT',
          flags: [],
        },
      ]);
      await db.insert(schema.decantationTankLines).values([
        {
          id: id(15),
          organizationId: ORG,
          stationId: STATION,
          decantationId: PENDING,
          tankId: TANK_PENDING,
          productId: PRODUCT,
          beforeDip: '1000',
          status: 'PENDING_MEASUREMENT',
        },
        {
          id: id(16),
          organizationId: ORG,
          stationId: STATION,
          decantationId: DRAFT,
          tankId: TANK_DRAFT,
          productId: PRODUCT,
          beforeDip: '1000',
          status: 'PENDING_MEASUREMENT',
        },
        {
          id: id(17),
          organizationId: ORG,
          stationId: STATION,
          decantationId: FLAGGED,
          tankId: TANK_MEASURED,
          productId: PRODUCT,
          beforeDip: '1000',
          status: 'MEASURED',
        },
        {
          id: id(18),
          organizationId: ORG,
          stationId: STATION,
          decantationId: LINKED,
          tankId: TANK_MEASURED,
          productId: PRODUCT,
          beforeDip: '1000',
          status: 'MEASURED',
        },
        {
          id: id(23),
          organizationId: ORG,
          stationId: STATION,
          decantationId: PARTIAL,
          tankId: TANK_MEASURED,
          productId: PRODUCT,
          beforeDip: '1000',
          status: 'MEASURED',
        },
        {
          id: id(24),
          organizationId: ORG,
          stationId: STATION,
          decantationId: PARTIAL,
          tankId: TANK_MEASURED,
          productId: PRODUCT_DIESEL,
          beforeDip: '1000',
          status: 'MEASURED',
        },
        {
          id: id(25),
          organizationId: ORG,
          stationId: STATION,
          decantationId: OLD_PENDING,
          tankId: TANK_PENDING,
          productId: PRODUCT,
          beforeDip: '1000',
          status: 'PENDING_MEASUREMENT',
        },
      ]);
      await db.insert(schema.decantationPurchases).values({
        organizationId: ORG,
        stationId: STATION,
        decantationId: LINKED,
        purchaseId: PURCHASE,
        productId: PRODUCT,
      });
      await db.insert(schema.decantationPurchases).values({
        organizationId: ORG,
        stationId: STATION,
        decantationId: PARTIAL,
        purchaseId: PURCHASE,
        productId: PRODUCT,
      });
    }

    function app() {
      const server = new Hono<{ Variables: { db: DbClient; user: any } }>();
      server.use('*', async (c, next) => {
        c.set('db', db);
        c.set('user', {
          id: USER,
          email: 'owner@example.com',
          fullName: 'Owner',
          organizationId: ORG,
          role: 'Owner',
          assignedStationIds: [STATION],
        });
        await next();
      });
      server.route('/transactions', transactionsRouter);
      server.route('/transactions', decantationsRouter);
      return server;
    }

    it('marks a tank waiting only for a non-draft pending Tank Line on that tank', async () => {
      const response = await app().request(`/transactions/inventory/status?stationId=${STATION}`);
      const body = (await response.json()) as any;
      expect(response.status).toBe(200);
      expect(body.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: TANK_PENDING, waitingOnDecantation: true }),
          expect.objectContaining({ id: TANK_DRAFT, waitingOnDecantation: false }),
          expect.objectContaining({ id: TANK_MEASURED, waitingOnDecantation: false }),
        ]),
      );
    });

    it('reports pending, unlinked, and flagged Decantations for the selected Business Day', async () => {
      const response = await app().request(
        `/transactions/decantations/day-close-warnings?stationId=${STATION}&businessDayId=${DAY}`,
      );
      const body = (await response.json()) as any;
      expect(response.status).toBe(200);
      expect(body.data).toEqual({
        pendingMeasurement: ['DEC-1', 'DEC-EMPTY', 'DEC-OLD'],
        purchaseNotLinked: [
          { documentNumber: 'DEC-1', products: ['Petrol'] },
          { documentNumber: 'DEC-3', products: ['Petrol'] },
          { documentNumber: 'DEC-OLD', products: ['Petrol'] },
          { documentNumber: 'DEC-PARTIAL', products: ['Diesel'] },
        ],
        flagged: ['DEC-3'],
      });
      expect(JSON.stringify(body.data)).not.toContain('DEC-DRAFT');
    });
  },
);
