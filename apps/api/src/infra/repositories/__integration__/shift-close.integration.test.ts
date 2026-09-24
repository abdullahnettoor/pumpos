import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { and, eq } from 'drizzle-orm';
import { schema, type DbClient } from '@pump/db';
import { CloseShift, type ExecutionContext } from '@pump/core';
import { runInTransaction } from '../../transaction.js';
import { LedgerPostingService } from '../../ledger-posting.js';
import { DrizzleShiftSummaryProjector } from '../../shift-summary-projection.js';
import {
  DrizzleCloseShiftContextReader,
  DrizzleNozzleReadingRepository,
  DrizzleShiftRepository,
  DrizzleShiftSummaryWriter,
  DrizzleStockMovementWriter,
} from '../station-ops-repositories.js';

/**
 * The consolidated close-shift path against a real Postgres (#229).
 *
 * The recon totals CTE, the batched nozzle-reading UPDATE … FROM (VALUES …),
 * the single-statement summary projection, and the batched ledger posting are
 * all raw SQL a fake db cannot validate — only the real planner can prove the
 * drawer figures, the stored snapshot, and the ledger postings still come out
 * exactly as the previous per-query implementation produced them.
 *
 * Runs only when TEST_DATABASE_URL is set (CI provides a service container).
 */

const CONNECTION = process.env.TEST_DATABASE_URL;
const TEST_SCHEMA = 'shift_close_it';

const ORG = '00000000-0000-0000-0000-00000000b101';
const STATION = '00000000-0000-0000-0000-00000000b102';
const MANAGER = '00000000-0000-0000-0000-00000000b103';
const ATTENDANT = '00000000-0000-0000-0000-00000000b104';
const COUNTER_STAFF = '00000000-0000-0000-0000-00000000b105';
const TEMPLATE = '00000000-0000-0000-0000-00000000b106';
const DAY = '00000000-0000-0000-0000-00000000b107';
const SHIFT = '00000000-0000-0000-0000-00000000b108';
const FUEL = '00000000-0000-0000-0000-00000000b109';
const OIL = '00000000-0000-0000-0000-00000000b10a';
const TANK = '00000000-0000-0000-0000-00000000b10b';
const DU = '00000000-0000-0000-0000-00000000b10c';
const NOZZLE_1 = '00000000-0000-0000-0000-00000000b10d';
const NOZZLE_2 = '00000000-0000-0000-0000-00000000b10e';
const READING_1 = '00000000-0000-0000-0000-00000000b10f';
const READING_2 = '00000000-0000-0000-0000-00000000b110';
const TERMINAL = '00000000-0000-0000-0000-00000000b111';
const HANDOVER = '00000000-0000-0000-0000-00000000b112';
const CUSTOMER = '00000000-0000-0000-0000-00000000b113';
const VEHICLE = '00000000-0000-0000-0000-00000000b114';
const SUPPLIER = '00000000-0000-0000-0000-00000000b115';
const CATEGORY = '00000000-0000-0000-0000-00000000b116';
const INCOME_CATEGORY = '00000000-0000-0000-0000-00000000b117';
const CASH_ACCOUNT = '00000000-0000-0000-0000-00000000b118';

