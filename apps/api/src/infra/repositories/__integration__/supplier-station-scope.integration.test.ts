import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { Hono } from 'hono';
import { schema, type DbClient } from '@pump/db';
import { transactionsRouter } from '../../../routes/transactions.js';
import { reportsRouter } from '../../../routes/reports.js';

/**
 * Suppliers per Station (#575), through the routes against a real Postgres.
 *
 * One owner runs two pumps: Highway buys from BPCL, City from IOCL, and both
 * buy lubricants from one shared distributor. Each pump has its own account
 * with its OMC, so the supplier list, each row's balance, the statement and
 * the payables summary read the Station's own ledger only. Another
 * Organization's rows never surface.
 *
 * Runs only when TEST_DATABASE_URL is set (CI provides a service container).
 */

const CONNECTION = process.env.TEST_DATABASE_URL;
const TEST_SCHEMA = 'supplier_station_it';

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const ORG = id(1);
const OTHER_ORG = id(2);
const HIGHWAY = id(10);
const CITY = id(11);
const FOREIGN_STATION = id(12);
const OWNER = id(20);
const CITY_MANAGER = id(21);
const BANK = id(30);
const FOREIGN_BANK = id(31);
const BPCL = id(40); // Highway's OMC
const IOCL = id(41); // City's OMC
const LUBE = id(42); // shared (no station)
const IDLE_CITY = id(43); // City's own, never used
const FOREIGN = id(44); // another organization's supplier

