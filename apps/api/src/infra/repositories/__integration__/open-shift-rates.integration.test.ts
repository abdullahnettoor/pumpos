import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { schema, type DbClient } from '@pump/db';
import { fuelsWithoutRate } from '@pump/shared';
import { shiftsRouter } from '../../../routes/shifts.js';
import { stationSetupRouter } from '../../../routes/station-setup.js';

/**
 * POST /shifts/open refuses a fuel with no rate in effect (#630), against a
 * real Postgres: the price read is the SQL one (`effective_from <= now`), so
 * only the real database can show a future price does not count.
 *
 * Two fuels sell on a pump in service; a third sells only on a pump in
 * maintenance and is never priced, which must not block the open.
 */

const CONNECTION = process.env.TEST_DATABASE_URL;
const TEST_SCHEMA = 'open_shift_rates_it';

const ORG = '00000000-0000-0000-0000-00000000e301';
const STATION = '00000000-0000-0000-0000-00000000e302';
const MANAGER = '00000000-0000-0000-0000-00000000e303';
const ATTENDANT = '00000000-0000-0000-0000-00000000e304';
const TEMPLATE = '00000000-0000-0000-0000-00000000e305';
const PETROL = '00000000-0000-0000-0000-00000000e306';
const DIESEL = '00000000-0000-0000-0000-00000000e307';
const CNG = '00000000-0000-0000-0000-00000000e308';
const TANK_P = '00000000-0000-0000-0000-00000000e309';
const TANK_D = '00000000-0000-0000-0000-00000000e30a';
const TANK_C = '00000000-0000-0000-0000-00000000e30b';
const DU = '00000000-0000-0000-0000-00000000e30c';
const DU_OFF = '00000000-0000-0000-0000-00000000e30d';

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

const HOUR = 3_600_000;

interface Envelope<T = unknown> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string; details?: unknown };
}

interface PricingRow {
  productId: string;
  price: number;
  effectiveFrom: string | null;
}

