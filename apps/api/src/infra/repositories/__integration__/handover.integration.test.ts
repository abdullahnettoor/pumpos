import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { schema, type DbClient } from '@pump/db';
import { shiftsRouter } from '../../../routes/shifts.js';

/**
 * POST /shifts/handovers against a real Postgres (#231).
 *
 * The handover context reader and replaceCurrent were rewritten into
 * consolidated raw-SQL statements (single context CTE, xmax-upsert, one
 * delete+insert entry swap, batched reading updates); only the real planner
 * can prove the recorded handover, terminal entries, nozzle readings, and the
 * idempotent replace behaviour are unchanged.
 */

const CONNECTION = process.env.TEST_DATABASE_URL;
const TEST_SCHEMA = 'handover_it';

const ORG = '00000000-0000-0000-0000-00000000f101';
const STATION = '00000000-0000-0000-0000-00000000f102';
const MANAGER = '00000000-0000-0000-0000-00000000f103';
const ATTENDANT = '00000000-0000-0000-0000-00000000f104';
const TEMPLATE = '00000000-0000-0000-0000-00000000f105';
const DAY = '00000000-0000-0000-0000-00000000f106';
const SHIFT = '00000000-0000-0000-0000-00000000f107';
const FUEL = '00000000-0000-0000-0000-00000000f108';
const TANK = '00000000-0000-0000-0000-00000000f109';
const DU = '00000000-0000-0000-0000-00000000f10a';
const NOZZLE_1 = '00000000-0000-0000-0000-00000000f10b';
const NOZZLE_2 = '00000000-0000-0000-0000-00000000f10c';
const TERMINAL = '00000000-0000-0000-0000-00000000f10d';

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