const BOOTSTRAP = `
  do $$ begin
    if not exists (select from pg_roles where rolname = 'authenticated') then
      create role authenticated;
    end if;
    if not exists (select from pg_roles where rolname = 'anon') then
      create role anon;
    end if;
  exception when others then
    null;
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

type Row = { id: string; currentBalance: number };

describe.skipIf(!CONNECTION)('Suppliers per Station through the routes (#575)', () => {
  let sql: postgres.Sql;
  let db: DbClient;

  const appAs = (user: Record<string, unknown>) => {
    const a = new Hono<{ Variables: { db: any; user: any } }>();
    a.use('*', async (c, next) => {
      c.set('db', db);
      c.set('user', user);
      await next();
    });
    a.route('/transactions', transactionsRouter);
    a.route('/reports', reportsRouter);
    return a;
  };
  const owner = () =>
    appAs({
      id: OWNER,
      email: 'owner@example.com',
      fullName: 'Owner',
      organizationId: ORG,
      role: 'Owner',
      assignedStationIds: [],
    });
  const cityManager = () =>
    appAs({
      id: CITY_MANAGER,
      email: 'manager@example.com',
      fullName: 'Manager',
      organizationId: ORG,
      role: 'Manager',
      assignedStationIds: [CITY],
    });
  const get = async (app: Hono<any>, url: string) => {
    const res = await app.request(url);
    return { status: res.status, body: (await res.json()) as any };
  };
  const listAt = async (station: string) => {
    const { body } = await get(
      owner(),
      `/transactions/suppliers?activeOnly=false&stationId=${station}`,
    );
    return new Map<string, number>(
      (body.data as Row[]).map((s) => [s.id, Number(s.currentBalance)]),
    );
  };

  beforeAll(async () => {
    const bootstrap = postgres(CONNECTION!, { max: 1, onnotice: () => {} });
    try {
      await bootstrap.unsafe('select pg_advisory_lock(872636)');
      await bootstrap.unsafe(BOOTSTRAP);
      await bootstrap.unsafe(
        `set search_path to ${TEST_SCHEMA};` +
          shippedSchema().replace(
            /create trigger on_auth_user_created/gi,
            'create or replace trigger on_auth_user_created',
          ),
      );
      await bootstrap.unsafe('select pg_advisory_unlock(872636)');
    } finally {
      await bootstrap.end();
    }
    sql = postgres(CONNECTION!, {
      max: 2,
      onnotice: () => {},
      connection: { search_path: TEST_SCHEMA },
    });
    db = drizzle(sql, { schema }) as unknown as DbClient;

    await db.insert(schema.organizations).values([
      { id: ORG, name: 'Two pumps' },
      { id: OTHER_ORG, name: 'Someone else' },
    ]);
    await db.insert(schema.stations).values([
      { id: HIGHWAY, organizationId: ORG, name: 'Highway', code: 'HWY' },
      { id: CITY, organizationId: ORG, name: 'City', code: 'CTY' },
      { id: FOREIGN_STATION, organizationId: OTHER_ORG, name: 'Elsewhere', code: 'ELS' },
    ]);
    await db.insert(schema.financialAccounts).values([
      { id: BANK, organizationId: ORG, accountType: 'BANK', name: 'SBI current' },
      { id: FOREIGN_BANK, organizationId: OTHER_ORG, accountType: 'BANK', name: 'Their bank' },
    ]);
    await db.insert(schema.suppliers).values([
      { id: BPCL, organizationId: ORG, stationId: HIGHWAY, name: 'BPCL Kochi' },
      { id: IOCL, organizationId: ORG, stationId: CITY, name: 'IOCL Ernakulam' },
      { id: LUBE, organizationId: ORG, stationId: null, name: 'Lube distributor' },
      { id: IDLE_CITY, organizationId: ORG, stationId: CITY, name: 'City tanker hire' },
      { id: FOREIGN, organizationId: OTHER_ORG, stationId: null, name: 'Their OMC' },
    ]);
    let tick = Date.UTC(2026, 9, 1);
    const at = () => new Date((tick += 1000));
    const txn = (
      supplierId: string,
      stationId: string,
      entryDate: string,
      transactionType: string,
      amount: number,
      org = ORG,
    ) => ({
      organizationId: org,
      stationId,
      entryDate,
      supplierId,
      transactionType,
      amount: String(amount),
      fundingAccountId: transactionType === 'Payment' ? (org === ORG ? BANK : FOREIGN_BANK) : null,
      createdAt: at(),
    });
    await db.insert(schema.supplierTransactions).values([
      txn(BPCL, HIGHWAY, '2026-10-02', 'Purchase', 100000),
      txn(BPCL, HIGHWAY, '2026-10-04', 'Payment', 40000),
      txn(IOCL, CITY, '2026-10-03', 'Purchase', 70000),
      txn(LUBE, HIGHWAY, '2026-10-05', 'Purchase', 4000),
      txn(LUBE, CITY, '2026-10-06', 'Purchase', 3000),
      txn(LUBE, CITY, '2026-10-07', 'Payment', 5000), // City is 2000 ahead with the distributor
      txn(FOREIGN, FOREIGN_STATION, '2026-10-03', 'Purchase', 999999, OTHER_ORG),
    ]);
  }, 60_000);

  afterAll(async () => {
    if (sql) {
      await sql.unsafe('select pg_advisory_lock(872636)');
      await sql.unsafe(`drop schema if exists ${TEST_SCHEMA} cascade`);
      await sql.unsafe('select pg_advisory_unlock(872636)');
      await sql.end();
    }
  });

  describe('GET /transactions/suppliers?stationId=', () => {
    it("lists each Station's own and shared suppliers, never another Station's OMC", async () => {
      const highway = await listAt(HIGHWAY);
      expect([...highway.keys()].sort()).toEqual([BPCL, LUBE].sort());
      const city = await listAt(CITY);
      expect([...city.keys()].sort()).toEqual([IOCL, IDLE_CITY, LUBE].sort());
    });

    it("balances each row on the Station's own ledger, so a shared supplier shows its share", async () => {
      const highway = await listAt(HIGHWAY);
      expect(highway.get(BPCL)).toBe(60000);
      expect(highway.get(LUBE)).toBe(4000);
      const city = await listAt(CITY);
      expect(city.get(IOCL)).toBe(70000);
      expect(city.get(LUBE)).toBe(-2000);
      expect(city.get(IDLE_CITY)).toBe(0);
    });

    it('keeps the Organization list without a Station, for pickers and older clients', async () => {
      const { body } = await get(owner(), '/transactions/suppliers?activeOnly=false');
      const all = new Map<string, number>(
        (body.data as Row[]).map((s) => [s.id, Number(s.currentBalance)]),
      );
      expect([...all.keys()].sort()).toEqual([BPCL, IOCL, LUBE, IDLE_CITY].sort());
      expect(all.get(LUBE)).toBe(2000);
    });

    it("never shows another organization's supplier or rows", async () => {
      expect((await listAt(HIGHWAY)).has(FOREIGN)).toBe(false);
      // A foreign Station id reaches only this Organization's shared suppliers, at zero.
      const foreign = await listAt(FOREIGN_STATION);
      expect([...foreign.entries()]).toEqual([[LUBE, 0]]);
    });

    it('refuses a Station the caller is not assigned to', async () => {
      const res = await get(cityManager(), `/transactions/suppliers?stationId=${HIGHWAY}`);
      expect(res.status).toBe(403);
    });
  });

  describe('GET /transactions/suppliers/:id/ledger?stationId=', () => {
    it("reads only the Station's ledger with a shared supplier, ranged and all-time", async () => {
      const ranged = await get(
        owner(),
        `/transactions/suppliers/${LUBE}/ledger?stationId=${CITY}&from=2026-10-01&to=2026-10-31`,
      );
      expect(ranged.body.data.entries.map((e: any) => e.transactionType)).toEqual([
        'Purchase',
        'Payment',
      ]);
      expect(ranged.body.data.closingBalance).toBe('-2000.00');

      const allTime = await get(
        owner(),
        `/transactions/suppliers/${LUBE}/ledger?stationId=${HIGHWAY}`,
      );
      expect(allTime.body.data.map((e: any) => Number(e.amount))).toEqual([4000]);
    });

    it('refuses a Station the caller is not assigned to', async () => {
      const res = await get(
        cityManager(),
        `/transactions/suppliers/${LUBE}/ledger?stationId=${HIGHWAY}`,
      );
      expect(res.status).toBe(403);
    });
  });

  describe('GET /reports/payables?stationId=', () => {
    it("owes only the Station's own OMC and its share of the shared supplier", async () => {
      const highway = await get(owner(), `/reports/payables?stationId=${HIGHWAY}`);
      expect(highway.body.data.total).toBe(64000);
      expect(highway.body.data.suppliers.map((s: any) => s.supplierId).sort()).toEqual(
        [BPCL, LUBE].sort(),
      );
      const city = await get(owner(), `/reports/payables?stationId=${CITY}`);
      expect(city.body.data.total).toBe(70000);
      expect(city.body.data.suppliers.map((s: any) => s.supplierId)).toEqual([IOCL]);
    });

    it('equals the positive balances of the same Station list', async () => {
      for (const station of [HIGHWAY, CITY]) {
        const list = await listAt(station);
        const owed = [...list.values()].filter((b) => b > 0).reduce((a, b) => a + b, 0);
        const { body } = await get(owner(), `/reports/payables?stationId=${station}`);
        expect(body.data.total).toBe(owed);
      }
    });

    it("answers a supplier's payable from the Station's ledger", async () => {
      const lubeAtCity = await get(owner(), `/reports/payables/${LUBE}?stationId=${CITY}`);
      expect(lubeAtCity.body.data.balance).toBe(-2000);
      const ioclAtHighway = await get(owner(), `/reports/payables/${IOCL}?stationId=${HIGHWAY}`);
      expect(ioclAtHighway.body.data.balance).toBe(0);
    });

    it("refuses another organization's Station", async () => {
      const res = await get(owner(), `/reports/payables?stationId=${FOREIGN_STATION}`);
      expect(res.status).toBe(404);
    });
  });
});
