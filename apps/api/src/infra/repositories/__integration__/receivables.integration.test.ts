import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { schema, type DbClient } from '@pump/db';
import {
  RECEIVABLES_CUSTOMER_LIMIT,
  RECEIVABLES_SETTLED_SAMPLE,
  businessDateDiffDays,
} from '@pump/shared';
import type { CustomerReceivableQuery, ReceivablesQuery } from '@pump/core';
import { DrizzleReceivablesReader } from '../receivables-repositories.js';

/**
 * The receivables reader against a real Postgres.
 *
 * Core and the route are tested with fakes; what a fake cannot prove is what the
 * SQL promises: that a Collection or credit Adjustment settles the OLDEST open
 * debit first (partial payments, overpayment, opening balance, adjustments), that
 * the age buckets cut at 7/8 and 30/31 days, that OMC fleet-card sales and legacy
 * 'Collection' rows never count, that a debit's age is measured to the Current
 * Business Date we pass in, "usually pays in" over the last settled Credit Sales,
 * this month's figures and vehicle spend, and that another Organization's rows
 * never surface. A randomised ledger is also checked against a plain-JS FIFO
 * so the window-function arithmetic and the textbook version cannot drift.
 *
 * Runs only when TEST_DATABASE_URL is set (CI provides a service container).
 * Everything lives in a dedicated schema that is dropped afterwards.
 */

const CONNECTION = process.env.TEST_DATABASE_URL;
const TEST_SCHEMA = 'receivables_it';

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
const FUEL = id(30); // sold in litres
const LUBE = id(31); // sold in units
const OTHER_FUEL = id(32);
const FUEL_LTR = id(33); // fuel whose unit was typed 'Ltr'
const BULK_OIL = id(34); // not fuel, though its unit is 'L'
const CASH_ACCOUNT = id(40);
const OTHER_CASH_ACCOUNT = id(41);
const BIG_CASH_ACCOUNT = id(42);

/** The Current Business Date every age is measured to. */
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

const summaryQuery = (over: Partial<ReceivablesQuery> = {}): ReceivablesQuery => ({
  organizationId: ORG,
  currentBusinessDate: TODAY,
  ...over,
});
const customerQuery = (
  customerId: string,
  over: Partial<CustomerReceivableQuery> = {},
): CustomerReceivableQuery => ({
  ...summaryQuery(),
  customerId,
  creditFrom: MONTH.from,
  creditTo: MONTH.to,
  paidFrom: MONTH.from,
  paidTo: MONTH.to,
  ...over,
});

type TxnType = 'Credit Sale' | 'Opening Balance' | 'Adjustment' | 'OMC Sale' | 'Collection';