const BOOTSTRAP = `
  do $$ begin
    if not exists (select from pg_roles where rolname = 'authenticated') then
      create role authenticated;
    end if;
    if not exists (select from pg_roles where rolname = 'anon') then
      create role anon;
    end if;
  exception when others then
    -- Another integration file may create the shared roles concurrently.
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

describe.skipIf(!CONNECTION)('CloseShift consolidated path against real Postgres', () => {
  let sql: postgres.Sql;
  let db: DbClient;
  let result: any;

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
    result = await close();
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
      { id: MANAGER, organizationId: ORG, fullName: 'Meera', role: 'Manager' },
      { id: ATTENDANT, organizationId: ORG, fullName: 'Arun', role: 'Attendant' },
      { id: COUNTER_STAFF, organizationId: ORG, fullName: 'Divya', role: 'Staff' },
    ]);
    await db.insert(schema.shiftTemplates).values({
      id: TEMPLATE,
      organizationId: ORG,
      name: 'Morning',
      startTime: '06:00',
      endTime: '14:00',
    });
    await db.insert(schema.products).values([
      { id: FUEL, organizationId: ORG, name: 'Petrol', code: 'MS', productType: 'FUEL', unit: 'L' },
      {
        id: OIL,
        organizationId: ORG,
        name: 'Engine Oil',
        code: 'OIL',
        productType: 'LUBRICANT',
        unit: 'pcs',
      },
    ]);
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
        id: READING_1,
        shiftId: SHIFT,
        nozzleId: NOZZLE_1,
        openingReading: '100',
        closingReading: '100',
        volumeSold: '0',
        unitPrice: '100',
      },
      {
        id: READING_2,
        shiftId: SHIFT,
        nozzleId: NOZZLE_2,
        openingReading: '200',
        closingReading: '200',
        volumeSold: '0',
        unitPrice: '90',
      },
    ]);

    // Terminal WITHOUT a clearing account → the batched posting must create
    // "HDFC Clearing" on the fly (cold path) and route the batch to it.
    await db.insert(schema.paymentTerminals).values({
      id: TERMINAL,
      organizationId: ORG,
      stationId: STATION,
      label: 'POS 1',
      provider: 'HDFC',
    });
    await db.insert(schema.attendantHandovers).values({
      id: HANDOVER,
      organizationId: ORG,
      stationId: STATION,
      shiftId: SHIFT,
      userId: ATTENDANT,
      duId: DU,
      cashHandedOver: '5000',
      cardHandedOver: '400',
      upiHandedOver: '100',
      creditHandedOver: '0',
      expectedSales: '5500',
      varianceAmount: '0',
    });
    await db.insert(schema.handoverTerminalEntries).values({
      organizationId: ORG,
      stationId: STATION,
      handoverId: HANDOVER,
      shiftId: SHIFT,
      terminalId: TERMINAL,
      duId: DU,
      cardAmount: '400',
      upiAmount: '100',
    });

    // Merchandise cash: 120 by the handover attendant (already inside their
    // declared cash) and 120-with-20-non-cash by counter staff with NO handover
    // → 100 must be added to drawer cash with a per-seller breakdown line.
    await db.insert(schema.sales).values([
      {
        documentNumber: 'SAL-1',
        shiftId: SHIFT,
        businessDayId: DAY,
        saleType: 'Product',
        paymentMethod: 'Cash',
        attendantId: ATTENDANT,
        subtotalAmount: '120',
        taxAmount: '0',
        totalAmount: '120',
      },
      {
        documentNumber: 'SAL-2',
        shiftId: SHIFT,
        businessDayId: DAY,
        saleType: 'Product',
        paymentMethod: 'Cash',
        attendantId: COUNTER_STAFF,
        subtotalAmount: '120',
        taxAmount: '0',
        totalAmount: '120',
        nonCashAmount: '20',
      },
    ]);

    await db.insert(schema.customers).values({
      id: CUSTOMER,
      organizationId: ORG,
      customerType: 'Fleet',
      name: 'Sharma Transports',
    });
    await db.insert(schema.customerVehicles).values({
      id: VEHICLE,
      organizationId: ORG,
      customerId: CUSTOMER,
      registrationNumber: 'KL07AB1234',
      vehicleType: 'Truck',
    });
    // Office Records on the shift's day (ADR 0005): they carry an Entry Date
    // and a Funding Account and must NOT reach the shift's drawer.
    await db.insert(schema.financialAccounts).values({
      id: CASH_ACCOUNT,
      organizationId: ORG,
      stationId: STATION,
      accountType: 'CASH_IN_HAND',
      name: 'Cash in Hand',
    });
    await db.insert(schema.collections).values([
      {
        documentNumber: 'COL-1',
        customerId: CUSTOMER,
        organizationId: ORG,
        stationId: STATION,
        entryDate: '2026-03-10',
        fundingAccountId: CASH_ACCOUNT,
        amount: '300',
        paymentMethod: 'Cash',
      },
      {
        documentNumber: 'COL-2',
        customerId: CUSTOMER,
        organizationId: ORG,
        stationId: STATION,
        entryDate: '2026-03-10',
        fundingAccountId: CASH_ACCOUNT,
        amount: '150',
        paymentMethod: 'Card',
      },
    ]);
    await db
      .insert(schema.expenseCategories)
      .values({ id: CATEGORY, organizationId: ORG, name: 'Tea' });
    await db.insert(schema.expenses).values([
      {
        organizationId: ORG,
        stationId: STATION,
        entryDate: '2026-03-10',
        fundingAccountId: CASH_ACCOUNT,
        categoryId: CATEGORY,
        amount: '50',
        affectsDrawer: true,
      },
      {
        organizationId: ORG,
        stationId: STATION,
        entryDate: '2026-03-10',
        fundingAccountId: CASH_ACCOUNT,
        categoryId: CATEGORY,
        amount: '999',
        affectsDrawer: true,
        status: 'VOIDED',
      },
    ]);
    await db.insert(schema.suppliers).values({ id: SUPPLIER, organizationId: ORG, name: 'IOC' });
    await db.insert(schema.supplierTransactions).values({
      organizationId: ORG,
      stationId: STATION,
      entryDate: '2026-03-10',
      fundingAccountId: CASH_ACCOUNT,
      supplierId: SUPPLIER,
      transactionType: 'Payment',
      amount: '75',
      affectsDrawer: true,
    });
    await db
      .insert(schema.incomeCategories)
      .values({ id: INCOME_CATEGORY, organizationId: ORG, name: 'Scrap' });
    await db.insert(schema.otherIncome).values({
      categoryId: INCOME_CATEGORY,
      organizationId: ORG,
      stationId: STATION,
      entryDate: '2026-03-10',
      fundingAccountId: CASH_ACCOUNT,
      amount: '25',
      affectsDrawer: true,
    });

    await db.insert(schema.customerTransactions).values({
      shiftId: SHIFT,
      businessDayId: DAY,
      customerId: CUSTOMER,
      vehicleId: VEHICLE,
      productId: FUEL,
      attendantId: ATTENDANT,
      duId: DU,
      transactionType: 'Credit Sale',
      referenceType: 'CREDIT_SALE',
      amount: '2000',
      quantity: '20',
      unitPrice: '100',
    });
  }

  function ctx(): ExecutionContext {
    return {
      organizationId: ORG,
      stationId: STATION,
      actorId: MANAGER,
      actorRole: 'Manager',
      clock: { now: () => new Date('2026-03-10T14:00:00.000Z') },
      ids: { newId: () => crypto.randomUUID() },
    } as unknown as ExecutionContext;
  }

  async function close() {
    return runInTransaction(db, async (tx, events) => {
      const r = await new CloseShift({
        context: new DrizzleCloseShiftContextReader(tx),
        shifts: new DrizzleShiftRepository(tx),
        nozzleReadings: new DrizzleNozzleReadingRepository(tx),
        stockMovements: new DrizzleStockMovementWriter(tx),
        summaries: new DrizzleShiftSummaryWriter(tx),
        projector: new DrizzleShiftSummaryProjector(tx),
        events,
      }).execute(
        {
          shiftId: SHIFT,
          closingCash: 5100, // TODO(#274): openingCash dropped; office records never reach the drawer
          nozzleReadings: [
            { nozzleId: NOZZLE_1, closingReading: 150 },
            { nozzleId: NOZZLE_2, closingReading: 260 },
          ],
        },
        ctx(),
      );
      if (r.success) {
        const snap = r.data.snapshot as any;
        await new LedgerPostingService(tx).postShiftClose(
          ORG,
          {
            id: SHIFT,
            stationId: STATION,
            businessDayId: DAY,
            closedAt: r.data.shift.closedAt ?? '',
          },
          { cashSales: Number(snap?.reconciliation?.cashSales ?? 0) },
        );
      }
      return r;
    });
  }

  it('closes the shift with the exact drawer reconciliation of the old per-query reader', () => {
    expect(result.success).toBe(true);
    const snap = result.data.snapshot as any;
    expect(snap.reconciliation).toMatchObject({
      // handover cash 5000 + counter-staff merch cash (120 − 20 non-cash)
      cashSales: 5100,
      handoverCash: 5000,
      merchCashOutsideHandover: 100,
      // Office Records carry no Shift (ADR 0005): none of them reach the drawer.
      cashCollections: 0,
      cardCollections: 0,
      upiCollections: 0,
      creditCollections: 0,
      cashIncome: 0,
      drawerExpenses: 0,
      drawerSupplierPayments: 0,
    });
    expect(snap.reconciliation.merchCashOutsideHandoverBreakdown).toEqual([
      { sellerName: 'Divya', amount: 100 },
    ]);
    // TODO(#274): 0 + 5100 (openingCash dropped; office money is not drawer cash)
    expect(snap.expectedDrawerCash).toBe(5100);
    expect(snap.cashVariance).toBe(0);
  });

  it('applies closing readings via the batched update', async () => {
    const readings = await db
      .select()
      .from(schema.nozzleReadings)
      .where(eq(schema.nozzleReadings.shiftId, SHIFT));
    const byId = new Map(readings.map((r) => [r.id, r]));
    expect(byId.get(READING_1)).toMatchObject({ closingReading: '150.000', volumeSold: '50.000' });
    expect(byId.get(READING_2)).toMatchObject({ closingReading: '260.000', volumeSold: '60.000' });
  });

  it('persists the FULL projected snapshot in one write', async () => {
    const [row] = await db
      .select()
      .from(schema.shiftSummaries)
      .where(eq(schema.shiftSummaries.shiftId, SHIFT));
    const snap = row.snapshotData as any;
    expect(snap.templateName).toBe('Morning');
    expect(snap.closedByName).toBe('Meera');
    expect(snap.totalNetVolumeSold).toBe(110);
    expect(snap.totalFuelSalesValue).toBe(50 * 100 + 60 * 90);
    expect(snap.nozzleReadings.map((r: any) => r.nozzleName)).toEqual(['N1', 'N2']);
    expect(snap.handovers).toHaveLength(1);
    expect(snap.handovers[0]).toMatchObject({ attendantName: 'Arun', cashHandedOver: '5000.00' });
    expect(snap.handovers[0].terminalEntries[0]).toMatchObject({
      terminalLabel: 'POS 1',
      cardAmount: '400.00',
      upiAmount: '100.00',
    });
    expect(snap.terminalBreakdown[0]).toMatchObject({ card: 400, upi: 100, provider: 'HDFC' });
    // Expenses and collections are Office Records, not part of a Shift Summary.
    expect(snap.expenses).toHaveLength(0);
    expect(snap.collections).toHaveLength(0);
    expect(snap.creditSales[0]).toMatchObject({
      amount: 2000,
      customerName: 'Sharma Transports',
      vehicleNumber: 'KL07AB1234',
      productCode: 'MS',
    });
    expect(snap.creditSalesTotal).toBe(2000);
    expect(snap.cashSalesSum).toBe(5100);
    expect(snap.cardCollectionsSum).toBe(0); // collections are Office Records
  });

  it('records fuel SALE stock movements net of testing', async () => {
    const movements = await db
      .select()
      .from(schema.stockMovements)
      .where(eq(schema.stockMovements.shiftId, SHIFT));
    expect(movements).toHaveLength(2);
    expect(movements.map((m) => Number(m.quantity)).sort((a, b) => a - b)).toEqual([-60, -50]);
  });

  it('posts the batched ledger entries, provisioning the provider clearing account', async () => {
    const entries = await db
      .select()
      .from(schema.ledgerEntries)
      .where(eq(schema.ledgerEntries.shiftId, SHIFT));
    expect(entries).toHaveLength(2);
    const bySource = new Map(entries.map((e) => [e.sourceType, e]));
    expect(bySource.get('SALE_CASH')).toMatchObject({ amount: '5100.00', direction: 'in' });
    expect(bySource.get('SALE_CARD')).toMatchObject({
      amount: '500.00',
      direction: 'in',
      notes: 'Shift card/UPI · POS 1',
    });

    const accounts = await db
      .select()
      .from(schema.financialAccounts)
      .where(eq(schema.financialAccounts.organizationId, ORG));
    const names = accounts.map((a) => a.name).sort();
    expect(names).toEqual(['Cash in Hand', 'HDFC Clearing']);
    const clearing = accounts.find((a) => a.name === 'HDFC Clearing')!;
    expect((clearing.metadata as any).provider).toBe('HDFC');
    expect(bySource.get('SALE_CARD')!.accountId).toBe(clearing.id);
  });

  it('books shift-close cash on the calendar date of the close instant (ADR 0005)', async () => {
    const entryDateOf = async () => {
      const [cash] = await db
        .select({ entryDate: schema.ledgerEntries.entryDate })
        .from(schema.ledgerEntries)
        .where(
          and(
            eq(schema.ledgerEntries.shiftId, SHIFT),
            eq(schema.ledgerEntries.sourceType, 'SALE_CASH'),
          ),
        );
      return cash.entryDate;
    };
    // Closed 19:30 IST on the 10th: booked the 10th.
    expect(await entryDateOf()).toBe('2026-03-10');
    // A Delayed Closure at 01:30 IST on the 12th books on the 12th, not the
    // shift's Business Date (the 10th).
    const repost = (closedAt: string) =>
      runInTransaction(db, async (tx) => {
        await new LedgerPostingService(tx).postShiftClose(
          ORG,
          { id: SHIFT, stationId: STATION, businessDayId: DAY, closedAt },
          { cashSales: 5100 },
        );
        return { success: true as const, data: null };
      });
    await repost('2026-03-11T20:00:00.000Z');
    expect(await entryDateOf()).toBe('2026-03-12');
    await repost('2026-03-10T14:00:00.000Z');
  });

  it('refuses to post when the business day row is missing, instead of guessing a date (#249)', async () => {
    await expect(
      runInTransaction(db, async (tx) => {
        await new LedgerPostingService(tx).postShiftClose(
          ORG,
          {
            id: SHIFT,
            stationId: STATION,
            businessDayId: crypto.randomUUID(),
            closedAt: '2026-03-10T14:00:00.000Z',
          },
          { cashSales: 1 },
        );
        return { success: true as const, data: null };
      }),
    ).rejects.toThrow(/BUSINESS_DAY_MISSING/);
    // the rollback left the original postings intact
    const entries = await db
      .select()
      .from(schema.ledgerEntries)
      .where(eq(schema.ledgerEntries.shiftId, SHIFT));
    expect(entries).toHaveLength(2);
  });

  it('emits CASH_DECLARED and SHIFT_CLOSED events', async () => {
    const events = await db
      .select()
      .from(schema.events)
      .where(eq(schema.events.stationId, STATION));
    const types = events.map((e) => e.eventType);
    expect(types).toContain('CASH_DECLARED');
    expect(types).toContain('SHIFT_CLOSED');
  });
});
