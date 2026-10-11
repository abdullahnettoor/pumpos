import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/postgres-js';
import { schema, type DbClient } from '@pump/db';
import { transactionsRouter } from '../../../routes/transactions.js';

const CONNECTION = process.env.TEST_DATABASE_URL;
const TEST_SCHEMA = 'purchases_list_it';
const ORG = '00000000-0000-0000-0000-00000000c101';
const STATION = '00000000-0000-0000-0000-00000000c102';
const USER = '00000000-0000-0000-0000-00000000c103';
const SUPPLIER = '00000000-0000-0000-0000-00000000c104';
const FUEL = '00000000-0000-0000-0000-00000000c105';
const PRODUCT = '00000000-0000-0000-0000-00000000c106';
const DAY = '00000000-0000-0000-0000-00000000c107';
const FUEL_PURCHASE = '00000000-0000-0000-0000-00000000c108';
const LINKED_FUEL_PURCHASE = '00000000-0000-0000-0000-00000000c109';
const PRODUCT_PURCHASE = '00000000-0000-0000-0000-00000000c110';
const DECANTATION = '00000000-0000-0000-0000-00000000c111';

function migrations() {
  const dir = path.resolve(__dirname, '../../../../../../supabase/migrations');
  return readdirSync(dir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => readFileSync(path.join(dir, file), 'utf8'))
    .join('\n')
    .replace(/(?:"public"|public)\./g, `"${TEST_SCHEMA}".`)
    .replace(
      /create trigger on_auth_user_created/gi,
      'create or replace trigger on_auth_user_created',
    );
}

const appFor = (db: DbClient) => {
  const app = new Hono<{ Variables: { db: DbClient; user: any } }>();
  app.use('*', async (c, next) => {
    c.set('db', db);
    c.set('user', {
      id: USER,
      organizationId: ORG,
      role: 'Owner',
      assignedStationIds: [],
    });
    await next();
  });
  app.route('/transactions', transactionsRouter);
  return app;
};

describe.skipIf(!CONNECTION)('purchases list with both anchors against Postgres', () => {
  let sql: postgres.Sql;
  let db: DbClient;

  beforeAll(async () => {
    const bootstrap = postgres(CONNECTION!, { max: 1, onnotice: () => {} });
    try {
      await bootstrap.unsafe('select pg_advisory_lock(872634)');
      await bootstrap.unsafe(
        `drop schema if exists ${TEST_SCHEMA} cascade; create schema ${TEST_SCHEMA}`,
      );
      await bootstrap.unsafe(`set search_path to ${TEST_SCHEMA};` + migrations());
      await bootstrap.unsafe(
        `grant usage on schema ${TEST_SCHEMA} to authenticated; grant all on all tables in schema ${TEST_SCHEMA} to authenticated`,
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
    await db.insert(schema.organizations).values({ id: ORG, name: 'Purchase test' });
    await db
      .insert(schema.stations)
      .values({ id: STATION, organizationId: ORG, name: 'Station', code: 'STA' });
    await db
      .insert(schema.users)
      .values({ id: USER, organizationId: ORG, fullName: 'Owner', role: 'Owner' });
    await db
      .insert(schema.suppliers)
      .values({ id: SUPPLIER, organizationId: ORG, name: 'Fuel Co' });
    await db.insert(schema.products).values([
      {
        id: FUEL,
        organizationId: ORG,
        name: 'Diesel',
        code: 'HSD',
        productType: 'FUEL',
        unit: 'L',
      },
      {
        id: PRODUCT,
        organizationId: ORG,
        name: 'Engine Oil',
        code: 'EO',
        productType: 'LUBRICANT',
        unit: 'L',
      },
    ] as never);
    await db.insert(schema.businessDays).values({
      id: DAY,
      organizationId: ORG,
      stationId: STATION,
      businessDate: '2026-10-10',
      status: 'OPEN',
      openedBy: USER,
    });
    await db.insert(schema.purchases).values([
      {
        id: FUEL_PURCHASE,
        organizationId: ORG,
        stationId: STATION,
        documentNumber: 'PUR-FUEL-1',
        supplierId: SUPPLIER,
        entryDate: '2026-10-11',
        businessDayId: null,
        amount: '90000',
        createdAt: new Date('2026-10-11T12:00:00Z'),
      },
      {
        id: LINKED_FUEL_PURCHASE,
        organizationId: ORG,
        stationId: STATION,
        documentNumber: 'PUR-FUEL-2',
        supplierId: SUPPLIER,
        entryDate: '2026-10-10',
        businessDayId: null,
        amount: '45000',
        createdAt: new Date('2026-10-10T12:00:00Z'),
      },
      {
        id: PRODUCT_PURCHASE,
        organizationId: ORG,
        stationId: STATION,
        documentNumber: 'PUR-PROD-1',
        supplierId: SUPPLIER,
        entryDate: null,
        businessDayId: DAY,
        amount: '2360',
        createdAt: new Date('2026-10-09T12:00:00Z'),
      },
    ]);
    await db.insert(schema.purchaseItems).values([
      {
        purchaseId: FUEL_PURCHASE,
        productId: FUEL,
        quantity: '1000',
        unitPrice: '90',
        taxableAmount: '90000',
        lineTotal: '90000',
        invoiceDensity: '842.25',
      },
      {
        purchaseId: LINKED_FUEL_PURCHASE,
        productId: FUEL,
        quantity: '500',
        unitPrice: '90',
        taxableAmount: '45000',
        lineTotal: '45000',
      },
      {
        purchaseId: PRODUCT_PURCHASE,
        productId: PRODUCT,
        quantity: '10',
        unitPrice: '200',
        taxableAmount: '2000',
        lineTotal: '2360',
      },
    ]);
    await db.insert(schema.decantations).values({
      id: DECANTATION,
      organizationId: ORG,
      stationId: STATION,
      businessDayId: DAY,
      documentNumber: 'DEC-1',
      tankerNumber: 'TN-1',
    });
    await db.insert(schema.decantationPurchases).values({
      organizationId: ORG,
      stationId: STATION,
      decantationId: DECANTATION,
      purchaseId: LINKED_FUEL_PURCHASE,
      productId: FUEL,
    });
  }, 60_000);

  afterAll(async () => {
    if (!sql) return;
    await sql.unsafe('select pg_advisory_lock(872634)');
    await sql.unsafe(`drop schema if exists ${TEST_SCHEMA} cascade`);
    await sql.unsafe('select pg_advisory_unlock(872634)');
    await sql.end();
  });

  it('lists Entry Date fuel and Business Date product purchases and flags unlinked fuel', async () => {
    const res = await appFor(db).request(`/transactions/purchases?stationId=${STATION}`);
    const body = (await res.json()) as any;
    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(3);
    const byId = new Map(body.data.map((purchase: any) => [purchase.id, purchase]));
    expect(byId.get(FUEL_PURCHASE)).toMatchObject({
      entryDate: '2026-10-11',
      businessDayId: null,
      businessDate: null,
      awaitingDecantation: true,
      itemsSummary: 'Diesel',
    });
    expect(byId.get(LINKED_FUEL_PURCHASE)).toMatchObject({ awaitingDecantation: false });
    expect(byId.get(PRODUCT_PURCHASE)).toMatchObject({
      entryDate: null,
      businessDayId: DAY,
      businessDate: '2026-10-10',
      awaitingDecantation: false,
    });
  });
});
