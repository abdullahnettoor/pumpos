import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { schema, type DbClient } from '@pump/db';
import { PAYABLES_PRODUCT_LIMIT, PAYABLES_SUPPLIER_LIMIT } from '@pump/shared';
import type { PayablesQuery, SupplierPayableQuery } from '@pump/core';
import { DrizzlePayablesReader } from '../payables-repositories.js';
import { DrizzleSupplierLedgerReader } from '../party-ledger-readers.js';

/**
 * The payables reader against a real Postgres.
 *
 * Core and the route are tested with fakes; what a fake cannot prove is what the
 * SQL promises: that a Supplier Payment or credit Adjustment settles the OLDEST
 * open payable first (partial payments, overpayment = advance, Opening Balance
 * taking its turn), that the unpaid count and oldest unpaid date look at
 * Purchases only, this month's purchased/paid by their own anchors, purchases by
 * product (and litres only for litre products), the last payment's raw Funding
 * Account type, that the list never shows an advance and the single read does,
 * that another Organization's rows never surface, and that the list balance is
 * exactly what the suppliers list and the statement say. A randomised ledger is
 * also checked against a plain-JS FIFO so the window-function arithmetic and the
 * textbook version cannot drift.
 *
 * Runs only when TEST_DATABASE_URL is set (CI provides a service container).
 * Everything lives in a dedicated schema that is dropped afterwards.
 */

const CONNECTION = process.env.TEST_DATABASE_URL;
const TEST_SCHEMA = 'payables_it';

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const ORG = id(1);
const OTHER_ORG = id(2);
const BIG_ORG = id(3);
const STATION = id(10);
const SIBLING = id(11); // same organization, second station
const OTHER_STATION = id(12);
const BIG_STATION = id(13);
const USER = id(20);
const OTHER_USER = id(21);
const BIG_USER = id(22);
const DIESEL = id(30); // sold in litres
const PETROL = id(31); // sold in litres
const LUBE = id(32); // sold in units
const OTHER_DIESEL = id(33);
const BANK_ACCOUNT = id(40);
const CASH_ACCOUNT = id(41);
const OTHER_BANK_ACCOUNT = id(42);
const BIG_BANK_ACCOUNT = id(43);

/** The Current Business Date the list is read on. */
const TODAY = '2026-10-30';
const MONTH = { from: '2026-10-01', to: '2026-10-31' };

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

let seq = 1000;
const nextId = () => id(seq++);
/** Strictly increasing creation time, so "same day" rows have a defined order. */
let tick = Date.UTC(2026, 0, 1);
const nextCreatedAt = () => new Date((tick += 1000));

const listQuery = (over: Partial<PayablesQuery> = {}): PayablesQuery => ({
  organizationId: ORG,
  purchasedFrom: MONTH.from,
  purchasedTo: MONTH.to,
  paidFrom: MONTH.from,
  paidTo: MONTH.to,
  ...over,
});
const supplierQuery = (
  supplierId: string,
  over: Partial<SupplierPayableQuery> = {},
): SupplierPayableQuery => ({ ...listQuery(), supplierId, ...over });

type TxnType = 'Purchase' | 'Payment' | 'Adjustment' | 'Opening Balance';

