import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { Hono } from 'hono';
import { and, eq } from 'drizzle-orm';
import { schema, type DbClient } from '@pump/db';
import { transactionsRouter } from '../../../routes/transactions.js';
import { financeRouter } from '../../../routes/finance.js';
import { dssrRouter } from '../../../routes/dssr.js';

/**
 * Office Records against a real Postgres (ADR 0005, #273 / #275 / #276).
 *
 * Collections, expenses, income and supplier payments carry an Entry Date and
 * a Funding Account instead of a Business Day and Shift. These tests prove the
 * whole path: the route writes the row, the ledger posts to the named account
 * on the Entry Date, no Business Day is opened, the customer balance reads
 * collections directly, a terminal routes to its clearing account, and the
 * Daily Cash Book reads it all back live.
 */

const CONNECTION = process.env.TEST_DATABASE_URL;
const TEST_SCHEMA = 'office_records_it';

const ORG = '00000000-0000-0000-0000-00000000c101';
const STATION = '00000000-0000-0000-0000-00000000c102';
const OTHER_STATION = '00000000-0000-0000-0000-00000000c103';
const MANAGER = '00000000-0000-0000-0000-00000000c104';
const CASH = '00000000-0000-0000-0000-00000000c105';
const PETTY = '00000000-0000-0000-0000-00000000c106';
const BANK = '00000000-0000-0000-0000-00000000c107';
const PAYTM_CLEARING = '00000000-0000-0000-0000-00000000c108';
const TERMINAL = '00000000-0000-0000-0000-00000000c109';
const FOREIGN_TERMINAL = '00000000-0000-0000-0000-00000000c10a';
const CUSTOMER = '00000000-0000-0000-0000-00000000c10b';
const CATEGORY = '00000000-0000-0000-0000-00000000c10c';
const DAY = '00000000-0000-0000-0000-00000000c10d';
const SUPPLIER = '00000000-0000-0000-0000-00000000c10e';

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

