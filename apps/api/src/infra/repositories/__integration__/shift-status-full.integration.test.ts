import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { Hono } from 'hono';
import { schema, type DbClient } from '@pump/db';
import { shiftsRouter } from '../../../routes/shifts.js';

/**
 * Full-mode GET /shifts/status against a real Postgres (#230).
 *
 * Full mode was rewritten from ~25 sequential drizzle selects into three
 * consolidated jsonb statements; the payload contract is pinned here against
 * the real planner — sections, enrichment names, reconciliation figures, and
 * the last-shift/recent-closed slices must come out exactly as the per-query
 * implementation produced them.
 *
 * Runs only when TEST_DATABASE_URL is set (CI provides a service container).
 */

const CONNECTION = process.env.TEST_DATABASE_URL;
const TEST_SCHEMA = 'shift_status_full_it';

const ORG = '00000000-0000-0000-0000-00000000e101';
const STATION = '00000000-0000-0000-0000-00000000e102';
const MANAGER = '00000000-0000-0000-0000-00000000e103';
const ATTENDANT = '00000000-0000-0000-0000-00000000e104';
const TEMPLATE = '00000000-0000-0000-0000-00000000e105';
const DAY = '00000000-0000-0000-0000-00000000e106';
const OPEN_SHIFT = '00000000-0000-0000-0000-00000000e107';
const CLOSED_SHIFT = '00000000-0000-0000-0000-00000000e108';
const FUEL = '00000000-0000-0000-0000-00000000e109';
const TANK = '00000000-0000-0000-0000-00000000e10a';
const DU = '00000000-0000-0000-0000-00000000e10b';
const DU_MAINTENANCE = '00000000-0000-0000-0000-0000000000f1';
const NOZZLE_MAINTENANCE = '00000000-0000-0000-0000-0000000000f2';
const NOZZLE = '00000000-0000-0000-0000-00000000e10c';
const TERMINAL = '00000000-0000-0000-0000-00000000e10d';
const HANDOVER = '00000000-0000-0000-0000-00000000e10e';
const CASH_ACCOUNT = '00000000-0000-0000-0000-00000000c1ff';
const CUSTOMER = '00000000-0000-0000-0000-00000000e10f';

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