describe.skipIf(!CONNECTION)('Payables reader against real Postgres', () => {
  let sql: postgres.Sql;
  let db: DbClient;
  let reader: DrizzlePayablesReader;
  const dayIds = new Map<string, string>(); // `${org}|${station}|${date}` -> business day id

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
      max: 4,
      onnotice: () => {},
      connection: { search_path: TEST_SCHEMA },
    });
    db = drizzle(sql, { schema }) as unknown as DbClient;
    reader = new DrizzlePayablesReader(db);

    await db.insert(schema.organizations).values([
      { id: ORG, name: 'Tenant A' },
      { id: OTHER_ORG, name: 'Tenant B' },
      { id: BIG_ORG, name: 'Tenant Big' },
    ]);
    await db.insert(schema.stations).values([
      { id: STATION, organizationId: ORG, name: 'Station A', code: 'STA' },
      { id: SIBLING, organizationId: ORG, name: 'Sibling', code: 'STS' },
      { id: OTHER_STATION, organizationId: OTHER_ORG, name: 'Station B', code: 'STB' },
      { id: BIG_STATION, organizationId: BIG_ORG, name: 'Station Big', code: 'STG' },
    ]);
    await db.insert(schema.users).values([
      { id: USER, organizationId: ORG, fullName: 'Owner', role: 'Owner' },
      { id: OTHER_USER, organizationId: OTHER_ORG, fullName: 'Other', role: 'Owner' },
      { id: BIG_USER, organizationId: BIG_ORG, fullName: 'Big', role: 'Owner' },
    ]);
    await db.insert(schema.products).values([
      {
        id: DIESEL,
        organizationId: ORG,
        name: 'Diesel',
        code: 'HSD',
        productType: 'FUEL',
        unit: 'L',
      },
      {
        id: PETROL,
        organizationId: ORG,
        name: 'Petrol',
        code: 'MS',
        productType: 'FUEL',
        unit: 'L',
      },
      {
        id: LUBE,
        organizationId: ORG,
        name: 'Oil 1L',
        code: 'OIL',
        productType: 'LUBRICANT',
        unit: 'Nos',
      },
      {
        id: OTHER_DIESEL,
        organizationId: OTHER_ORG,
        name: 'Diesel',
        code: 'HSD',
        productType: 'FUEL',
        unit: 'L',
      },
    ] as never);
    await db.insert(schema.financialAccounts).values([
      { id: BANK_ACCOUNT, organizationId: ORG, accountType: 'BANK', name: 'SBI current a/c' },
      { id: CASH_ACCOUNT, organizationId: ORG, accountType: 'CASH_IN_HAND', name: 'Cash' },
      {
        id: OTHER_BANK_ACCOUNT,
        organizationId: OTHER_ORG,
        accountType: 'BANK',
        name: 'Other bank',
      },
      { id: BIG_BANK_ACCOUNT, organizationId: BIG_ORG, accountType: 'BANK', name: 'Big bank' },
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

  async function businessDay(org: string, station: string, openedBy: string, date: string) {
    const key = `${org}|${station}|${date}`;
    const known = dayIds.get(key);
    if (known) return known;
    const dayId = nextId();
    await db.insert(schema.businessDays).values({
      id: dayId,
      organizationId: org,
      stationId: station,
      businessDate: date,
      status: 'CLOSED',
      openedBy,
    });
    dayIds.set(key, dayId);
    return dayId;
  }

  async function supplier(
    name: string,
    over: Partial<{ org: string; isActive: boolean }> = {},
  ): Promise<string> {
    const supplierId = nextId();
    await db.insert(schema.suppliers).values({
      id: supplierId,
      organizationId: over.org ?? ORG,
      name,
      isActive: over.isActive ?? true,
    });
    return supplierId;
  }

  interface Line {
    product: string;
    quantity: number;
    value: number;
  }

  /**
   * A Purchase: the purchases header (+ items) on the Business Day of `date`, and
   * its payable on the supplier ledger (`entry_date` = that Business Date).
   * Without `lines` the ledger row is a bare payable, as an imported one is.
   */
  async function purchase(
    supplierId: string,
    date: string,
    amount: number,
    over: Partial<{
      lines: Line[];
      invoice: string;
      org: string;
      station: string;
      user: string;
    }> = {},
  ) {
    const org = over.org ?? ORG;
    const station = over.station ?? STATION;
    const purchaseId = nextId();
    if (over.lines) {
      const dayId = await businessDay(org, station, over.user ?? USER, date);
      await db.insert(schema.purchases).values({
        id: purchaseId,
        documentNumber: `PUR-${purchaseId.slice(-6)}`,
        businessDayId: dayId,
        supplierId,
        invoiceNumber: over.invoice ?? null,
        amount: String(amount),
      });
      await db.insert(schema.purchaseItems).values(
        over.lines.map((l) => ({
          purchaseId,
          productId: l.product,
          quantity: String(l.quantity),
          unitPrice: String(l.value / l.quantity),
          taxableAmount: String(l.value),
          lineTotal: String(l.value),
        })),
      );
    }
    await ledger(supplierId, date, amount, {
      type: 'Purchase',
      org,
      station,
      refId: over.lines ? purchaseId : null,
    });
    return purchaseId;
  }

  async function ledger(
    supplierId: string,
    date: string,
    amount: number,
    over: Partial<{
      type: TxnType;
      org: string;
      station: string;
      account: string | null;
      refId: string | null;
    }> = {},
  ) {
    const type = over.type ?? 'Purchase';
    await db.insert(schema.supplierTransactions).values({
      organizationId: over.org ?? ORG,
      stationId: over.station ?? STATION,
      entryDate: date,
      supplierId,
      transactionType: type,
      amount: String(amount),
      fundingAccountId: type === 'Payment' ? (over.account ?? BANK_ACCOUNT) : null,
      referenceType: over.refId ? 'PURCHASE' : null,
      referenceId: over.refId ?? null,
      createdAt: nextCreatedAt(),
    });
  }

  const pay = (
    supplierId: string,
    date: string,
    amount: number,
    over: Partial<{ account: string; org: string; station: string }> = {},
  ) => ledger(supplierId, date, amount, { type: 'Payment', ...over });

  const row = async (supplierId: string, query = listQuery()) =>
    (await reader.summary(query)).suppliers.find((s) => s.supplierId === supplierId);

  describe('FIFO settlement', () => {
    it('settles the oldest Purchase first (partial payment) and counts what is left unpaid', async () => {
      const s = await supplier('Partial');
      await purchase(s, '2026-10-01', 100);
      await purchase(s, '2026-10-10', 100);
      await purchase(s, '2026-10-20', 100);
      await pay(s, '2026-10-25', 150);

      // 100 settles 1 Oct, 50 of 10 Oct: the 10 Oct and 20 Oct Purchases are still unpaid.
      expect(await row(s)).toEqual({
        supplierId: s,
        balance: 150,
        unpaidCount: 2,
        oldestUnpaidDate: '2026-10-10',
      });
    });

    it('is settled when every Purchase is paid in full, in any number of payments', async () => {
      const s = await supplier('Paid up');
      await purchase(s, '2026-10-01', 100);
      await purchase(s, '2026-10-05', 50);
      await pay(s, '2026-10-06', 60);
      await pay(s, '2026-10-07', 90);
      expect(await row(s)).toBeUndefined();
      const one = await reader.supplier(supplierQuery(s));
      expect(one?.payable).toEqual({
        supplierId: s,
        balance: 0,
        unpaidCount: 0,
        oldestUnpaidDate: null,
      });
    });

    it('leaves an overpayment as an advance: never on the list, a negative balance on the supplier', async () => {
      const s = await supplier('Advance');
      await purchase(s, '2026-10-01', 100);
      await pay(s, '2026-10-02', 250);

      const summary = await reader.summary(listQuery());
      expect(summary.suppliers.map((x) => x.supplierId)).not.toContain(s);

      const one = await reader.supplier(supplierQuery(s));
      expect(one?.payable).toEqual({
        supplierId: s,
        balance: -150,
        unpaidCount: 0,
        oldestUnpaidDate: null,
      });
    });

    it('lets an advance paid before the Purchase settle it, and a later Purchase start a new payable', async () => {
      const s = await supplier('Paid ahead');
      await pay(s, '2026-10-01', 100);
      await purchase(s, '2026-10-05', 100);
      expect(await row(s)).toBeUndefined();
      await purchase(s, '2026-10-12', 70);
      expect(await row(s)).toEqual({
        supplierId: s,
        balance: 70,
        unpaidCount: 1,
        oldestUnpaidDate: '2026-10-12',
      });
    });

    it('counts a negative Adjustment as a credit and a positive one as a debit', async () => {
      const s = await supplier('Adjusted');
      await purchase(s, '2026-10-01', 100);
      await ledger(s, '2026-10-02', -30, { type: 'Adjustment' });
      await ledger(s, '2026-10-03', 20, { type: 'Adjustment' });
      // Debits 100 + 20 against credits 30: 90 owed; the Adjustment takes its turn after the Purchase.
      expect(await row(s)).toMatchObject({
        balance: 90,
        unpaidCount: 1,
        oldestUnpaidDate: '2026-10-01',
      });
    });

    it('lets an Opening Balance take its turn in the FIFO without being "an unpaid Purchase"', async () => {
      const s = await supplier('Opening');
      await ledger(s, '2026-09-01', 100, { type: 'Opening Balance' });
      await purchase(s, '2026-10-05', 40);
      await pay(s, '2026-10-06', 100);
      // The payment clears the Opening Balance first; the Purchase is still unpaid.
      expect(await row(s)).toEqual({
        supplierId: s,
        balance: 40,
        unpaidCount: 1,
        oldestUnpaidDate: '2026-10-05',
      });

      const only = await supplier('Only opening');
      await ledger(only, '2026-09-01', 100, { type: 'Opening Balance' });
      // Owed, but there is no Purchase to call unpaid: no count, no date.
      expect(await row(only)).toEqual({
        supplierId: only,
        balance: 100,
        unpaidCount: 0,
        oldestUnpaidDate: null,
      });
    });

    it('is the same balance the suppliers list and the statement show: debits minus credits, across stations', async () => {
      const s = await supplier('Across stations');
      await purchase(s, '2026-10-01', 500, { station: STATION });
      await purchase(s, '2026-10-02', 300, { station: SIBLING });
      await pay(s, '2026-10-03', 200, { station: SIBLING });
      expect((await row(s))?.balance).toBe(600);
      const statement = await new DrizzleSupplierLedgerReader(db).statement(ORG, s, {
        from: '2026-01-01',
        to: '9999-12-31',
      });
      expect(Number(statement.closingBalance)).toBe(600);
    });

    it('orders same-day Purchases by creation time', async () => {
      const s = await supplier('Same day');
      await purchase(s, '2026-10-10', 100);
      await purchase(s, '2026-10-10', 60);
      await pay(s, '2026-10-11', 120);
      // 100 settles the first, 20 of the second: one still unpaid.
      expect(await row(s)).toMatchObject({ balance: 40, unpaidCount: 1 });
    });
  });

  describe('list totals', () => {
    it('totals every supplier that is owed, largest balance first, active suppliers only', async () => {
      const org = OTHER_ORG;
      const a = await supplier('Small', { org });
      const b = await supplier('Large', { org });
      const c = await supplier('Archived', { org, isActive: false });
      for (const [sup, amount] of [
        [a, 100],
        [b, 900],
        [c, 5000],
      ] as const) {
        await ledger(sup, '2026-10-02', amount, { org, station: OTHER_STATION });
      }
      await ledger(b, '2026-10-03', 50, {
        type: 'Payment',
        org,
        station: OTHER_STATION,
        account: OTHER_BANK_ACCOUNT,
      });
      const summary = await reader.summary(listQuery({ organizationId: org }));
      expect(summary.supplierCount).toBe(2);
      expect(summary.total).toBe(950);
      expect(summary.suppliers.map((x) => x.supplierId)).toEqual([b, a]);
      // This month's flow covers the same (active) suppliers.
      expect(summary.month).toEqual({ purchased: 1000, paid: 50 });
    });

    it('leaves an archived supplier out of the list but still reads it on its own', async () => {
      const s = await supplier('Archived solo', { isActive: false });
      await purchase(s, '2026-10-02', 70);
      expect(await row(s)).toBeUndefined();
      const one = await reader.supplier(supplierQuery(s));
      expect(one?.payable.balance).toBe(70);
    });
  });

  describe('tenant scoping', () => {
    it('never mixes in another organization, nor lets a foreign payment settle a Purchase', async () => {
      const mine = await supplier('Mine');
      await purchase(mine, '2026-10-02', 100);
      // Same supplier id referenced from a foreign ledger row must not count.
      await db.insert(schema.supplierTransactions).values({
        organizationId: OTHER_ORG,
        stationId: OTHER_STATION,
        entryDate: '2026-10-03',
        supplierId: mine,
        transactionType: 'Payment',
        amount: '100',
        fundingAccountId: OTHER_BANK_ACCOUNT,
        createdAt: nextCreatedAt(),
      });
      const theirs = await supplier('Theirs', { org: OTHER_ORG });
      await ledger(theirs, '2026-10-02', 777, { org: OTHER_ORG, station: OTHER_STATION });

      expect(await row(mine)).toMatchObject({ balance: 100, unpaidCount: 1 });
      const summary = await reader.summary(listQuery());
      expect(summary.suppliers.map((x) => x.supplierId)).not.toContain(theirs);
    });

    it('answers null for a supplier of another organization', async () => {
      const theirs = await supplier('Foreign', { org: OTHER_ORG });
      expect(await reader.supplier(supplierQuery(theirs))).toBeNull();
      expect(await reader.supplier(supplierQuery(id(999999)))).toBeNull();
    });
  });

  describe('single supplier', () => {
    it('reports the last payment (latest Entry Date) with the raw Funding Account type and name', async () => {
      const s = await supplier('Last payment');
      await purchase(s, '2026-10-01', 500);
      await pay(s, '2026-10-03', 50, { account: CASH_ACCOUNT });
      await pay(s, '2026-10-06', 80, { account: BANK_ACCOUNT });
      await pay(s, '2026-10-04', 10, { account: CASH_ACCOUNT });
      const one = await reader.supplier(supplierQuery(s));
      expect(one?.lastPayment).toEqual({
        amount: 80,
        entryDate: '2026-10-06',
        method: 'BANK',
        fundingAccountName: 'SBI current a/c',
      });
    });

    it('has no last payment before the first one', async () => {
      const s = await supplier('Never paid');
      await purchase(s, '2026-10-01', 500);
      expect((await reader.supplier(supplierQuery(s)))?.lastPayment).toBeNull();
    });

    it('sums this month: purchased, paid, purchase count and litres (litre products only)', async () => {
      const s = await supplier('Month');
      await purchase(s, '2026-10-02', 1000, {
        lines: [
          { product: DIESEL, quantity: 12000, value: 600 },
          { product: PETROL, quantity: 10000, value: 400 },
        ],
      });
      await purchase(s, '2026-10-12', 250, {
        lines: [{ product: LUBE, quantity: 50, value: 250 }],
      });
      await purchase(s, '2026-09-30', 9000, {
        lines: [{ product: DIESEL, quantity: 99, value: 9000 }],
      });
      await pay(s, '2026-10-05', 300);
      await pay(s, '2026-09-29', 7000);
      const one = await reader.supplier(supplierQuery(s));
      expect(one?.month).toEqual({
        purchased: 1250,
        paid: 300,
        purchaseCount: 2,
        quantity: 22000,
      });
    });

    it('measures purchased and paid by their own ranges (Business Date vs Entry Date)', async () => {
      const s = await supplier('Month anchors');
      await purchase(s, '2026-10-31', 100);
      await pay(s, '2026-11-01', 60);
      const one = await reader.supplier(
        supplierQuery(s, { paidFrom: '2026-11-01', paidTo: '2026-11-30' }),
      );
      expect(one?.month).toMatchObject({ purchased: 100, purchaseCount: 1, paid: 60 });
    });

    it('lists purchases by product this month, largest value first, with quantity', async () => {
      const s = await supplier('By product');
      const other = await supplier('Other supplier');
      await purchase(s, '2026-10-02', 700, {
        lines: [
          { product: DIESEL, quantity: 8000, value: 500 },
          { product: LUBE, quantity: 20, value: 200 },
        ],
      });
      await purchase(s, '2026-10-09', 300, {
        lines: [{ product: DIESEL, quantity: 4000, value: 300 }],
      });
      await purchase(s, '2026-09-20', 9000, {
        lines: [{ product: PETROL, quantity: 1, value: 9000 }],
      });
      await purchase(other, '2026-10-09', 8000, {
        lines: [{ product: PETROL, quantity: 1, value: 8000 }],
      });
      const one = await reader.supplier(supplierQuery(s));
      expect(one?.purchasesByProduct).toEqual([
        { productId: DIESEL, name: 'Diesel', unit: 'L', quantity: 12000, value: 800 },
        { productId: LUBE, name: 'Oil 1L', unit: 'Nos', quantity: 20, value: 200 },
      ]);
    });

    it('caps the products at the limit while the month total still covers every purchase', async () => {
      const s = await supplier('Many products');
      const extra = PAYABLES_PRODUCT_LIMIT + 3;
      const ids = Array.from({ length: extra }, () => nextId());
      await db.insert(schema.products).values(
        ids.map((pid, i) => ({
          id: pid,
          organizationId: ORG,
          name: `Item ${String(i).padStart(2, '0')}`,
          code: `IT${i}`,
          productType: 'LUBRICANT',
          unit: 'Nos',
        })),
      );
      await purchase(s, '2026-10-02', 0, {
        lines: ids.map((pid, i) => ({ product: pid, quantity: 1, value: 10 + i })),
      });
      const one = await reader.supplier(supplierQuery(s));
      expect(one?.purchasesByProduct).toHaveLength(PAYABLES_PRODUCT_LIMIT);
      expect(one?.purchasesByProduct[0].value).toBe(10 + extra - 1);
    });

    it('reads a supplier with no activity as nothing owed and nothing to show', async () => {
      const s = await supplier('Brand new');
      const one = await reader.supplier(supplierQuery(s));
      expect(one).toEqual({
        payable: { supplierId: s, balance: 0, unpaidCount: 0, oldestUnpaidDate: null },
        lastPayment: null,
        month: { purchased: 0, paid: 0, purchaseCount: 0, quantity: 0 },
        purchasesByProduct: [],
      });
    });
  });

  describe('enriched statement (the ranged supplier ledger)', () => {
    it('carries the invoice, quantity and product on a Purchase, and the raw method and account on a Payment', async () => {
      const s = await supplier('Statement');
      await purchase(s, '2026-10-09', 1043200, {
        invoice: 'INV-55821',
        lines: [{ product: DIESEL, quantity: 12000, value: 1043200 }],
      });
      await pay(s, '2026-10-10', 980000, { account: BANK_ACCOUNT });
      const statement = await new DrizzleSupplierLedgerReader(db).statement(ORG, s, {
        from: '2026-10-01',
        to: '2026-10-31',
      });
      const [buy, paid] = statement.entries;
      expect(buy).toMatchObject({
        transactionType: 'Purchase',
        businessDate: '2026-10-09',
        invoiceNumber: 'INV-55821',
        productName: 'Diesel',
        unit: 'L',
        quantity: 12000,
        tankerNumber: null,
        method: null,
      });
      expect(paid).toMatchObject({
        transactionType: 'Payment',
        businessDate: '2026-10-10',
        method: 'BANK',
        fundingAccountName: 'SBI current a/c',
        runningBalance: '63200.00',
      });
      expect(statement.hasEarlier).toBe(false);
    });

    it('says there is something earlier even when it nets to nothing', async () => {
      const s = await supplier('Earlier');
      await purchase(s, '2026-05-02', 100);
      await pay(s, '2026-05-03', 100);
      await purchase(s, '2026-10-02', 30);
      const statement = await new DrizzleSupplierLedgerReader(db).statement(ORG, s, {
        from: '2026-10-01',
        to: '9999-12-31',
      });
      expect(statement).toMatchObject({ periodOpeningBalance: '0.00', hasEarlier: true });
      expect(statement.entries).toHaveLength(1);
    });
  });

  describe('against a plain-JS FIFO', () => {
    /** The textbook version: walk the debits oldest first, spend the credit pool on each. */
    function oracle(
      debits: Array<{ date: string; amount: number; purchase: boolean }>,
      credits: number,
    ) {
      let pool = credits;
      let balance = 0;
      let unpaid = 0;
      let oldest: string | null = null;
      for (const d of debits) {
        const paid = Math.min(pool, d.amount);
        pool -= paid;
        const open = d.amount - paid;
        if (open <= 0) continue;
        balance += open;
        if (!d.purchase) continue;
        unpaid += 1;
        oldest ??= d.date;
      }
      return { balance, unpaid, oldest };
    }

    it('agrees on 40 random ledgers', async () => {
      let state = 20261031;
      const rand = (n: number) => {
        state = (state * 1103515245 + 12345) & 0x7fffffff;
        return state % n;
      };
      const date = () => new Date(Date.UTC(2026, 7, 1 + rand(90))).toISOString().slice(0, 10);

      const cases: Array<{
        supplierId: string;
        debits: Array<{ date: string; amount: number; purchase: boolean; at: number }>;
        credits: number;
      }> = [];
      for (let i = 0; i < 40; i++) {
        const s = await supplier(`Random ${i}`);
        const debits: Array<{ date: string; amount: number; purchase: boolean; at: number }> = [];
        let credits = 0;
        for (let k = 0; k < 2 + rand(8); k++) {
          const d = date();
          const amount = 10 + rand(500);
          const opening = rand(5) === 0;
          await ledger(s, d, amount, { type: opening ? 'Opening Balance' : 'Purchase' });
          debits.push({ date: d, amount, purchase: !opening, at: tick });
        }
        for (let k = 0; k < rand(5); k++) {
          const d = date();
          const amount = 10 + rand(400);
          if (rand(4) === 0) await ledger(s, d, -amount, { type: 'Adjustment' });
          else await pay(s, d, amount);
          credits += amount;
        }
        debits.sort((a, b) => a.date.localeCompare(b.date) || a.at - b.at);
        cases.push({ supplierId: s, debits, credits });
      }

      const summary = await reader.summary(listQuery());
      for (const { supplierId, debits, credits } of cases) {
        const expected = oracle(debits, credits);
        const got = summary.suppliers.find((x) => x.supplierId === supplierId);
        if (expected.balance <= 0) {
          expect(got).toBeUndefined();
          continue;
        }
        expect(got?.balance).toBeCloseTo(expected.balance, 2);
        expect(got?.unpaidCount).toBe(expected.unpaid);
        expect(got?.oldestUnpaidDate ?? null).toBe(expected.oldest);
        const one = await reader.supplier(supplierQuery(supplierId));
        expect(one?.payable).toEqual(got);
      }
    }, 120_000);
  });

  describe('bounded list', () => {
    it('returns at most the supplier limit while the total still covers everyone', async () => {
      const total = PAYABLES_SUPPLIER_LIMIT + 25;
      const ids = Array.from({ length: total }, () => nextId());
      await db.insert(schema.suppliers).values(
        ids.map((supplierId, i) => ({
          id: supplierId,
          organizationId: BIG_ORG,
          name: `Bulk ${i}`,
        })),
      );
      await db.insert(schema.supplierTransactions).values(
        ids.map((supplierId, i) => ({
          organizationId: BIG_ORG,
          stationId: BIG_STATION,
          entryDate: '2026-10-20',
          supplierId,
          transactionType: 'Purchase',
          amount: String(100 + i),
        })),
      );
      const summary = await reader.summary(listQuery({ organizationId: BIG_ORG }));
      expect(summary.supplierCount).toBe(total);
      expect(summary.suppliers).toHaveLength(PAYABLES_SUPPLIER_LIMIT);
      // Largest first, so the 25 smallest balances fall off the list, not the total.
      expect(summary.suppliers[0].balance).toBe(100 + total - 1);
      expect(summary.total).toBe(ids.reduce((n, _, i) => n + 100 + i, 0));
    }, 60_000);
  });
});
