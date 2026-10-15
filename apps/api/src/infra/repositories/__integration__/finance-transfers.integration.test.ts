import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { Hono } from 'hono';
import { schema, type DbClient } from '@pump/db';
import { financeRouter } from '../../../routes/finance.js';

/**
 * Station money movements against a real Postgres (#530).
 *
 * Accounts › Transfers pairs the two legs of a transfer or deposit by the
 * `transferId` that `GET /finance/movements` returns. These tests prove that
 * both legs come back with the same `transferId` (and their own account
 * names), including a move into an organization-shared account (no station),
 * and that a plain office record carries none.
 *
 * Runs only when TEST_DATABASE_URL is set (CI provides a service container).
 * Everything lives in a dedicated schema that is dropped afterwards.
 */

const CONNECTION = process.env.TEST_DATABASE_URL;
const TEST_SCHEMA = 'finance_transfers_it';

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, 'f')}`;
const ORG = id(1);
const STATION = id(2);
const OWNER = id(3);
const CASH = id(4);
const BANK = id(5);
const ORG_BANK = id(6); // shared by the organization: no station
const PETTY = id(7);

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

describe.skipIf(!CONNECTION)('GET /finance/movements pairs transfer legs (#530)', () => {
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

    await db.insert(schema.organizations).values({ id: ORG, name: 'Tenant A' });
    await db
      .insert(schema.stations)
      .values({ id: STATION, organizationId: ORG, name: 'Station A', code: 'STA' });
    await db.insert(schema.users).values({
      id: OWNER,
      organizationId: ORG,
      fullName: 'Owner',
      role: 'Owner',
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
        name: 'SBI Current',
      },
      {
        id: ORG_BANK,
        organizationId: ORG,
        stationId: null,
        accountType: 'BANK',
        name: 'Head office HDFC',
      },
    ]);

    const a = new Hono<{ Variables: { db: any; user: any } }>();
    a.use('*', async (c, next) => {
      c.set('db', db);
      c.set('user', {
        id: OWNER,
        email: 'owner@example.com',
        fullName: 'Owner',
        organizationId: ORG,
        role: 'Owner',
        assignedStationIds: [STATION],
      });
      await next();
    });
    a.route('/finance', financeRouter);
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

  async function transfer(fromAccountId: string, toAccountId: string, amount: number) {
    const res = await app.request('/finance/transfers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromAccountId, toAccountId, amount, date: '2026-10-10' }),
    });
    expect(res.status).toBeLessThan(300);
  }

  it('returns both legs of each move with one shared transferId and their own account names', async () => {
    await transfer(CASH, BANK, 5000); // a deposit
    await transfer(CASH, PETTY, 300); // a transfer
    await transfer(BANK, ORG_BANK, 2000); // into an organization-shared account

    const res = await app.request(
      `/finance/movements?stationId=${STATION}&from=2026-10-01&to=2026-10-31`,
    );
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as any;
    const legs = (data.movements as any[]).filter((m) =>
      ['DEPOSIT', 'TRANSFER'].includes(m.sourceType),
    );
    expect(legs).toHaveLength(6);

    const byTransfer = new Map<string, any[]>();
    for (const m of legs) {
      expect(typeof m.transferId).toBe('string');
      byTransfer.set(m.transferId, [...(byTransfer.get(m.transferId) ?? []), m]);
    }
    expect(byTransfer.size).toBe(3);
    const pairs = [...byTransfer.values()].map((pair) => {
      expect(pair).toHaveLength(2);
      const out = pair.find((m) => m.direction === 'out');
      const into = pair.find((m) => m.direction === 'in');
      expect(Number(out.amount)).toBe(Number(into.amount));
      return `${out.sourceType} ${out.accountName} → ${into.accountName}`;
    });
    expect(pairs.sort()).toEqual([
      'DEPOSIT Cash in Hand → SBI Current',
      'TRANSFER Cash in Hand → Petty Cash',
      'TRANSFER SBI Current → Head office HDFC',
    ]);
  });

  it('a plain office record leg carries no transferId', async () => {
    const res = await app.request(`/finance/accounts/${BANK}/entry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        direction: 'out',
        amount: 50,
        sourceType: 'BANK_CHARGE',
        date: '2026-10-11',
      }),
    });
    expect(res.status).toBeLessThan(300);
    const list = await app.request(
      `/finance/movements?stationId=${STATION}&from=2026-10-11&to=2026-10-11`,
    );
    const { data } = (await list.json()) as any;
    expect(data.movements).toHaveLength(1);
    expect(data.movements[0]).toMatchObject({ sourceType: 'BANK_CHARGE', transferId: null });
  });

  // Reports › Cash & bank is a per-account summary (#531): Opening · In · Out ·
  // Closing for each account, so the opening comes back per account, for every
  // account of the station and the organization-shared ones, moved or not.
  it('returns one opening per account: Σ before the range, 0 for all time', async () => {
    const OTHER_STATION = id(8);
    const OTHER_CASH = id(9);
    const INACTIVE = id(10);
    const FOREIGN_ORG = id(11);
    const FOREIGN_STATION = id(12);
    const FOREIGN_BANK = id(13);
    await db
      .insert(schema.stations)
      .values({ id: OTHER_STATION, organizationId: ORG, name: 'Station B', code: 'STB' });
    await db.insert(schema.financialAccounts).values([
      {
        id: OTHER_CASH,
        organizationId: ORG,
        stationId: OTHER_STATION,
        accountType: 'CASH_IN_HAND',
        name: 'Station B cash',
      },
      // An inactive account of this station that never moved.
      {
        id: INACTIVE,
        organizationId: ORG,
        stationId: STATION,
        accountType: 'BANK',
        name: 'Old ICICI',
        isActive: false,
      },
    ]);
    // Another tenant: its accounts never show, and its entries never count.
    await db.insert(schema.organizations).values({ id: FOREIGN_ORG, name: 'Tenant B' });
    await db
      .insert(schema.stations)
      .values({ id: FOREIGN_STATION, organizationId: FOREIGN_ORG, name: 'Other', code: 'OTH' });
    await db.insert(schema.financialAccounts).values({
      id: FOREIGN_BANK,
      organizationId: FOREIGN_ORG,
      stationId: null,
      accountType: 'BANK',
      name: 'Tenant B shared bank',
    });
    await db.insert(schema.ledgerEntries).values([
      {
        organizationId: FOREIGN_ORG,
        stationId: FOREIGN_STATION,
        accountId: FOREIGN_BANK,
        direction: 'in',
        amount: '999',
        entryDate: '2026-10-01',
        sourceType: 'ADJUSTMENT',
      },
      // The shared head-office account moved at Station B too: not this station's money.
      {
        organizationId: ORG,
        stationId: OTHER_STATION,
        accountId: ORG_BANK,
        direction: 'in',
        amount: '7000',
        entryDate: '2026-10-01',
        sourceType: 'ADJUSTMENT',
      },
    ]);

    // Everything above happened on 10 Oct (moves) and 11 Oct (a ₹50 bank charge).
    const res = await app.request(
      `/finance/movements?stationId=${STATION}&from=2026-10-11&to=2026-10-31`,
    );
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as any;
    const byId = new Map((data.openings as any[]).map((o) => [o.accountId, o]));
    expect([...byId.keys()].sort()).toEqual([CASH, BANK, ORG_BANK, PETTY, INACTIVE].sort());
    expect(byId.get(INACTIVE)).toMatchObject({ isActive: false, shared: false });
    expect(Number(byId.get(INACTIVE).opening)).toBe(0);
    expect(byId.get(CASH)).toMatchObject({
      accountType: 'CASH_IN_HAND',
      accountName: 'Cash in Hand',
      shared: false,
      isActive: true,
    });
    expect(Number(byId.get(CASH).opening)).toBe(-5300);
    expect(Number(byId.get(PETTY).opening)).toBe(300);
    expect(Number(byId.get(BANK).opening)).toBe(3000); // the 11 Oct charge is in range
    expect(byId.get(ORG_BANK)).toMatchObject({ shared: true });
    // Only this station's ₹2,000; Station B's ₹7,000 on the same account stays out.
    expect(Number(byId.get(ORG_BANK).opening)).toBe(2000);

    // No `from`: the range is all time, nothing precedes it.
    const all = await app.request(`/finance/movements?stationId=${STATION}`);
    const allData = ((await all.json()) as any).data;
    // Station B's entry on the shared account and Tenant B's entry are not this station's.
    const amounts = (allData.movements as any[]).map((m) => Number(m.amount));
    expect(amounts).not.toContain(7000);
    expect(amounts).not.toContain(999);
    expect((allData.openings as any[]).map((o) => [o.accountId, Number(o.opening)]).sort()).toEqual(
      [
        [CASH, 0],
        [BANK, 0],
        [ORG_BANK, 0],
        [PETTY, 0],
        [INACTIVE, 0],
      ].sort(),
    );
  });
});