describe.skipIf(!CONNECTION)('GET /shifts/status full mode against real Postgres', () => {
  let sql: postgres.Sql;
  let db: DbClient;
  let data: any;

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

    const app = new Hono<{ Variables: { db: any; user: any } }>();
    app.use('*', async (c, next) => {
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
    app.route('/', shiftsRouter);
    const res = await app.request(`/status?stationId=${STATION}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    data = body.data;
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
    // The open form lists every active user of the station (#301).
    await db
      .insert(schema.userStationAssignments)
      .values([MANAGER, ATTENDANT].map((userId) => ({ userId, stationId: STATION })));
    await db.insert(schema.shiftTemplates).values({
      id: TEMPLATE,
      organizationId: ORG,
      name: 'Morning',
      startTime: '06:00',
      endTime: '14:00',
      isActive: true,
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
    await db.insert(schema.nozzles).values({
      id: NOZZLE,
      organizationId: ORG,
      stationId: STATION,
      duId: DU,
      tankId: TANK,
      productId: FUEL,
      name: 'N1',
      currentReading: '100',
    });
    // A pump out of service, and its nozzle. The dispenser list already
    // filtered these out; the nozzle list did not, so the opening-readings
    // grid still asked for a reading on a pump nobody can work (#258).
    await db.insert(schema.dispenserUnits).values({
      id: DU_MAINTENANCE,
      organizationId: ORG,
      stationId: STATION,
      name: 'DU-2',
      code: 'DU2',
      status: 'MAINTENANCE',
    });
    await db.insert(schema.nozzles).values({
      id: NOZZLE_MAINTENANCE,
      organizationId: ORG,
      stationId: STATION,
      duId: DU_MAINTENANCE,
      tankId: TANK,
      productId: FUEL,
      name: 'N9',
      currentReading: '100',
    });
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
    // A recently-closed shift with a stored summary → lastShift + recentClosedShifts.
    await db.insert(schema.shifts).values({
      id: CLOSED_SHIFT,
      organizationId: ORG,
      stationId: STATION,
      businessDayId: DAY,
      shiftTemplateId: TEMPLATE,
      status: 'CLOSED',
      openedBy: MANAGER,
      closedBy: MANAGER,
      closedAt: new Date(),
      closingCash: '900',
    });
    await db.insert(schema.shiftSummaries).values({
      shiftId: CLOSED_SHIFT,
      snapshotData: { templateName: 'Morning', cashVariance: 0 },
    });
    await db.insert(schema.shifts).values({
      id: OPEN_SHIFT,
      organizationId: ORG,
      stationId: STATION,
      businessDayId: DAY,
      shiftTemplateId: TEMPLATE,
      status: 'OPEN',
      openedBy: MANAGER,
    });
    await db.insert(schema.nozzleReadings).values({
      shiftId: OPEN_SHIFT,
      nozzleId: NOZZLE,
      openingReading: '100',
      closingReading: '100',
      volumeSold: '0',
      unitPrice: '100',
    });
    // A reading already taken on the pump that later went out of service.
    // Its shift must still be closable.
    await db.insert(schema.nozzleReadings).values({
      shiftId: OPEN_SHIFT,
      nozzleId: NOZZLE_MAINTENANCE,
      openingReading: '100',
      closingReading: '100',
      volumeSold: '0',
      unitPrice: '100',
    });
    await db.insert(schema.shiftStaffAssignments).values({
      shiftId: OPEN_SHIFT,
      userId: ATTENDANT,
      duId: DU,
    });
    await db.insert(schema.shiftTerminalLinks).values({
      shiftId: OPEN_SHIFT,
      terminalId: TERMINAL,
      duId: DU,
    });
    await db.insert(schema.attendantHandovers).values({
      id: HANDOVER,
      organizationId: ORG,
      stationId: STATION,
      shiftId: OPEN_SHIFT,
      userId: ATTENDANT,
      duId: DU,
      cashHandedOver: '5000',
      cardHandedOver: '0',
      upiHandedOver: '0',
      creditHandedOver: '0',
      expectedSales: '5000',
      varianceAmount: '0',
    });
    await db.insert(schema.handoverTerminalEntries).values({
      organizationId: ORG,
      stationId: STATION,
      handoverId: HANDOVER,
      shiftId: OPEN_SHIFT,
      terminalId: TERMINAL,
      duId: DU,
      cardAmount: '400',
      upiAmount: '100',
    });
    await db.insert(schema.customers).values({
      id: CUSTOMER,
      organizationId: ORG,
      customerType: 'Fleet',
      name: 'Sharma Transports',
    });
    await db.insert(schema.customerTransactions).values({
      shiftId: OPEN_SHIFT,
      businessDayId: DAY,
      customerId: CUSTOMER,
      productId: FUEL,
      attendantId: ATTENDANT,
      duId: DU,
      transactionType: 'Credit Sale',
      referenceType: 'CREDIT_SALE',
      amount: '2000',
      quantity: '20',
      unitPrice: '100',
    });
    // Merchandise cash sale by the attendant (attributed + merch tracker section).
    await db.insert(schema.sales).values({
      documentNumber: 'SAL-1',
      shiftId: OPEN_SHIFT,
      businessDayId: DAY,
      saleType: 'Product',
      paymentMethod: 'Cash',
      attendantId: ATTENDANT,
      subtotalAmount: '120',
      taxAmount: '0',
      totalAmount: '120',
      nonCashAmount: '20',
    });
    // An Office Record on the same day (ADR 0005): it must not reach the drawer.
    await db.insert(schema.financialAccounts).values({
      id: CASH_ACCOUNT,
      organizationId: ORG,
      stationId: STATION,
      accountType: 'CASH_IN_HAND',
      name: 'Cash in Hand',
    });
    await db.insert(schema.collections).values({
      documentNumber: 'COL-1',
      customerId: CUSTOMER,
      organizationId: ORG,
      stationId: STATION,
      entryDate: '2026-03-10',
      fundingAccountId: CASH_ACCOUNT,
      amount: '300',
      paymentMethod: 'Cash',
    });
  }

  it('serves the open business day and the enriched active shift', () => {
    expect(data.businessDay).toMatchObject({ id: DAY, status: 'OPEN', businessDate: '2026-03-10' });
    expect(data.activeShift).toMatchObject({
      id: OPEN_SHIFT,
      templateName: 'Morning',
      businessDate: '2026-03-10',
      scheduledStartTime: '06:00',
      scheduledEndTime: '14:00',
      openedByName: 'Meera',
    });
    expect(data.shift.id).toBe(OPEN_SHIFT);
    // Two nozzles were read at open; one of their pumps has since gone out of
    // service, and its reading stays with the shift regardless.
    expect(data.readings).toHaveLength(2);
  });

  it('enriches nozzle readings with nozzle/product/tank/DU names', () => {
    expect(data.activeShift.nozzleReadings[0]).toMatchObject({
      nozzleName: 'N1',
      productName: 'Petrol',
      productCode: 'MS',
      unit: 'L',
      tankName: 'T1',
      duId: DU,
      duName: 'DU-1',
      duCode: 'DU1',
      openingReading: '100.000',
    });
  });

  it('carries staff assignments with attribution and credit lines', () => {
    expect(data.activeShift.staffAssignments).toHaveLength(1);
    const sa = data.activeShift.staffAssignments[0];
    expect(sa).toMatchObject({
      userName: 'Arun',
      duName: 'DU-1',
      duCode: 'DU1',
      creditTotal: 2000,
    });
    // Cash merch 120 with 20 on the terminal → 100 cash attributed.
    expect(sa.attributed).toMatchObject({
      merchandiseCash: 100,
      merchandiseCard: 20,
      merchandiseTotal: 120,
      expectedExtra: 100,
    });
    expect(sa.creditSales[0]).toMatchObject({
      customerName: 'Sharma Transports',
      amount: 2000,
      quantity: 20,
    });
  });

  it('carries handovers with terminal entries and terminal links', () => {
    const h = data.activeShift.handovers[0];
    expect(h).toMatchObject({
      attendantName: 'Arun',
      duName: 'DU-1',
      cashHandedOver: '5000.00',
      creditTotal: 2000,
    });
    expect(h.terminalEntries[0]).toMatchObject({ cardAmount: '400.00', upiAmount: '100.00' });
    expect(data.activeShift.terminalLinks[0]).toMatchObject({
      terminalId: TERMINAL,
      label: 'POS 1',
      provider: 'HDFC',
      duName: 'DU-1',
    });
  });

  it('computes the same drawer reconciliation the close path uses', () => {
    // Handover cash 5000 (attendant's merch cash is inside it); no outside sellers.
    expect(data.activeShift.reconciliation).toMatchObject({
      cashSales: 5000,
      handoverCash: 5000,
      merchCashOutsideHandover: 0,
      openingFloat: 0,
      handoverCashDrops: 0,
      // Σ floats + cash sales − drops; collections never reach the drawer.
      expectedDrawerCash: 5000,
    });
    expect(data.activeShift.reconciliation).not.toHaveProperty('cashCollections');
  });

  it('serves the last closed shift with its stored summary and the recent list', () => {
    expect(data.lastShift).toMatchObject({
      id: CLOSED_SHIFT,
      status: 'CLOSED',
      templateName: 'Morning',
      closedByName: 'Meera',
    });
    expect(data.lastShiftSummary.snapshotData).toMatchObject({ templateName: 'Morning' });
    expect(data.recentClosedShifts).toHaveLength(1);
    expect(data.recentClosedShifts[0]).toMatchObject({ id: CLOSED_SHIFT, templateName: 'Morning' });
    // An open shift exists, so reopen is not offered.
    expect(data.canReopenLastShift).toBe(false);
    expect(data.gracePeriodExpiresAt).not.toBeNull();
  });

  it('serves the station reference data', () => {
    expect(data.templates.map((t: any) => t.name)).toEqual(['Morning']);
    expect(data.nozzles[0]).toMatchObject({
      name: 'N1',
      productName: 'Petrol',
      productCode: 'MS',
      tankName: 'T1',
    });
    // A Manager on the station may cover a pump for an absent attendant (#301).
    expect(data.staff.map((u: any) => u.fullName).sort()).toEqual(['Arun', 'Meera']);
    expect(data.dispensers[0]).toMatchObject({ name: 'DU-1' });
    expect(data.terminals[0]).toMatchObject({ label: 'POS 1' });
  });

  describe('a dispenser out of service (#258)', () => {
    it('leaves it out of the dispenser list', () => {
      expect(data.dispensers.map((d: any) => d.name)).toEqual(['DU-1']);
    });

    it('leaves its nozzles out too, so it disappears completely', () => {
      // Half-filtering is worse than not filtering: the pump vanishes from
      // assignment but its nozzle still demands an opening reading, and with
      // the open now blocked on unassigned pumps the two halves have to agree.
      expect(data.nozzles.map((n: any) => n.name)).toEqual(['N1']);
    });

    it('still carries readings already taken on it by the running shift', () => {
      // The filter governs the reference data a shift is STARTED from, not a
      // shift already running. Dropping these would strand an open shift:
      // a pump put out of service mid-shift would lose the closing reading
      // its own opening reading demands, and the shift could never close.
      const onShift = data.activeShift.nozzleReadings.map((r: any) => r.nozzleName ?? r.nozzleId);
      expect(onShift).toHaveLength(2);
    });
  });
});