describe.skipIf(!CONNECTION)('Receivables reader against real Postgres', () => {
  let sql: postgres.Sql;
  let db: DbClient;
  let reader: DrizzleReceivablesReader;
  const dayIds = new Map<string, string>(); // `${org}|${station}|${date}` -> business day id

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
    reader = new DrizzleReceivablesReader(db);

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
        id: FUEL,
        organizationId: ORG,
        name: 'Diesel',
        code: 'HSD',
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
        id: FUEL_LTR,
        organizationId: ORG,
        name: 'Speed diesel',
        code: 'XHSD',
        productType: 'FUEL',
        unit: 'Ltr',
      },
      {
        id: BULK_OIL,
        organizationId: ORG,
        name: 'Bulk engine oil',
        code: 'BOIL',
        productType: 'LUBRICANT',
        unit: 'L',
      },
      {
        id: OTHER_FUEL,
        organizationId: OTHER_ORG,
        name: 'Diesel',
        code: 'HSD',
        productType: 'FUEL',
        unit: 'L',
      },
    ] as never);
    await db.insert(schema.financialAccounts).values([
      { id: CASH_ACCOUNT, organizationId: ORG, accountType: 'CASH_IN_HAND', name: 'Cash' },
      {
        id: OTHER_CASH_ACCOUNT,
        organizationId: OTHER_ORG,
        accountType: 'CASH_IN_HAND',
        name: 'Cash',
      },
      { id: BIG_CASH_ACCOUNT, organizationId: BIG_ORG, accountType: 'CASH_IN_HAND', name: 'Cash' },
    ]);
  }, 60_000);

  afterAll(async () => {
    if (sql) {
      await sql.unsafe('select pg_advisory_lock(872635)');
      await sql.unsafe(`drop schema if exists ${TEST_SCHEMA} cascade`);
      await sql.unsafe('select pg_advisory_unlock(872635)');
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

  async function customer(
    name: string,
    over: Partial<{ org: string; isActive: boolean; settlementCycle: string }> = {},
  ) {
    const customerId = nextId();
    await db.insert(schema.customers).values({
      id: customerId,
      organizationId: over.org ?? ORG,
      customerType: 'Fleet',
      name,
      isActive: over.isActive ?? true,
      settlementCycle: over.settlementCycle ?? 'OPEN',
    });
    return customerId;
  }

  async function vehicle(customerId: string, registration: string, type = 'Truck', org = ORG) {
    const vehicleId = nextId();
    await db.insert(schema.customerVehicles).values({
      id: vehicleId,
      organizationId: org,
      customerId,
      registrationNumber: registration,
      vehicleType: type,
    });
    return vehicleId;
  }

  /** A customer-ledger row on the Business Day of `date` (default station A, tenant A). */
  async function txn(
    customerId: string,
    date: string,
    amount: number,
    over: Partial<{
      type: TxnType;
      quantity: number;
      productId: string;
      vehicleId: string;
      station: string;
      org: string;
      user: string;
    }> = {},
  ) {
    const org = over.org ?? ORG;
    const dayId = await businessDay(org, over.station ?? STATION, over.user ?? USER, date);
    await db.insert(schema.customerTransactions).values({
      businessDayId: dayId,
      customerId,
      transactionType: over.type ?? 'Credit Sale',
      amount: String(amount),
      quantity: over.quantity === undefined ? null : String(over.quantity),
      productId: over.productId ?? null,
      vehicleId: over.vehicleId ?? null,
      createdAt: nextCreatedAt(),
    });
  }

  async function collect(
    customerId: string,
    entryDate: string,
    amount: number,
    over: Partial<{ method: string; org: string; account: string; station: string }> = {},
  ) {
    await db.insert(schema.collections).values({
      documentNumber: `COL-${seq}`,
      organizationId: over.org ?? ORG,
      stationId: over.station ?? STATION,
      entryDate,
      customerId,
      amount: String(amount),
      paymentMethod: over.method ?? 'CASH',
      fundingAccountId: over.account ?? CASH_ACCOUNT,
      createdAt: nextCreatedAt(),
    });
    seq += 1;
  }

  const row = async (customerId: string, query = summaryQuery()) =>
    (await reader.summary(query)).customers.find((c) => c.customerId === customerId);

  describe('FIFO settlement', () => {
    it('settles the oldest debit first and ages what is left (partial payment)', async () => {
      const c = await customer('Partial');
      await txn(c, '2026-10-01', 100);
      await txn(c, '2026-10-10', 100);
      await txn(c, '2026-10-20', 100);
      await collect(c, '2026-10-25', 150);

      // 100 settles 1 Oct, 50 of 10 Oct: left 50 (age 20) + 100 (age 10).
      expect(await row(c)).toEqual({
        customerId: c,
        balance: 150,
        oldestUnpaidDate: '2026-10-10',
        aging: { d0_7: 0, d8_30: 150, d30plus: 0 },
      });
    });

    it('reads no receivable for a fully settled or overpaid (advance) customer', async () => {
      const paid = await customer('Paid up');
      await txn(paid, '2026-10-01', 100);
      await collect(paid, '2026-10-02', 100);
      const advance = await customer('Advance');
      await txn(advance, '2026-10-01', 100);
      await collect(advance, '2026-10-02', 250);

      const summary = await reader.summary(summaryQuery());
      expect(summary.customers.map((x) => x.customerId)).not.toContain(paid);
      expect(summary.customers.map((x) => x.customerId)).not.toContain(advance);

      const one = await reader.customer(customerQuery(advance));
      expect(one?.receivable).toEqual({
        customerId: advance,
        balance: 0,
        oldestUnpaidDate: null,
        aging: { d0_7: 0, d8_30: 0, d30plus: 0 },
      });
    });

    it('lets an advance paid before the sale settle it, and a later sale starts a new debt', async () => {
      const c = await customer('Prepaid then buys');
      await collect(c, '2026-10-01', 100);
      await txn(c, '2026-10-05', 60);
      await txn(c, '2026-10-06', 70);
      // 100 of advance covers 5 Oct (60) and 40 of 6 Oct: 30 left, aged from 6 Oct.
      expect(await row(c)).toMatchObject({
        balance: 30,
        oldestUnpaidDate: '2026-10-06',
        aging: { d0_7: 0, d8_30: 30, d30plus: 0 },
      });
    });

    it('counts a negative Adjustment as a credit and a positive one as a debit', async () => {
      const c = await customer('Adjusted');
      await txn(c, '2026-10-01', 100);
      await txn(c, '2026-10-10', 100);
      await txn(c, '2026-10-11', -120, { type: 'Adjustment' });
      await txn(c, '2026-10-28', 40, { type: 'Adjustment' });
      // credits 120: settle 1 Oct (100) + 20 of 10 Oct; open 80 (10 Oct) + 40 (28 Oct).
      expect(await row(c)).toMatchObject({
        balance: 120,
        oldestUnpaidDate: '2026-10-10',
        aging: { d0_7: 40, d8_30: 80, d30plus: 0 },
      });
    });

    it('ages an Opening Balance from its as-of date like any other debit', async () => {
      const c = await customer('Carried forward');
      await txn(c, '2026-08-01', 500, { type: 'Opening Balance' });
      await txn(c, '2026-10-28', 100);
      await collect(c, '2026-10-29', 200);
      // 200 off the opening 500: 300 left (90 days old) + 100 (2 days).
      expect(await row(c)).toMatchObject({
        balance: 400,
        oldestUnpaidDate: '2026-08-01',
        aging: { d0_7: 100, d8_30: 0, d30plus: 300 },
      });
    });

    it('keeps OMC fleet-card sales and legacy Collection rows out of the receivable', async () => {
      const c = await customer('Card fleet');
      await txn(c, '2026-10-10', 100);
      await txn(c, '2026-10-12', 900, { type: 'OMC Sale' });
      await txn(c, '2026-10-14', 50, { type: 'Collection' });
      expect(await row(c)).toMatchObject({ balance: 100, oldestUnpaidDate: '2026-10-10' });
    });

    it('is the same balance the customers list shows: debits minus credits, across stations', async () => {
      const c = await customer('Two stations');
      await txn(c, '2026-10-20', 300, { station: STATION });
      await txn(c, '2026-10-21', 200, { station: SIBLING });
      await collect(c, '2026-10-22', 100, { station: SIBLING });
      expect(await row(c)).toMatchObject({ balance: 400, oldestUnpaidDate: '2026-10-20' });
    });
  });

  describe('aging bucket edges', () => {
    it('cuts 0-7 / 8-30 / 30+ at 7|8 and 30|31 days from the Current Business Date', async () => {
      const c = await customer('Edges');
      // Ages: 0, 7 | 8, 30 | 31, 90 days before 2026-10-30. 10 each.
      for (const date of [
        '2026-10-30',
        '2026-10-23',
        '2026-10-22',
        '2026-09-30',
        '2026-09-29',
        '2026-08-01',
      ]) {
        expect(businessDateDiffDays(date, TODAY)).toBeGreaterThanOrEqual(0);
        await txn(c, date, 10);
      }
      expect(await row(c)).toMatchObject({
        balance: 60,
        oldestUnpaidDate: '2026-08-01',
        aging: { d0_7: 20, d8_30: 20, d30plus: 20 },
      });
    });

    it('measures to the Current Business Date it is given', async () => {
      const c = await customer('Moving now');
      await txn(c, '2026-10-20', 10);
      expect((await row(c, summaryQuery({ currentBusinessDate: '2026-10-27' })))?.aging).toEqual({
        d0_7: 10,
        d8_30: 0,
        d30plus: 0,
      });
      expect((await row(c, summaryQuery({ currentBusinessDate: '2026-10-28' })))?.aging).toEqual({
        d0_7: 0,
        d8_30: 10,
        d30plus: 0,
      });
      expect((await row(c, summaryQuery({ currentBusinessDate: '2026-11-20' })))?.aging).toEqual({
        d0_7: 0,
        d8_30: 0,
        d30plus: 10,
      });
    });

    it('never ages a debit dated after the Current Business Date below zero days', async () => {
      const c = await customer('Future dated');
      await txn(c, '2026-11-05', 10);
      expect((await row(c))?.aging).toEqual({ d0_7: 10, d8_30: 0, d30plus: 0 });
    });
  });

  describe('list totals', () => {
    it('totals every customer that owes, largest balance first, active customers only', async () => {
      const summary = await reader.summary(summaryQuery());
      const balances = summary.customers.map((c) => c.balance);
      expect(balances).toEqual([...balances].sort((a, b) => b - a));
      expect(summary.customerCount).toBe(summary.customers.length);
      const totalFromRows = summary.customers.reduce((n, c) => n + c.balance, 0);
      const totalFromAging = summary.aging.d0_7 + summary.aging.d8_30 + summary.aging.d30plus;
      expect(totalFromAging).toBeCloseTo(totalFromRows, 2);
    });

    it('leaves an inactive customer out of the list but still reads it on its own', async () => {
      const c = await customer('Closed account', { isActive: false });
      await txn(c, '2026-10-10', 777);
      expect(await row(c)).toBeUndefined();
      const one = await reader.customer(customerQuery(c));
      expect(one?.receivable.balance).toBe(777);
    });
  });

  describe('tenant scoping', () => {
    it('never mixes in another organization, nor lets a foreign collection settle a debit', async () => {
      const mine = await customer('Mine');
      await txn(mine, '2026-10-20', 100);
      const theirs = await customer('Theirs', { org: OTHER_ORG });
      await txn(theirs, '2026-10-20', 5000, {
        org: OTHER_ORG,
        station: OTHER_STATION,
        user: OTHER_USER,
      });
      // A collection in the other tenant that names MY customer (a data-integrity violation) must not count.
      await collect(mine, '2026-10-21', 90, {
        org: OTHER_ORG,
        station: OTHER_STATION,
        account: OTHER_CASH_ACCOUNT,
      });

      const summary = await reader.summary(summaryQuery());
      expect(summary.customers.map((x) => x.customerId)).not.toContain(theirs);
      expect(summary.customers.find((x) => x.customerId === mine)?.balance).toBe(100);

      const otherSummary = await reader.summary(summaryQuery({ organizationId: OTHER_ORG }));
      expect(otherSummary.customers.map((x) => x.customerId)).toEqual([theirs]);
    });

    it('answers null for a customer of another organization', async () => {
      const theirs = await customer('Their customer', { org: OTHER_ORG });
      expect(await reader.customer(customerQuery(theirs))).toBeNull();
      expect(await reader.customer(customerQuery(id(9999)))).toBeNull();
    });
  });

  describe('single customer', () => {
    it('reports the last payment (latest Entry Date) with its method', async () => {
      const c = await customer('Pays by UPI');
      await txn(c, '2026-09-01', 500);
      await collect(c, '2026-09-18', 40, { method: 'UPI' });
      await collect(c, '2026-09-05', 99, { method: 'CASH' });
      const one = await reader.customer(customerQuery(c));
      expect(one?.lastPayment).toEqual({ amount: 40, entryDate: '2026-09-18', method: 'UPI' });
      expect(one?.settlementCycle).toBe('OPEN');
    });

    it('has no last payment before the first Collection', async () => {
      const c = await customer('Never paid', { settlementCycle: 'EOD' });
      await txn(c, '2026-10-05', 100);
      const one = await reader.customer(customerQuery(c));
      expect(one?.lastPayment).toBeNull();
      expect(one?.settlementCycle).toBe('EOD');
      expect(one?.settled).toEqual({ count: 0, meanDays: 0 });
    });

    it('averages days-to-pay over the last settled Credit Sales, newest settlements first', async () => {
      const c = await customer('Eight sales');
      // Sale k (1 Sep + k-1) is paid d days later, in order, so FIFO pairs them one to one.
      const days = [2, 4, 6, 8, 10, 12, 14, 16];
      for (const [i, d] of days.entries()) {
        const sale = `2026-09-0${i + 1}`;
        await txn(c, sale, 100);
        const paidOn = new Date(Date.UTC(2026, 8, i + 1 + d)).toISOString().slice(0, 10);
        await collect(c, paidOn, 100);
      }
      const one = await reader.customer(customerQuery(c));
      // The last 6 settled are sales 3..8 (6, 8, 10, 12, 14, 16 days): mean 11.
      expect(RECEIVABLES_SETTLED_SAMPLE).toBe(6);
      expect(one?.settled).toEqual({ count: 6, meanDays: 11 });
      expect(one?.receivable.balance).toBe(0);
    });

    it('settles a sale only once the running credit covers it (part-paid sale is not settled)', async () => {
      const c = await customer('Slow');
      await txn(c, '2026-10-01', 100);
      await txn(c, '2026-10-02', 100);
      await collect(c, '2026-10-05', 150);
      await collect(c, '2026-10-12', 50);
      const one = await reader.customer(customerQuery(c));
      // Sale 1 settled 5 Oct (4 days). Sale 2 needs the 12 Oct payment (10 days).
      expect(one?.settled).toEqual({ count: 2, meanDays: 7 });
    });

    it('counts a sale paid ahead of its date as 0 days, and ignores sales a write-off settled', async () => {
      const c = await customer('Ahead and written off');
      await collect(c, '2026-10-01', 100);
      await txn(c, '2026-10-05', 100); // paid ahead -> 0 days
      await txn(c, '2026-10-06', 80);
      await txn(c, '2026-10-07', -80, { type: 'Adjustment' }); // settled by a credit note, not by paying
      const one = await reader.customer(customerQuery(c));
      expect(one?.settled).toEqual({ count: 1, meanDays: 0 });
    });

    it('picks the same last settled Credit Sales as a plain-JS FIFO over a long ledger', async () => {
      // ~500 sales and ~300 payments, each on its own day (no ties), with write-offs and an
      // opening balance mixed in: the settle date, not the sale date, decides the last 6.
      const c = await customer('Long history');
      let state = 19840817;
      const rand = (n: number) => {
        state = (state * 1103515245 + 12345) & 0x7fffffff;
        return state % n;
      };
      const day = (offset: number) =>
        new Date(Date.UTC(2024, 0, 1 + offset)).toISOString().slice(0, 10);

      const debits: Array<{ date: string; amount: number; sale: boolean }> = [];
      const credits: Array<{ date: string; amount: number; collection: boolean }> = [];
      await txn(c, day(0), 40, { type: 'Opening Balance' });
      debits.push({ date: day(0), amount: 40, sale: false });
      for (let d = 1; d < 520; d++) {
        const amount = 20 + rand(180);
        await txn(c, day(d), amount);
        debits.push({ date: day(d), amount, sale: true });
      }
      // Payments follow on their own dates, every 2-4 days. Every sale and every payment has
      // its own date, so the "last 6 by settle date" has no tie to break.
      for (let d = 2; d < 700; d += 2 + rand(3)) {
        const amount = 30 + rand(260);
        if (rand(9) === 0) {
          await txn(c, day(d), -amount, { type: 'Adjustment' });
          credits.push({ date: day(d), amount, collection: false });
        } else {
          await collect(c, day(d), amount);
          credits.push({ date: day(d), amount, collection: true });
        }
      }

      // Oracle: pair each sale with the credit whose running total first covers it.
      let cumDebit = 0;
      const ranges: Array<{ lo: number; hi: number; date: string; collection: boolean }> = [];
      let cumCredit = 0;
      for (const cr of credits) {
        ranges.push({ lo: cumCredit, hi: (cumCredit += cr.amount), ...cr });
      }
      const settled: Array<{ settledOn: string; saleOn: string; days: number }> = [];
      for (const d of debits) {
        cumDebit += d.amount;
        if (!d.sale) continue;
        const cr = ranges.find((r) => cumDebit > r.lo && cumDebit <= r.hi);
        if (cr?.collection) {
          settled.push({
            settledOn: cr.date,
            saleOn: d.date,
            days: Math.max(0, businessDateDiffDays(d.date, cr.date)),
          });
        }
      }
      settled.sort(
        (a, b) => b.settledOn.localeCompare(a.settledOn) || b.saleOn.localeCompare(a.saleOn),
      );
      const last = settled.slice(0, RECEIVABLES_SETTLED_SAMPLE);
      expect(last).toHaveLength(RECEIVABLES_SETTLED_SAMPLE);
      const mean = last.reduce((n, x) => n + x.days, 0) / last.length;

      const started = Date.now();
      const one = await reader.customer(customerQuery(c));
      const elapsed = Date.now() - started;
      expect(one?.settled.count).toBe(RECEIVABLES_SETTLED_SAMPLE);
      expect(one?.settled.meanDays).toBeCloseTo(mean, 6);
      // A row-by-row join of ~500 sales against ~350 credit ranges is quick enough to hide a
      // regression; this guards only against a blow-up, not a benchmark.
      expect(elapsed).toBeLessThan(5_000);
    }, 120_000);

    it('ignores Opening Balance and debit Adjustments in "usually pays in"', async () => {
      const c = await customer('Only a carried balance');
      await txn(c, '2026-08-01', 100, { type: 'Opening Balance' });
      await collect(c, '2026-09-01', 100);
      expect((await reader.customer(customerQuery(c)))?.settled.count).toBe(0);
    });

    it('sums this month: credit, slips, litres (fuel products only, whatever their unit) and paid', async () => {
      const c = await customer('This month');
      await txn(c, '2026-09-30', 999, { quantity: 99, productId: FUEL }); // last month
      await txn(c, '2026-10-02', 1000, { quantity: 10.5, productId: FUEL });
      await txn(c, '2026-10-03', 500, { quantity: 4, productId: LUBE }); // units, not litres
      await txn(c, '2026-10-04', 250, { quantity: 2.25, productId: FUEL });
      await txn(c, '2026-10-04', 90, { quantity: 1.5, productId: FUEL_LTR }); // fuel typed 'Ltr'
      await txn(c, '2026-10-04', 300, { quantity: 3, productId: BULK_OIL }); // unit 'L', not fuel
      await txn(c, '2026-10-05', 777, { type: 'OMC Sale' });
      await txn(c, '2026-10-05', 40, { type: 'Adjustment' }); // not a slip
      await collect(c, '2026-10-06', 300);
      await collect(c, '2026-09-29', 11); // last month
      const one = await reader.customer(customerQuery(c));
      expect(one?.month).toEqual({ credit: 2140, slips: 5, litres: 14.25, paid: 300 });
    });

    it('measures credit by its own range and paid by its own range', async () => {
      const c = await customer('Month anchors');
      await txn(c, '2026-10-31', 100);
      await collect(c, '2026-11-01', 60);
      const one = await reader.customer(
        customerQuery(c, { paidFrom: '2026-11-01', paidTo: '2026-11-30' }),
      );
      expect(one?.month).toMatchObject({ credit: 100, slips: 1, paid: 60 });
    });

    it('lists vehicle spend this month, largest first, for credit sales linked to a vehicle', async () => {
      const c = await customer('Fleet');
      const other = await customer('Other fleet');
      const truck = await vehicle(c, 'KL-11-AB-4521', 'Truck');
      const bus = await vehicle(c, 'KL-11-BB-0912', 'Bus');
      const foreign = await vehicle(other, 'KL-01-ZZ-0001');
      await txn(c, '2026-10-02', 300, { quantity: 3, productId: FUEL, vehicleId: truck });
      await txn(c, '2026-10-09', 200, { quantity: 2, productId: FUEL, vehicleId: truck });
      await txn(c, '2026-10-10', 100, { quantity: 1, productId: FUEL, vehicleId: bus });
      await txn(c, '2026-10-11', 60, { quantity: 1, productId: LUBE, vehicleId: bus });
      await txn(c, '2026-10-12', 5000); // no vehicle
      await txn(c, '2026-09-30', 9000, { vehicleId: truck }); // last month
      await txn(other, '2026-10-12', 8000, { vehicleId: foreign });
      const one = await reader.customer(customerQuery(c));
      expect(one?.vehicles).toEqual([
        { vehicleId: truck, registration: 'KL-11-AB-4521', type: 'Truck', amount: 500, litres: 5 },
        { vehicleId: bus, registration: 'KL-11-BB-0912', type: 'Bus', amount: 160, litres: 1 },
      ]);
    });

    it('reads a customer with no activity as nothing owed and nothing to show', async () => {
      const c = await customer('Brand new');
      const one = await reader.customer(customerQuery(c));
      expect(one).toEqual({
        settlementCycle: 'OPEN',
        receivable: {
          customerId: c,
          balance: 0,
          oldestUnpaidDate: null,
          aging: { d0_7: 0, d8_30: 0, d30plus: 0 },
        },
        lastPayment: null,
        settled: { count: 0, meanDays: 0 },
        month: { credit: 0, slips: 0, litres: 0, paid: 0 },
        vehicles: [],
      });
    });
  });

  describe('against a plain-JS FIFO', () => {
    /** The textbook version: walk the debits oldest first, spend the credit pool on each. */
    function oracle(
      debits: Array<{ date: string; amount: number }>,
      credits: Array<{ date: string; amount: number }>,
    ) {
      let pool = credits.reduce((n, c) => n + c.amount, 0);
      const aging = { d0_7: 0, d8_30: 0, d30plus: 0 };
      let oldest: string | null = null;
      for (const d of debits) {
        const paid = Math.min(pool, d.amount);
        pool -= paid;
        const open = d.amount - paid;
        if (open <= 0) continue;
        oldest ??= d.date;
        const age = Math.max(0, businessDateDiffDays(d.date, TODAY));
        if (age <= 7) aging.d0_7 += open;
        else if (age <= 30) aging.d8_30 += open;
        else aging.d30plus += open;
      }
      return { aging, oldest, balance: aging.d0_7 + aging.d8_30 + aging.d30plus };
    }

    it('agrees on 40 random ledgers', async () => {
      let state = 20261030;
      const rand = (n: number) => {
        state = (state * 1103515245 + 12345) & 0x7fffffff;
        return state % n;
      };
      const date = () => new Date(Date.UTC(2026, 7, 1 + rand(90))).toISOString().slice(0, 10);

      const cases: Array<{
        customerId: string;
        debits: Array<{ date: string; amount: number }>;
        credits: Array<{ date: string; amount: number }>;
      }> = [];
      for (let i = 0; i < 40; i++) {
        const c = await customer(`Random ${i}`);
        const debits: Array<{ date: string; amount: number; at: number }> = [];
        const credits: Array<{ date: string; amount: number }> = [];
        for (let k = 0; k < 2 + rand(8); k++) {
          const d = date();
          const amount = 10 + rand(500);
          await txn(c, d, amount, { type: rand(5) === 0 ? 'Opening Balance' : 'Credit Sale' });
          debits.push({ date: d, amount, at: tick });
        }
        for (let k = 0; k < rand(5); k++) {
          const d = date();
          const amount = 10 + rand(400);
          if (rand(4) === 0) {
            await txn(c, d, -amount, { type: 'Adjustment' });
          } else {
            await collect(c, d, amount);
          }
          credits.push({ date: d, amount });
        }
        debits.sort((a, b) => a.date.localeCompare(b.date) || a.at - b.at);
        cases.push({ customerId: c, debits, credits });
      }

      const summary = await reader.summary(summaryQuery());
      for (const { customerId, debits, credits } of cases) {
        const expected = oracle(debits, credits);
        const got = summary.customers.find((x) => x.customerId === customerId);
        if (expected.balance <= 0) {
          expect(got).toBeUndefined();
          continue;
        }
        expect(got?.oldestUnpaidDate).toBe(expected.oldest);
        expect(got?.balance).toBeCloseTo(expected.balance, 2);
        expect(got?.aging.d0_7).toBeCloseTo(expected.aging.d0_7, 2);
        expect(got?.aging.d8_30).toBeCloseTo(expected.aging.d8_30, 2);
        expect(got?.aging.d30plus).toBeCloseTo(expected.aging.d30plus, 2);
        const one = await reader.customer(customerQuery(customerId));
        expect(one?.receivable).toEqual(got);
      }
    }, 120_000);
  });

  describe('bounded list', () => {
    it('returns at most the customer limit while the total still covers everyone', async () => {
      const dayId = await businessDay(BIG_ORG, BIG_STATION, BIG_USER, '2026-10-20');
      const total = RECEIVABLES_CUSTOMER_LIMIT + 25;
      const ids = Array.from({ length: total }, () => nextId());
      await db.insert(schema.customers).values(
        ids.map((customerId, i) => ({
          id: customerId,
          organizationId: BIG_ORG,
          customerType: 'Regular',
          name: `Bulk ${i}`,
        })),
      );
      await db.insert(schema.customerTransactions).values(
        ids.map((customerId, i) => ({
          businessDayId: dayId,
          customerId,
          transactionType: 'Credit Sale',
          amount: String(100 + i),
        })),
      );
      const summary = await reader.summary(summaryQuery({ organizationId: BIG_ORG }));
      expect(summary.customerCount).toBe(total);
      expect(summary.customers).toHaveLength(RECEIVABLES_CUSTOMER_LIMIT);
      // Largest first, so the 25 smallest balances fall off the list, not the total.
      expect(summary.customers[0].balance).toBe(100 + total - 1);
      const everyone = ids.reduce((n, _, i) => n + 100 + i, 0);
      expect(summary.aging.d8_30).toBe(everyone);
    }, 60_000);
  });
});
