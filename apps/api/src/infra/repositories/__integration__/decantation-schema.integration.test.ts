import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';

/**
 * Decantation & Density schema (ADR 0007, spec #477) against real Postgres:
 *  - RLS on the new tables (direct organization_id policy) and on purchases /
 *    purchase_items, which now key on organization_id (business_day_id is
 *    nullable for Fuel Purchases),
 *  - the purchases anchor CHECK,
 *  - the purchases.organization_id / station_id backfill migration.
 *
 * Runs only when TEST_DATABASE_URL is set.
 */

const CONNECTION = process.env.TEST_DATABASE_URL;
const RLS_SCHEMA = 'decant_schema_rls_it';
const BACKFILL_SCHEMA = 'decant_schema_backfill_it';

const id = (n: number) => `00000000-0000-0000-0000-${String(n + 900000).padStart(12, '0')}`;
const ORG_A = id(1);
const ORG_B = id(2);
const STATION_A = id(3);
const STATION_B = id(4);
const USER_A = id(5);
const AUTH_A = id(6);
const DAY_A = id(7);
const DAY_B = id(8);
const SUPPLIER_A = id(9);
const SUPPLIER_B = id(10);
const PRODUCT_A = id(11);
const PRODUCT_B = id(12);
const PURCHASE_A = id(13);
const PURCHASE_B = id(14);
const DEC_A = id(15);
const DEC_B = id(16);

const BOOTSTRAP = (schema: string) => `
  do $$ begin
    if not exists (select from pg_roles where rolname = 'authenticated') then
      create role authenticated;
    end if;
    if not exists (select from pg_roles where rolname = 'anon') then
      create role anon;
    end if;
  end $$;
  drop schema if exists ${schema} cascade;
  create schema ${schema};
`;

/** Shipped supabase migrations, optionally only those with journal idx < `before`. */
function shippedSchema(schema: string, from = 0, before = Infinity): string {
  const dir = path.resolve(__dirname, '../../../../../../supabase/migrations');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .filter((f) => {
      const idx = Number(f.slice(0, 14).slice(-6));
      return idx >= from && idx < before;
    })
    .map((f) => readFileSync(path.join(dir, f), 'utf8'))
    .join('\n')
    .replace(/(?:"public"|public)\./g, `"${schema}".`)
    .replace(
      /create trigger on_auth_user_created/gi,
      'create or replace trigger on_auth_user_created',
    );
}