describe.skipIf(!CONNECTION)('POST /shifts/open with a fuel without a rate (#630)', () => {
  let sql: postgres.Sql;
  let db: DbClient;
  let app: Hono;

  beforeAll(async () => {
    const bootstrap = postgres(CONNECTION!, { max: 1, onnotice: () => {} });
    try {
      // Serialized with the other integration files: see handover.integration.test.ts.
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

    const a = new Hono<{ Variables: { db: unknown; user: unknown } }>();
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
    a.route('/setup', stationSetupRouter);
    a.route('/', shiftsRouter);
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
    await db
      .insert(schema.stations)
      .values({ id: STATION, organizationId: ORG, name: 'Station A', code: 'STA' });
    await db.insert(schema.users).values([
      { id: MANAGER, organizationId: ORG, fullName: 'Meera', role: 'Manager', status: 'ACTIVE' },
      { id: ATTENDANT, organizationId: ORG, fullName: 'Arun', role: 'Attendant', status: 'ACTIVE' },
    ]);
    await db
      .insert(schema.userStationAssignments)
      .values({ userId: ATTENDANT, stationId: STATION });
    await db.insert(schema.shiftTemplates).values({
      id: TEMPLATE,
      organizationId: ORG,
      name: 'Morning',
      startTime: '06:00',
      endTime: '14:00',
    });
    await db.insert(schema.products).values(
      [
        [PETROL, 'Petrol', 'MS'],
        [DIESEL, 'Diesel', 'HSD'],
        [CNG, 'CNG', 'CNG'],
      ].map(([id, name, code]) => ({
        id,
        organizationId: ORG,
        name,
        code,
        productType: 'FUEL',
        unit: 'L',
      })),
    );
    await db.insert(schema.tanks).values(
      [
        [TANK_P, PETROL],
        [TANK_D, DIESEL],
        [TANK_C, CNG],
      ].map(([id, productId], i) => ({
        id,
        organizationId: ORG,
        stationId: STATION,
        name: `T${i + 1}`,
        productId,
        capacity: '10000',
      })),
    );
    await db.insert(schema.dispenserUnits).values([
      { id: DU, organizationId: ORG, stationId: STATION, name: 'DU-1', code: 'DU1' },
      {
        id: DU_OFF,
        organizationId: ORG,
        stationId: STATION,
        name: 'DU-2',
        code: 'DU2',
        status: 'MAINTENANCE',
      },
    ]);
    await db.insert(schema.nozzles).values(
      [
        [DU, TANK_P, PETROL, 'N1'],
        [DU, TANK_D, DIESEL, 'N2'],
        // The only CNG nozzle sits on the pump in maintenance.
        [DU_OFF, TANK_C, CNG, 'N3'],
      ].map(([duId, tankId, productId, name]) => ({
        organizationId: ORG,
        stationId: STATION,
        duId,
        tankId,
        productId,
        name,
        currentReading: '100',
      })),
    );
  }

  const price = (productId: string, p: string, effectiveFrom: Date) =>
    db.insert(schema.fuelPrices).values({
      organizationId: ORG,
      stationId: STATION,
      productId,
      price: p,
      effectiveFrom,
    });

  const open = () =>
    app.request('/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stationId: STATION,
        shiftTemplateId: TEMPLATE,
        staffAssignments: [{ userId: ATTENDANT, duId: DU, openingFloat: 0 }],
      }),
    });

  const nothingWritten = async () => {
    expect(await db.select().from(schema.shifts)).toHaveLength(0);
    expect(await db.select().from(schema.businessDays)).toHaveLength(0);
    expect(await db.select().from(schema.nozzleReadings)).toHaveLength(0);
    expect(await db.select().from(schema.events)).toHaveLength(0);
  };

  it('refuses when one fuel has no price and another only a future one, naming both', async () => {
    // Petrol is priced, but only from tomorrow; Diesel never.
    await price(PETROL, '102.50', new Date(Date.now() + 24 * HOUR));
    const res = await open();
    expect(res.status).toBe(400);
    const body = (await res.json()) as Envelope;
    expect(body).toEqual({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Diesel and Petrol have no rate in effect. Set a rate before opening.',
        details: { productIds: [DIESEL, PETROL] },
      },
    });
    await nothingWritten();
  });

  it('still refuses while one fuel lacks a rate in effect', async () => {
    await price(PETROL, '101.00', new Date(Date.now() - HOUR));
    const res = await open();
    expect(res.status).toBe(400);
    const body = (await res.json()) as Envelope;
    expect(body.error?.message).toBe('Diesel has no rate in effect. Set a rate before opening.');
    expect(body.error?.details).toEqual({ productIds: [DIESEL] });
    await nothingWritten();
  });

  /**
   * What the Open shift form checks (#633 review): the shift-status nozzles
   * against GET /setup/pricing, by the server's own rule. It must agree with
   * the open.
   */
  const formBlocks = async () => {
    const status = (await (await app.request(`/status?stationId=${STATION}`)).json()) as Envelope<{
      nozzles: { productId: string }[];
    }>;
    const pricing = (await (
      await app.request(`/setup/pricing?stationId=${STATION}`)
    ).json()) as Envelope<PricingRow[]>;
    const rows = new Map((pricing.data ?? []).map((r) => [r.productId, r]));
    return {
      listed: [...rows.keys()],
      blocked: fuelsWithoutRate(
        status.data?.nozzles ?? [],
        (id) => rows.get(id)?.effectiveFrom != null,
      ),
    };
  };

  it('the form blocks the same fuels the server refuses', async () => {
    expect((await formBlocks()).blocked).toEqual([DIESEL]);
  });

  it('opens once every fuel on a pump in service has a rate in effect; the pump in maintenance is ignored', async () => {
    await price(DIESEL, '89.70', new Date(Date.now() - HOUR));
    // Petrol is archived but still on a pump in service, priced (#633 review):
    // pricing still lists it with its rate, so the form does not block the
    // open the server accepts.
    await db.update(schema.products).set({ isActive: false }).where(eq(schema.products.id, PETROL));
    const form = await formBlocks();
    expect(form.blocked).toEqual([]);
    expect(form.listed).toContain(PETROL);

    const res = await open();
    const body = (await res.json()) as Envelope;
    expect(body.success).toBe(true);
    expect(res.status).toBe(200);

    const readings = await db
      .select({ productId: schema.nozzles.productId, unitPrice: schema.nozzleReadings.unitPrice })
      .from(schema.nozzleReadings)
      .innerJoin(schema.nozzles, eq(schema.nozzles.id, schema.nozzleReadings.nozzleId));
    // Petrol at its rate in effect, not tomorrow's; CNG has no reading at all.
    expect(Object.fromEntries(readings.map((r) => [r.productId, r.unitPrice]))).toEqual({
      [PETROL]: '101.00',
      [DIESEL]: '89.70',
    });
  });
});