describe.skipIf(!CONNECTION)('Office Records against real Postgres (ADR 0005)', () => {
  let sql: postgres.Sql;
  let db: DbClient;
  let app: Hono;

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
      max: 1,
      onnotice: () => {},
      connection: { search_path: TEST_SCHEMA },
    });
    db = drizzle(sql, { schema }) as unknown as DbClient;
    await seed();

    const a = new Hono<{ Variables: { db: any; user: any } }>();
    a.use('*', async (c, next) => {
      c.set('db', db);
      c.set('user', {
        id: MANAGER,
        email: 'manager@example.com',
        fullName: 'Meera',
        organizationId: ORG,
        role: 'Manager',
        assignedStationIds: [STATION],
      });
      await next();
    });
    a.route('/transactions', transactionsRouter);
    a.route('/finance', financeRouter);
    a.route('/dssr', dssrRouter);
    app = a as unknown as Hono;
  }, 60_000);

  afterAll(async () => {
    if (sql) {
      await sql.unsafe('select pg_advisory_lock(872634)');
      await sql.unsafe(`drop schema if exists ${TEST_SCHEMA} cascade`);
      await sql.unsafe('select pg_advisory_unlock(872634)');
      await sql.end();
    }
  });

  async function seed() {
    await db.insert(schema.organizations).values({ id: ORG, name: 'Tenant A' });
    await db.insert(schema.stations).values([
      { id: STATION, organizationId: ORG, name: 'Station A', code: 'STA' },
      { id: OTHER_STATION, organizationId: ORG, name: 'Station B', code: 'STB' },
    ]);
    await db.insert(schema.users).values({
      id: MANAGER,
      organizationId: ORG,
      fullName: 'Meera',
      role: 'Manager',
      status: 'ACTIVE',
    });
    await db.insert(schema.financialAccounts).values([
      {
        id: CASH,
        organizationId: ORG,
        stationId: STATION,
        accountType: 'CASH_IN_HAND',
        name: 'Cash in Hand',
      },
      {
        id: PETTY,
        organizationId: ORG,
        stationId: STATION,
        accountType: 'PETTY_CASH',
        name: 'Petty Cash',
      },
      {
        id: BANK,
        organizationId: ORG,
        stationId: STATION,
        accountType: 'BANK',
        name: 'HDFC Current',
      },
      {
        id: PAYTM_CLEARING,
        organizationId: ORG,
        stationId: STATION,
        accountType: 'MERCHANT_CLEARING',
        name: 'Paytm Clearing',
      },
    ]);
    await db.insert(schema.paymentTerminals).values([
      {
        id: TERMINAL,
        organizationId: ORG,
        stationId: STATION,
        label: 'Paytm 1',
        provider: 'Paytm',
        clearingAccountId: PAYTM_CLEARING,
      },
      { id: FOREIGN_TERMINAL, organizationId: ORG, stationId: OTHER_STATION, label: 'B-POS' },
    ]);
    await db.insert(schema.customers).values({
      id: CUSTOMER,
      organizationId: ORG,
      customerType: 'Fleet',
      name: 'Sharma Transports',
    });
    await db
      .insert(schema.expenseCategories)
      .values({ id: CATEGORY, organizationId: ORG, name: 'Tea' });
    await db.insert(schema.suppliers).values({ id: SUPPLIER, organizationId: ORG, name: 'IOC' });
    // A credit sale on a (sales) Business Day: the receivable a collection pays down.
    await db.insert(schema.businessDays).values({
      id: DAY,
      organizationId: ORG,
      stationId: STATION,
      businessDate: '2026-03-14',
      status: 'OPEN',
      openedBy: MANAGER,
    });
    await db.insert(schema.customerTransactions).values({
      businessDayId: DAY,
      customerId: CUSTOMER,
      transactionType: 'Credit Sale',
      referenceType: 'CREDIT_SALE',
      amount: '10000',
    });
  }

  async function post(url: string, body: Record<string, unknown>) {
    const res = await app.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json()) as any };
  }
  async function get(url: string) {
    const res = await app.request(url);
    return (await res.json()) as any;
  }
  const ledgerFor = (sourceId: string) =>
    db.select().from(schema.ledgerEntries).where(eq(schema.ledgerEntries.sourceId, sourceId));

  it('records an expense on its Entry Date against its Funding Account, opening no Business Day', async () => {
    const daysBefore = await db.select().from(schema.businessDays);
    const r = await post('/transactions/expenses', {
      stationId: STATION,
      categoryId: CATEGORY,
      amount: 250,
      fundingAccountId: PETTY,
      entryDate: '2026-03-15',
    });
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ entryDate: '2026-03-15', fundingAccountId: PETTY });

    const [entry] = await ledgerFor(r.body.data.id);
    expect(entry).toMatchObject({
      accountId: PETTY,
      direction: 'out',
      amount: '250.00',
      entryDate: '2026-03-15',
      sourceType: 'EXPENSE',
      businessDayId: null,
      shiftId: null,
    });
    expect(await db.select().from(schema.businessDays)).toHaveLength(daysBefore.length);
  });

  it('rejects a future Entry Date', async () => {
    const r = await post('/transactions/expenses', {
      stationId: STATION,
      categoryId: CATEGORY,
      amount: 10,
      fundingAccountId: PETTY,
      entryDate: '2999-01-01',
    });
    expect(r.status).toBe(400);
  });

  it('refuses a collection into an account that does not suit its method', async () => {
    const r = await post('/transactions/collections', {
      stationId: STATION,
      customerId: CUSTOMER,
      amount: 4000,
      paymentMethod: 'Cash',
      fundingAccountId: BANK,
      entryDate: '2026-03-15',
    });
    expect(r.status).toBe(400);
  });

  it('records a collection that pays down the receivable (Σ credit sales − Σ collections)', async () => {
    const r = await post('/transactions/collections', {
      stationId: STATION,
      customerId: CUSTOMER,
      amount: 4000,
      paymentMethod: 'Cash',
      fundingAccountId: CASH,
      entryDate: '2026-03-15',
    });
    expect(r.status).toBe(200);
    const [entry] = await ledgerFor(r.body.data.id);
    expect(entry).toMatchObject({ accountId: CASH, direction: 'in', entryDate: '2026-03-15' });
    // No customer-ledger mirror row: the balance reads collections directly.
    const mirrors = await db
      .select()
      .from(schema.customerTransactions)
      .where(eq(schema.customerTransactions.transactionType, 'Collection'));
    expect(mirrors).toHaveLength(0);

    const customers = await get('/transactions/customers');
    expect(customers.data.find((c: any) => c.id === CUSTOMER).currentBalance).toBe(6000);
    const ledger = await get(`/transactions/customers/${CUSTOMER}/ledger`);
    expect(ledger.data.map((e: any) => [e.transactionType, e.businessDate])).toEqual([
      ['Credit Sale', '2026-03-14'],
      ['Collection', '2026-03-15'],
    ]);
  });

  it("routes a UPI collection through a terminal to the terminal's clearing account (#276)", async () => {
    const r = await post('/transactions/collections', {
      stationId: STATION,
      customerId: CUSTOMER,
      amount: 1000,
      paymentMethod: 'UPI',
      terminalId: TERMINAL,
      entryDate: '2026-03-15',
    });
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ terminalId: TERMINAL, fundingAccountId: PAYTM_CLEARING });
    const [entry] = await ledgerFor(r.body.data.id);
    expect(entry).toMatchObject({ accountId: PAYTM_CLEARING, terminalId: TERMINAL });
  });

  it('rejects a terminal from another station (#276)', async () => {
    const r = await post('/transactions/collections', {
      stationId: STATION,
      customerId: CUSTOMER,
      amount: 1000,
      paymentMethod: 'Card',
      terminalId: FOREIGN_TERMINAL,
    });
    expect(r.status).toBe(404);
  });

  it('records a supplier payment from the bank on its Entry Date', async () => {
    const r = await post('/transactions/supplier-payments', {
      stationId: STATION,
      supplierId: SUPPLIER,
      amount: 20000,
      fundingAccountId: BANK,
      entryDate: '2026-03-15',
    });
    expect(r.status).toBe(200);
    const [row] = await db
      .select()
      .from(schema.supplierTransactions)
      .where(
        and(
          eq(schema.supplierTransactions.supplierId, SUPPLIER),
          eq(schema.supplierTransactions.transactionType, 'Payment'),
        ),
      );
    expect(row).toMatchObject({ entryDate: '2026-03-15', fundingAccountId: BANK });
  });

  it('lists the funding accounts an office role may pick', async () => {
    const r = await get(`/finance/funding-accounts?stationId=${STATION}`);
    expect(r.data.map((a: any) => a.id).sort()).toEqual([BANK, CASH, PAYTM_CLEARING, PETTY].sort());
  });

  it('reads the Daily Cash Book live for an Entry Date (#275)', async () => {
    const r = await get(`/finance/cash-book?stationId=${STATION}&date=2026-03-15`);
    const byId = new Map(r.data.accounts.map((a: any) => [a.id, a]));
    expect(byId.get(CASH)).toMatchObject({ opening: 0, moneyIn: 4000, moneyOut: 0, closing: 4000 });
    expect(byId.get(PETTY)).toMatchObject({ moneyOut: 250, closing: -250 });
    expect(byId.get(BANK)).toMatchObject({ moneyOut: 20000 });
    expect(byId.get(PAYTM_CLEARING)).toMatchObject({ moneyIn: 1000 });

    const nextDay = await get(`/finance/cash-book?stationId=${STATION}&date=2026-03-16`);
    const cashNext = nextDay.data.accounts.find((a: any) => a.id === CASH);
    expect(cashNext).toMatchObject({ opening: 4000, moneyIn: 0, closing: 4000, entries: [] });
  });

  it('composes the period P&L server-side: expenses by entry date (ADR 0005)', async () => {
    const r = await get(`/dssr/profit-loss?stationId=${STATION}&from=2026-03-01&to=2026-03-31`);
    const day15 = r.data.days.find((d: any) => d.date === '2026-03-15');
    expect(day15).toMatchObject({ expenses: 250, otherIncome: 0 });
    expect(r.data.totals.expenses).toBe(250);
  });
});
