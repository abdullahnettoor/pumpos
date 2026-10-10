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
const PRIOR_DAY = '00000000-0000-0000-0000-00000000c110';
const RANGE_END_DAY = '00000000-0000-0000-0000-00000000c111';
const OTHER_ORG = '00000000-0000-0000-0000-00000000c112';
const OTHER_DAY = '00000000-0000-0000-0000-00000000c114';
const RANGE_CUSTOMER = '00000000-0000-0000-0000-00000000c116';
const SETTLED_CUSTOMER = '00000000-0000-0000-0000-00000000c1a6';
const RANGE_SUPPLIER = '00000000-0000-0000-0000-00000000c117';
const RANGE_PURCHASE = '00000000-0000-0000-0000-00000000c118';
const MISSING_PURCHASE = '00000000-0000-0000-0000-00000000c119';

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
    await db.insert(schema.organizations).values([
      { id: ORG, name: 'Tenant A' },
      { id: OTHER_ORG, name: 'Tenant B' },
    ]);
    await db.insert(schema.stations).values([
      { id: STATION, organizationId: ORG, name: 'Station A', code: 'STA' },
      { id: OTHER_STATION, organizationId: ORG, name: 'Station B', code: 'STB' },
      {
        id: '00000000-0000-0000-0000-00000000c115',
        organizationId: OTHER_ORG,
        name: 'Station C',
        code: 'STC',
      },
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
    await db.insert(schema.customers).values([
      { id: CUSTOMER, organizationId: ORG, customerType: 'Fleet', name: 'Sharma Transports' },
      { id: RANGE_CUSTOMER, organizationId: ORG, customerType: 'Fleet', name: 'Range Customer' },
    ]);
    await db
      .insert(schema.expenseCategories)
      .values({ id: CATEGORY, organizationId: ORG, name: 'Tea' });
    await db.insert(schema.suppliers).values([
      { id: SUPPLIER, organizationId: ORG, name: 'IOC' },
      { id: RANGE_SUPPLIER, organizationId: ORG, name: 'Range Supplier' },
    ]);
    // A credit sale on a (sales) Business Day: the receivable a collection pays down.
    await db.insert(schema.businessDays).values({
      id: DAY,
      organizationId: ORG,
      stationId: STATION,
      businessDate: '2026-03-14',
      status: 'OPEN',
      openedBy: MANAGER,
    });
    await db.insert(schema.businessDays).values([
      {
        id: PRIOR_DAY,
        organizationId: ORG,
        stationId: STATION,
        businessDate: '2026-03-13',
        status: 'CLOSED',
        openedBy: MANAGER,
      },
      {
        id: RANGE_END_DAY,
        organizationId: ORG,
        stationId: STATION,
        businessDate: '2026-03-15',
        status: 'OPEN',
        openedBy: MANAGER,
      },
      {
        id: OTHER_DAY,
        organizationId: OTHER_ORG,
        stationId: '00000000-0000-0000-0000-00000000c115',
        businessDate: '2026-03-14',
        status: 'OPEN',
        openedBy: MANAGER,
      },
    ]);
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

  it('builds ranged customer balances from Business Date sales and Entry Date collections, inclusively and tenant-scoped', async () => {
    await db.insert(schema.customerTransactions).values([
      {
        businessDayId: PRIOR_DAY,
        customerId: RANGE_CUSTOMER,
        transactionType: 'Credit Sale',
        amount: '2000',
      },
      {
        businessDayId: DAY,
        customerId: RANGE_CUSTOMER,
        transactionType: 'Credit Sale',
        amount: '1000',
      },
      {
        businessDayId: RANGE_END_DAY,
        customerId: RANGE_CUSTOMER,
        transactionType: 'Credit Sale',
        amount: '1000',
      },
      // A cross-tenant row referencing this party must not enter its statement or balance.
      {
        businessDayId: OTHER_DAY,
        customerId: RANGE_CUSTOMER,
        transactionType: 'Credit Sale',
        amount: '50000',
      },
    ]);
    await db.insert(schema.collections).values([
      {
        organizationId: ORG,
        stationId: STATION,
        entryDate: '2026-03-15',
        customerId: RANGE_CUSTOMER,
        amount: '3000',
        paymentMethod: 'Cash',
        fundingAccountId: CASH,
        documentNumber: 'COL-RANGE-1',
      },
      {
        organizationId: OTHER_ORG,
        stationId: '00000000-0000-0000-0000-00000000c115',
        entryDate: '2026-03-14',
        customerId: RANGE_CUSTOMER,
        amount: '40000',
        paymentMethod: 'Cash',
        fundingAccountId: CASH,
        documentNumber: 'COL-FOREIGN-1',
      },
    ]);

    const ranged = await get(
      `/transactions/customers/${RANGE_CUSTOMER}/ledger?from=2026-03-14&to=2026-03-15`,
    );
    expect(ranged.data.periodOpeningBalance).toBe('2000.00');
    expect(
      ranged.data.entries.map((entry: any) => [entry.transactionType, entry.businessDate]),
    ).toEqual([
      ['Credit Sale', '2026-03-14'],
      ['Credit Sale', '2026-03-15'],
      ['Collection', '2026-03-15'],
    ]);
    expect(ranged.data.entries[0].runningBalance).toBe('3000.00');
    expect(ranged.data.closingBalance).toBe('1000.00');
    expect(ranged.data.hasEarlier).toBe(true);
    const customers = await get('/transactions/customers');
    expect(customers.data.find((row: any) => row.id === RANGE_CUSTOMER).currentBalance).toBe(1000);
    expect(ranged.data.closingBalance).toBe('1000.00');

    // Nothing before the first entry: no earlier history to load.
    const before = await get(
      `/transactions/customers/${RANGE_CUSTOMER}/ledger?from=2000-01-01&to=2000-01-31`,
    );
    expect(before.data).toMatchObject({ periodOpeningBalance: '0', hasEarlier: false });

    // Settled before the window (opening balance 0) is still history: "Earlier months" must show.
    await db
      .insert(schema.customers)
      .values({
        id: SETTLED_CUSTOMER,
        organizationId: ORG,
        customerType: 'Fleet',
        name: 'Settled',
      });
    await db.insert(schema.customerTransactions).values({
      businessDayId: PRIOR_DAY,
      customerId: SETTLED_CUSTOMER,
      transactionType: 'Credit Sale',
      amount: '500',
    });
    await db.insert(schema.collections).values({
      organizationId: ORG,
      stationId: STATION,
      entryDate: '2026-03-13',
      customerId: SETTLED_CUSTOMER,
      amount: '500',
      paymentMethod: 'Cash',
      fundingAccountId: CASH,
      documentNumber: 'COL-SETTLED-1',
    });
    const settled = await get(
      `/transactions/customers/${SETTLED_CUSTOMER}/ledger?from=2026-03-14&to=2026-03-31`,
    );
    expect(settled.data).toMatchObject({
      periodOpeningBalance: '0.00',
      hasEarlier: true,
      entries: [],
    });
  });

  it('keeps supplier purchases on their copied Entry Date when purchase metadata is missing and reports advances', async () => {
    await db.insert(schema.purchases).values({
      id: RANGE_PURCHASE,
      documentNumber: 'PUR-RANGE-1',
      businessDayId: DAY, // Business Date 2026-03-14, distinct from copied Entry Date below.
      supplierId: RANGE_SUPPLIER,
      invoiceNumber: 'INV-RANGE-1',
      amount: '30',
    });
    await db.insert(schema.supplierTransactions).values([
      {
        organizationId: ORG,
        stationId: STATION,
        entryDate: '2026-03-13',
        supplierId: RANGE_SUPPLIER,
        transactionType: 'Payment',
        amount: '50',
        fundingAccountId: BANK,
      },
      {
        organizationId: ORG,
        stationId: STATION,
        entryDate: '2026-03-15',
        supplierId: RANGE_SUPPLIER,
        transactionType: 'Purchase',
        amount: '30',
        referenceType: 'PURCHASE',
        referenceId: RANGE_PURCHASE,
      },
      {
        organizationId: ORG,
        stationId: STATION,
        entryDate: '2026-03-15',
        supplierId: RANGE_SUPPLIER,
        transactionType: 'Purchase',
        amount: '5',
        referenceType: 'PURCHASE',
        referenceId: MISSING_PURCHASE,
      },
      {
        organizationId: ORG,
        stationId: STATION,
        entryDate: '2026-03-15',
        supplierId: RANGE_SUPPLIER,
        transactionType: 'Payment',
        amount: '2',
        fundingAccountId: BANK,
      },
      {
        organizationId: OTHER_ORG,
        stationId: '00000000-0000-0000-0000-00000000c115',
        entryDate: '2026-03-15',
        supplierId: RANGE_SUPPLIER,
        transactionType: 'Purchase',
        amount: '90000',
      },
    ]);
    const ranged = await get(
      `/transactions/suppliers/${RANGE_SUPPLIER}/ledger?from=2026-03-15&to=2026-03-15`,
    );
    expect(ranged.data.periodOpeningBalance).toBe('-50.00');
    expect(ranged.data.hasEarlier).toBe(true);
    expect(ranged.data.entries).toHaveLength(3);
    const purchaseRow = ranged.data.entries.find((row: any) => row.invoiceNumber === 'INV-RANGE-1');
    expect(purchaseRow).toMatchObject({ businessDate: '2026-03-15', reference: 'INV-RANGE-1' });
    expect(Number(purchaseRow.runningBalance)).toBeGreaterThan(-50);
    expect(ranged.data.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          transactionType: 'Purchase',
          businessDate: '2026-03-15',
          invoiceNumber: 'INV-RANGE-1',
          reference: 'INV-RANGE-1',
        }),
        expect.objectContaining({
          transactionType: 'Purchase',
          businessDate: '2026-03-15',
          reference: null,
        }),
        expect.objectContaining({
          transactionType: 'Payment',
          businessDate: '2026-03-15',
          method: 'BANK',
        }),
      ]),
    );
    const suppliers = await get('/transactions/suppliers');
    expect(suppliers.data.find((row: any) => row.id === RANGE_SUPPLIER).currentBalance).toBe(-17);
    expect(ranged.data.closingBalance).toBe('-17.00');
  });

  it('uses date-ordered indexes for all three ranged statement sources', async () => {
    await sql.unsafe(
      `INSERT INTO business_days (id, organization_id, station_id, business_date, status, opened_by)
       SELECT gen_random_uuid(), $1, $2, to_char(date '2024-01-01' + n, 'YYYY-MM-DD'), 'CLOSED', $3
       FROM generate_series(0, 364) n ON CONFLICT DO NOTHING`,
      [ORG, STATION, MANAGER],
    );
    await sql.unsafe(
      `INSERT INTO customer_transactions (id, business_day_id, customer_id, transaction_type, amount)
       SELECT gen_random_uuid(), bd.id, $1, 'Credit Sale', 10
       FROM generate_series(1, 10000) n
       JOIN business_days bd ON bd.organization_id = $2
         AND bd.station_id = $3
         AND bd.business_date = to_char(date '2024-01-01' + ((n - 1) % 365), 'YYYY-MM-DD')`,
      [RANGE_CUSTOMER, ORG, STATION],
    );
    await sql.unsafe(
      `INSERT INTO collections (id, document_number, organization_id, station_id, entry_date,
         customer_id, amount, payment_method, funding_account_id)
       SELECT gen_random_uuid(), 'COL-EXPLAIN-' || n, $1, $2,
         to_char(date '2024-01-01' + ((n - 1) % 365), 'YYYY-MM-DD'), $3, 10, 'Cash', $4
       FROM generate_series(1, 10000) n`,
      [ORG, STATION, RANGE_CUSTOMER, CASH],
    );
    await sql.unsafe(
      `INSERT INTO supplier_transactions (id, organization_id, station_id, entry_date, supplier_id,
         transaction_type, amount)
       SELECT gen_random_uuid(), $1, $2,
         to_char(date '2024-01-01' + ((n - 1) % 365), 'YYYY-MM-DD'), $3, 'Purchase', 10
       FROM generate_series(1, 10000) n`,
      [ORG, STATION, RANGE_SUPPLIER],
    );
    await sql.unsafe('ANALYZE business_days');
    await sql.unsafe('ANALYZE customer_transactions');
    await sql.unsafe('ANALYZE collections');
    await sql.unsafe('ANALYZE supplier_transactions');

    const plans = await Promise.all([
      sql.unsafe(
        `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
         SELECT ct.id FROM customer_transactions ct
         JOIN business_days bd ON bd.id = ct.business_day_id AND bd.organization_id = $1
         WHERE bd.organization_id = $1 AND bd.business_date BETWEEN $2 AND $3 AND ct.customer_id = $4`,
        [ORG, '2024-06-01', '2024-06-02', RANGE_CUSTOMER],
      ),
      sql.unsafe(
        `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
         SELECT co.id FROM collections co
         WHERE co.organization_id = $1 AND co.customer_id = $2 AND co.entry_date BETWEEN $3 AND $4`,
        [ORG, RANGE_CUSTOMER, '2024-06-01', '2024-06-02'],
      ),
      sql.unsafe(
        `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
         SELECT st.id FROM supplier_transactions st
         WHERE st.organization_id = $1 AND st.supplier_id = $2 AND st.entry_date BETWEEN $3 AND $4`,
        [ORG, RANGE_SUPPLIER, '2024-06-01', '2024-06-02'],
      ),
    ]);
    const planText = plans.map((plan) => plan.map((row: any) => row['QUERY PLAN']).join('\n'));
    console.info('\nParty ledger EXPLAIN (trimmed):\n' + planText.join('\n---\n'));
    expect(planText[0]).toContain('business_days_org_business_date_idx');
    expect(planText[0]).toContain('customer_txn_customer_business_day_created_idx');
    expect(planText[1]).toContain('collections_org_customer_entry_date_idx');
    expect(planText[2]).toContain('supplier_transactions_org_supplier_entry_date_idx');
  }, 30_000);

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
      customerId: RANGE_CUSTOMER,
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