describe.skipIf(!CONNECTION)('POST /shifts/handovers against real Postgres', () => {
  let sql: postgres.Sql;
  let db: DbClient;
  let app: Hono;

  beforeAll(async () => {
    const bootstrap = postgres(CONNECTION!, { max: 1, onnotice: () => {} });
    try {
      // The shipped migrations create shared/global objects (e.g. the
      // on_auth_user_created trigger on auth.users), so two integration files
      // replaying them concurrently collide — serialize the bootstrap.
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
    a.route('/', shiftsRouter);
    app = a as unknown as Hono;
  }, 60_000);

  afterAll(async () => {
    if (sql) {
      // Same serialization as the bootstrap: cascade-dropping the schema also
      // drops the function behind the global auth.users trigger, which
      // deadlocks against another file's concurrent bootstrap DDL.
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
    await db.insert(schema.shiftTemplates).values({
      id: TEMPLATE,
      organizationId: ORG,
      name: 'Morning',
      startTime: '06:00',
      endTime: '14:00',
    });
    await db.insert(schema.products).values({
      id: FUEL,
      organizationId: ORG,
      name: 'Petrol',
      code: 'MS',
      productType: 'FUEL',
      unit: 'L',
    });
    await db.insert(schema.tanks).values({
      id: TANK,
      organizationId: ORG,
      stationId: STATION,
      name: 'T1',
      productId: FUEL,
      capacity: '10000',
    });
    await db.insert(schema.dispenserUnits).values({
      id: DU,
      organizationId: ORG,
      stationId: STATION,
      name: 'DU-1',
      code: 'DU1',
      status: 'ACTIVE',
    });
    await db.insert(schema.nozzles).values([
      {
        id: NOZZLE_1,
        organizationId: ORG,
        stationId: STATION,
        duId: DU,
        tankId: TANK,
        productId: FUEL,
        name: 'N1',
        currentReading: '100',
      },
      {
        id: NOZZLE_2,
        organizationId: ORG,
        stationId: STATION,
        duId: DU,
        tankId: TANK,
        productId: FUEL,
        name: 'N2',
        currentReading: '200',
      },
    ]);
    await db.insert(schema.paymentTerminals).values({
      id: TERMINAL,
      organizationId: ORG,
      stationId: STATION,
      label: 'POS 1',
      provider: 'HDFC',
      isActive: true,
    });
    await db.insert(schema.businessDays).values({
      id: DAY,
      organizationId: ORG,
      stationId: STATION,
      businessDate: '2026-03-10',
      status: 'OPEN',
      openedBy: MANAGER,
    });
    await db.insert(schema.shifts).values({
      id: SHIFT,
      organizationId: ORG,
      stationId: STATION,
      businessDayId: DAY,
      shiftTemplateId: TEMPLATE,
      status: 'OPEN',
      openedBy: MANAGER,
    });
    await db.insert(schema.nozzleReadings).values([
      {
        shiftId: SHIFT,
        nozzleId: NOZZLE_1,
        openingReading: '100',
        closingReading: '100',
        volumeSold: '0',
        unitPrice: '100',
      },
      {
        shiftId: SHIFT,
        nozzleId: NOZZLE_2,
        openingReading: '200',
        closingReading: '200',
        volumeSold: '0',
        unitPrice: '90',
      },
    ]);
    await db.insert(schema.shiftStaffAssignments).values({
      shiftId: SHIFT,
      userId: ATTENDANT,
      duId: DU,
      openingFloat: '1000',
    });
    await db.insert(schema.shiftTerminalLinks).values({
      shiftId: SHIFT,
      terminalId: TERMINAL,
      duId: DU,
    });
  }

  const post = (payload: Record<string, unknown>) =>
    app.request('/handovers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

  it('records the handover with computed expected sales and variance', async () => {
    const res = await post({
      shiftId: SHIFT,
      userId: ATTENDANT,
      duId: DU,
      cashHandedOver: 9000,
      nozzleReadings: [
        { nozzleId: NOZZLE_1, closingReading: 150 },
        { nozzleId: NOZZLE_2, closingReading: 260 },
      ],
      terminalEntries: [{ terminalId: TERMINAL, cardAmount: 400, upiAmount: 100, batchRef: 'B-1' }],
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    // expected fuel = 50×100 + 60×90 = 10,400; declared = 9000 + 400 + 100 = 9500.
    // Drawer: float 1000 + cash sales (10,400 − 500 non-cash) − 0 drops = 10,900.
    expect(body.data.expectedFuelSales).toBe(10400);
    expect(body.data.declaredTotal).toBe(9500);
    expect(body.data.openingFloat).toBe(1000);
    expect(body.data.expectedCash).toBe(10900);
    expect(body.data.varianceAmount).toBe(-1900);
    expect(body.data.replaced).toBe(false);
    expect(body.data.terminalEntries).toHaveLength(1);
    expect(body.data.terminalEntries[0]).toMatchObject({
      terminalId: TERMINAL,
      cardAmount: '400.00',
      upiAmount: '100.00',
      batchRef: 'B-1',
    });

    // Readings persisted via the batched UPDATE.
    const readings = await db
      .select()
      .from(schema.nozzleReadings)
      .where(eq(schema.nozzleReadings.shiftId, SHIFT));
    const byNozzle = new Map(readings.map((r) => [r.nozzleId, r]));
    expect(byNozzle.get(NOZZLE_1)).toMatchObject({
      closingReading: '150.000',
      volumeSold: '50.000',
    });
    expect(byNozzle.get(NOZZLE_2)).toMatchObject({
      closingReading: '260.000',
      volumeSold: '60.000',
    });

    const events = await db
      .select()
      .from(schema.events)
      .where(eq(schema.events.stationId, STATION));
    expect(events.map((e) => e.eventType)).toContain('HANDOVER_RECORDED');
  });

  it('replaces the handover idempotently on re-submit (xmax upsert)', async () => {
    const res = await post({
      shiftId: SHIFT,
      userId: ATTENDANT,
      duId: DU,
      cashHandedOver: 9900,
      cashDrops: 2000,
      nozzleReadings: [
        { nozzleId: NOZZLE_1, closingReading: 150 },
        { nozzleId: NOZZLE_2, closingReading: 260 },
      ],
      terminalEntries: [{ terminalId: TERMINAL, cardAmount: 300, upiAmount: 200 }],
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.replaced).toBe(true);

    // Still exactly ONE handover row and ONE (swapped) terminal entry.
    const handovers = await db
      .select()
      .from(schema.attendantHandovers)
      .where(eq(schema.attendantHandovers.shiftId, SHIFT));
    expect(handovers).toHaveLength(1);
    // Drawer: 1000 + (10,400 − 500) − 2000 dropped = 8900 → handed 9900 = +1000.
    expect(handovers[0]).toMatchObject({
      cashHandedOver: '9900.00',
      userId: ATTENDANT,
      openingFloat: '1000.00',
      cashDrops: '2000.00',
      expectedCash: '8900.00',
      varianceAmount: '1000.00',
    });

    const entries = await db
      .select()
      .from(schema.handoverTerminalEntries)
      .where(eq(schema.handoverTerminalEntries.shiftId, SHIFT));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ cardAmount: '300.00', upiAmount: '200.00', batchRef: null });
  });
});