describe.skipIf(!CONNECTION)('Decantation & Density schema against real Postgres', () => {
  let sql: postgres.Sql;

  /** Run `fn` as an authenticated user of the given Supabase auth user (RLS applies). */
  async function asUser<T>(authUser: string, fn: (tx: postgres.Sql) => Promise<T>): Promise<T> {
    let result!: T;
    await sql
      .begin(async (tx) => {
        await tx.unsafe('set local role authenticated');
        await tx.unsafe(`select set_config('request.jwt.claims', '{"sub":"${authUser}"}', true)`);
        result = await fn(tx as unknown as postgres.Sql);
        throw new RollbackSignal();
      })
      .catch((e) => {
        if (!(e instanceof RollbackSignal)) throw e;
      });
    return result;
  }
  class RollbackSignal extends Error {}

  beforeAll(async () => {
    const bootstrap = postgres(CONNECTION!, { max: 1, onnotice: () => {} });
    try {
      await bootstrap.unsafe('select pg_advisory_lock(872634)');
      await bootstrap.unsafe(BOOTSTRAP(RLS_SCHEMA));
      await bootstrap.unsafe(`set search_path to ${RLS_SCHEMA};` + shippedSchema(RLS_SCHEMA));
      await bootstrap.unsafe(
        `grant usage on schema ${RLS_SCHEMA} to authenticated;
         grant all on all tables in schema ${RLS_SCHEMA} to authenticated;`,
      );
      await bootstrap.unsafe('select pg_advisory_unlock(872634)');
    } finally {
      await bootstrap.end();
    }
    sql = postgres(CONNECTION!, {
      max: 4,
      onnotice: () => {},
      connection: { search_path: RLS_SCHEMA },
    });
    await seed();
  }, 60_000);

  afterAll(async () => {
    if (sql) {
      await sql.unsafe('select pg_advisory_lock(872634)');
      await sql.unsafe(`drop schema if exists ${RLS_SCHEMA} cascade`);
      await sql.unsafe(`drop schema if exists ${BACKFILL_SCHEMA} cascade`);
      await sql.unsafe('select pg_advisory_unlock(872634)');
      await sql.end();
    }
  });

  async function seed() {
    await sql.unsafe(`
      insert into organizations (id, name) values ('${ORG_A}', 'A'), ('${ORG_B}', 'B');
      insert into stations (id, organization_id, name, code) values
        ('${STATION_A}', '${ORG_A}', 'SA', 'SA'), ('${STATION_B}', '${ORG_B}', 'SB', 'SB');
      insert into users (id, organization_id, auth_user_id, full_name, role)
        values ('${USER_A}', '${ORG_A}', '${AUTH_A}', 'Asha', 'Manager');
      insert into business_days (id, organization_id, station_id, business_date, status, opened_by) values
        ('${DAY_A}', '${ORG_A}', '${STATION_A}', '2026-10-09', 'OPEN', '${USER_A}'),
        ('${DAY_B}', '${ORG_B}', '${STATION_B}', '2026-10-09', 'OPEN', '${USER_A}');
      insert into suppliers (id, organization_id, name) values
        ('${SUPPLIER_A}', '${ORG_A}', 'Sup A'), ('${SUPPLIER_B}', '${ORG_B}', 'Sup B');
      insert into products (id, organization_id, name, code, product_type, unit) values
        ('${PRODUCT_A}', '${ORG_A}', 'MS', 'MS', 'FUEL', 'L'),
        ('${PRODUCT_B}', '${ORG_B}', 'MS', 'MS', 'FUEL', 'L');
      -- A Fuel Purchase (entry date, no business day) for each tenant.
      insert into purchases (id, organization_id, station_id, document_number, supplier_id, entry_date, amount) values
        ('${PURCHASE_A}', '${ORG_A}', '${STATION_A}', 'PUR-A', '${SUPPLIER_A}', '2026-10-09', '100'),
        ('${PURCHASE_B}', '${ORG_B}', '${STATION_B}', 'PUR-B', '${SUPPLIER_B}', '2026-10-09', '100');
      insert into decantations (id, organization_id, station_id, business_day_id, document_number, tanker_number) values
        ('${DEC_A}', '${ORG_A}', '${STATION_A}', '${DAY_A}', 'DEC-A', 'TN-A'),
        ('${DEC_B}', '${ORG_B}', '${STATION_B}', '${DAY_B}', 'DEC-B', 'TN-B');
      insert into density_readings (organization_id, station_id, business_date, product_id, kind, entry_method, density_15) values
        ('${ORG_A}', '${STATION_A}', '2026-10-09', '${PRODUCT_A}', 'MORNING', 'DIRECT_15', '745.00'),
        ('${ORG_B}', '${STATION_B}', '2026-10-09', '${PRODUCT_B}', 'MORNING', 'DIRECT_15', '745.00');
      insert into purchase_items (purchase_id, product_id, quantity, unit_price, taxable_amount, line_total, invoice_density) values
        ('${PURCHASE_A}', '${PRODUCT_A}', '1000', '90', '90000', '90000', '742.50'),
        ('${PURCHASE_B}', '${PRODUCT_B}', '1000', '90', '90000', '90000', '742.50');
    `);
  }

  it('hides other tenants from every new table and from purchases / purchase_items', async () => {
    const counts = await asUser(AUTH_A, async (tx) => {
      const n = async (t: string) =>
        Number((await tx.unsafe(`select count(*)::int as c from ${t}`))[0]!.c);
      return {
        decantations: await n('decantations'),
        densityReadings: await n('density_readings'),
        purchases: await n('purchases'),
        purchaseItems: await n('purchase_items'),
      };
    });
    expect(counts).toEqual({ decantations: 1, densityReadings: 1, purchases: 1, purchaseItems: 1 });
  });

  it('does not expose a Fuel Purchase (no business day) to another tenant', async () => {
    const rows = await asUser(AUTH_A, (tx) =>
      tx.unsafe(`select id from purchases where id = '${PURCHASE_B}'`),
    );
    expect(rows).toHaveLength(0);
  });

  it('allows a Fuel Purchase with entry date and no business day for the own tenant', async () => {
    const rows = await asUser(AUTH_A, (tx) =>
      tx.unsafe(`select id, business_day_id from purchases where id = '${PURCHASE_A}'`),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.business_day_id).toBeNull();
  });

  it('denies inserting rows for another tenant (WITH CHECK)', async () => {
    await expect(
      asUser(AUTH_A, (tx) =>
        tx.unsafe(
          `insert into decantations (organization_id, station_id, business_day_id, document_number, tanker_number)
           values ('${ORG_B}', '${STATION_B}', '${DAY_B}', 'DEC-X', 'TN-X')`,
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
    await expect(
      asUser(AUTH_A, (tx) =>
        tx.unsafe(
          `insert into purchases (organization_id, station_id, document_number, supplier_id, entry_date, amount)
           values ('${ORG_B}', '${STATION_B}', 'PUR-X', '${SUPPLIER_B}', '2026-10-09', '1')`,
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('denies a purchase_items line on another tenant purchase', async () => {
    await expect(
      asUser(AUTH_A, (tx) =>
        tx.unsafe(
          `insert into purchase_items (purchase_id, product_id, quantity, unit_price, taxable_amount, line_total)
           values ('${PURCHASE_B}', '${PRODUCT_B}', '1', '1', '1', '1')`,
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('rejects a purchase with neither business day nor entry date', async () => {
    await expect(
      sql.unsafe(
        `insert into purchases (organization_id, station_id, document_number, supplier_id, amount)
         values ('${ORG_A}', '${STATION_A}', 'PUR-NOANCHOR', '${SUPPLIER_A}', '1')`,
      ),
    ).rejects.toThrow(/purchases_has_anchor/);
  });

  it('enforces one chamber number per decantation', async () => {
    await sql.unsafe(
      `insert into decantation_chambers (organization_id, station_id, decantation_id, chamber_no)
       values ('${ORG_A}', '${STATION_A}', '${DEC_A}', 1)`,
    );
    await expect(
      sql.unsafe(
        `insert into decantation_chambers (organization_id, station_id, decantation_id, chamber_no)
         values ('${ORG_A}', '${STATION_A}', '${DEC_A}', 1)`,
      ),
    ).rejects.toThrow(/decantation_chambers_decantation_chamber_uniq/);
  });

  it('backfills purchases.organization_id / station_id from the business day', async () => {
    const bootstrap = postgres(CONNECTION!, { max: 1, onnotice: () => {} });
    try {
      await bootstrap.unsafe('select pg_advisory_lock(872634)');
      await bootstrap.unsafe(BOOTSTRAP(BACKFILL_SCHEMA));
      // Everything up to and including the schema migration (0012), before the backfill (0013).
      await bootstrap.unsafe(
        `set search_path to ${BACKFILL_SCHEMA};` + shippedSchema(BACKFILL_SCHEMA, 0, 13),
      );
      await bootstrap.unsafe(`
        insert into organizations (id, name) values ('${ORG_A}', 'A');
        insert into stations (id, organization_id, name, code) values ('${STATION_A}', '${ORG_A}', 'SA', 'SA');
        insert into users (id, organization_id, full_name, role) values ('${USER_A}', '${ORG_A}', 'Asha', 'Manager');
        insert into business_days (id, organization_id, station_id, business_date, status, opened_by)
          values ('${DAY_A}', '${ORG_A}', '${STATION_A}', '2026-10-09', 'OPEN', '${USER_A}');
        insert into suppliers (id, organization_id, name) values ('${SUPPLIER_A}', '${ORG_A}', 'Sup A');
        insert into purchases (id, document_number, business_day_id, supplier_id, amount)
          values ('${PURCHASE_A}', 'PUR-LEGACY', '${DAY_A}', '${SUPPLIER_A}', '10');
      `);
      // 0013 (backfill + RLS) then 0014 (NOT NULL).
      await bootstrap.unsafe(
        `set search_path to ${BACKFILL_SCHEMA};` + shippedSchema(BACKFILL_SCHEMA, 13),
      );
      const rows = await bootstrap.unsafe(
        `select organization_id, station_id from purchases where id = '${PURCHASE_A}'`,
      );
      expect(rows[0]).toEqual({ organization_id: ORG_A, station_id: STATION_A });
      await bootstrap.unsafe('select pg_advisory_unlock(872634)');
    } finally {
      await bootstrap.end();
    }
  }, 60_000);
});
