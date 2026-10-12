import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { Hono } from 'hono';
import { and, asc, eq, getTableColumns, getTableName, inArray, is, sql as dsql } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import { ok } from '@pump/core';
import { schema, type DbClient } from '@pump/db';
import { runInTransaction } from '../../transaction.js';
import {
  seedDemoOrganization,
  expireDemoOrganizations,
} from '../../../services/demo/demo-lifecycle.js';
import type { DemoAuthAdmin } from '../../../services/demo/demo-lifecycle.js';
import { platformDemosRouter } from '../../../routes/platform-demos.js';

/**
 * Demo stations against a real Postgres (#367, #368): the template is written
 * through the core use-cases, and the lifecycle (create → reset → extend →
 * delete, expiry) leaves no rows behind.
 *
 * Runs only when TEST_DATABASE_URL is set (CI provides a service container).
 */

const CONNECTION = process.env.TEST_DATABASE_URL;
const TEST_SCHEMA = 'demo_station_it';
// 21:00 IST on 2026-03-15: today's business date is 2026-03-15.
const NOW = new Date('2026-03-15T15:30:00Z');
const TODAY = '2026-03-15';
const SETUP = {
  stationName: 'Sample Fuels',
  town: 'Thrissur',
  tanks: 2,
  nozzles: 6,
  attendants: 3,
};

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

/** Every table in the Drizzle schema that has an `organization_id` column. */
function organizationScopedTables(): PgTable[] {
  return (Object.values(schema) as unknown[]).filter(
    (value): value is PgTable => is(value, PgTable) && 'organizationId' in getTableColumns(value),
  );
}

function fakeAuthAdmin() {
  const calls = { invited: [] as string[], deleted: [] as string[], banned: [] as string[] };
  const admin: DemoAuthAdmin = {
    createUser: async () => {
      throw new Error('not used: demos here are created with a prospect email');
    },
    inviteUserByEmail: async (email: string) => {
      calls.invited.push(email);
      return { id: crypto.randomUUID(), email } as Awaited<
        ReturnType<DemoAuthAdmin['inviteUserByEmail']>
      >;
    },
    updateAppMetadata: async () => {},
    banUser: async (id: string) => {
      calls.banned.push(id);
    },
    deleteUser: async (id: string) => {
      calls.deleted.push(id);
    },
  };
  return { admin, calls };
}

describe.skipIf(!CONNECTION)('demo stations against real Postgres', () => {
  let sql: postgres.Sql;
  let db: DbClient;

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
      max: 4,
      onnotice: () => {},
      connection: { search_path: TEST_SCHEMA },
    });
    db = drizzle(sql, { schema }) as unknown as DbClient;
  }, 60_000);

  afterAll(async () => {
    if (sql) {
      await sql.unsafe('select pg_advisory_lock(872634)');
      await sql.unsafe(`drop schema if exists ${TEST_SCHEMA} cascade`);
      await sql.unsafe('select pg_advisory_unlock(872634)');
      await sql.end();
    }
  });

  async function emptyDemoOrganization(name: string) {
    const [organization] = await db
      .insert(schema.organizations)
      .values({ name, isDemo: true, demoExpiresAt: new Date(NOW.getTime() + 2 * 86_400_000) })
      .returning();
    const [owner] = await db
      .insert(schema.users)
      .values({ organizationId: organization.id, fullName: 'Demo Owner', role: 'Owner' })
      .returning();
    return { organizationId: organization.id, ownerId: owner.id };
  }

  async function seed(name: string) {
    const { organizationId, ownerId } = await emptyDemoOrganization(name);
    const result = await runInTransaction(db, async (tx) =>
      ok(await seedDemoOrganization(tx, organizationId, ownerId, SETUP, { now: NOW })),
    );
    if (!result.success) throw new Error(result.error.message);
    return { organizationId, ...result.data };
  }

  async function rowsLeftFor(organizationId: string) {
    const left: Record<string, number> = {};
    for (const table of organizationScopedTables()) {
      const column = getTableColumns(table).organizationId;
      const [row] = await db
        .select({ count: dsql<number>`count(*)::int` })
        .from(table)
        .where(eq(column, organizationId));
      if (row.count > 0) left[getTableName(table)] = row.count;
    }
    return left;
  }

  describe('template (#367)', () => {
    let demo: Awaited<ReturnType<typeof seed>>;

    beforeAll(async () => {
      demo = await seed('Template Demo');
    }, 120_000);

    it('marks the station ready for operations, so the console skips onboarding', async () => {
      const stations = await db
        .select({ onboardingStatus: schema.stations.onboardingStatus })
        .from(schema.stations)
        .where(eq(schema.stations.organizationId, demo.organizationId));
      expect(stations).toEqual([{ onboardingStatus: 'READY_FOR_OPERATIONS' }]);
    });

    it('saves seven DSSRs, one per closed business day before today', async () => {
      const dssrs = await db
        .select()
        .from(schema.dssrSnapshots)
        .where(eq(schema.dssrSnapshots.organizationId, demo.organizationId));
      expect(dssrs).toHaveLength(7);
      expect(dssrs.map((row) => row.businessDate).sort()).toEqual([
        '2026-03-08',
        '2026-03-09',
        '2026-03-10',
        '2026-03-11',
        '2026-03-12',
        '2026-03-13',
        '2026-03-14',
      ]);
      const days = await db
        .select()
        .from(schema.businessDays)
        .where(eq(schema.businessDays.organizationId, demo.organizationId));
      expect(days.filter((day) => day.status === 'CLOSED')).toHaveLength(7);
      expect(days.find((day) => day.businessDate === TODAY)?.status).toBe('OPEN');
      // Real figures, composed by the DSSR use-case from the day's shifts.
      for (const dssr of dssrs) {
        const data = dssr.snapshotData as Record<string, unknown>;
        expect(data.source).toBeUndefined();
        expect((data.shifts as unknown[]).length).toBe(2);
      }
      const closedHandovers = await db
        .select({ variance: schema.attendantHandovers.varianceAmount })
        .from(schema.attendantHandovers)
        .innerJoin(schema.shifts, eq(schema.shifts.id, schema.attendantHandovers.shiftId))
        .where(
          and(
            eq(schema.shifts.organizationId, demo.organizationId),
            eq(schema.shifts.status, 'CLOSED'),
          ),
        );
      expect(closedHandovers).toHaveLength(15 * 3);
      for (const row of closedHandovers) expect(Number(row.variance)).toBe(0);
    });

    it('closes a morning and evening shift each past day, each with a Shift Summary', async () => {
      const shifts = await db
        .select()
        .from(schema.shifts)
        .where(eq(schema.shifts.organizationId, demo.organizationId));
      expect(shifts.filter((shift) => shift.status === 'CLOSED')).toHaveLength(15);
      const summaries = await db
        .select()
        .from(schema.shiftSummaries)
        .where(
          inArray(
            schema.shiftSummaries.shiftId,
            shifts.map((shift) => shift.id),
          ),
        );
      expect(summaries).toHaveLength(15);
      // Historical closes are stamped on their own day, not "now".
      const closed = shifts.filter(
        (shift) => shift.closedAt && shift.closedAt < new Date('2026-03-15T00:00:00Z'),
      );
      expect(closed).toHaveLength(14);
    });

    it("leaves today's evening shift open with Anitha S · DU-2's handover ₹350 short", async () => {
      const [evening] = await db
        .select()
        .from(schema.shifts)
        .where(eq(schema.shifts.id, demo.history.eveningShiftId));
      expect(evening.status).toBe('OPEN');
      const handovers = await db
        .select({
          variance: schema.attendantHandovers.varianceAmount,
          expectedCash: schema.attendantHandovers.expectedCash,
          cash: schema.attendantHandovers.cashHandedOver,
          openingFloat: schema.attendantHandovers.openingFloat,
          cashDrops: schema.attendantHandovers.cashDrops,
          attendant: schema.users.fullName,
          du: schema.dispenserUnits.name,
        })
        .from(schema.attendantHandovers)
        .innerJoin(schema.users, eq(schema.users.id, schema.attendantHandovers.userId))
        .innerJoin(
          schema.dispenserUnits,
          eq(schema.dispenserUnits.id, schema.attendantHandovers.duId),
        )
        .where(eq(schema.attendantHandovers.shiftId, evening.id));
      expect(handovers).toHaveLength(1);
      const [handover] = handovers;
      expect(handover.attendant).toBe('Anitha S');
      expect(handover.du).toBe('DU-2');
      expect(Number(handover.variance)).toBe(-350);
      expect(Number(handover.cash) - Number(handover.expectedCash)).toBe(-350);
    });

    it('records the −18 L HSD dip variance with a reason', async () => {
      const variances = await db
        .select()
        .from(schema.stockVariances)
        .where(eq(schema.stockVariances.organizationId, demo.organizationId));
      // The routine dip that measured the pending HSD tanker found no variance.
      const found = variances.filter((row) => Number(row.varianceQuantity) !== 0);
      expect(found).toHaveLength(1);
      expect(Number(found[0].varianceQuantity)).toBe(-18);
      expect(found[0].reason).toBeTruthy();
    });

    it('puts KSRTC at about 94% of its limit through several attendant credit sales', async () => {
      const [ksrtc] = await db
        .select()
        .from(schema.customers)
        .where(
          and(
            eq(schema.customers.organizationId, demo.organizationId),
            eq(schema.customers.name, 'KSRTC Depot Aluva'),
          ),
        );
      const sales = await db
        .select()
        .from(schema.customerTransactions)
        .where(eq(schema.customerTransactions.customerId, ksrtc.id));
      expect(sales.length).toBeGreaterThan(1);
      const attendants = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(
          and(
            eq(schema.users.organizationId, demo.organizationId),
            eq(schema.users.role, 'Attendant'),
          ),
        );
      for (const sale of sales) expect(attendants.map((a) => a.id)).toContain(sale.attendantId);
      const balance = sales.reduce((sum, sale) => sum + Number(sale.amount), 0);
      expect(balance / Number(ksrtc.creditLimit)).toBeCloseTo(0.94, 2);
    });

    it('records exactly one ₹15,000 Malabar bank collection, one expense and one supplier payment', async () => {
      const collections = await db
        .select()
        .from(schema.collections)
        .where(eq(schema.collections.organizationId, demo.organizationId));
      expect(collections).toHaveLength(1);
      expect(Number(collections[0].amount)).toBe(15_000);
      expect(collections[0].entryDate).toBe(TODAY);
      const expenses = await db
        .select()
        .from(schema.expenses)
        .where(eq(schema.expenses.organizationId, demo.organizationId));
      expect(expenses).toHaveLength(1);
      const payments = await db
        .select()
        .from(schema.supplierTransactions)
        .where(
          and(
            eq(schema.supplierTransactions.organizationId, demo.organizationId),
            eq(schema.supplierTransactions.transactionType, 'Payment'),
          ),
        );
      expect(payments).toHaveLength(1);
    });

    it('carries each nozzle opening reading over from its previous closing', async () => {
      const nozzles = await db
        .select()
        .from(schema.nozzles)
        .where(eq(schema.nozzles.organizationId, demo.organizationId));
      for (const nozzle of nozzles) {
        const readings = await db
          .select()
          .from(schema.nozzleReadings)
          .where(eq(schema.nozzleReadings.nozzleId, nozzle.id))
          .orderBy(asc(schema.nozzleReadings.createdAt));
        expect(readings.length).toBe(16);
        for (let i = 1; i < readings.length; i += 1)
          expect(Number(readings[i].openingReading)).toBe(Number(readings[i - 1].closingReading));
      }
    });

    it('taxes demo fuels as VAT (no GST) and lubricants as 18% GST', async () => {
      const products = await db
        .select()
        .from(schema.products)
        .where(eq(schema.products.organizationId, demo.organizationId));
      const fuels = products.filter((product) => product.productType === 'FUEL');
      expect(fuels.map((fuel) => fuel.name).sort()).toEqual(['Diesel', 'Petrol']);
      for (const fuel of fuels) {
        const config = fuel.taxConfig as Record<string, unknown>;
        expect(fuel.taxCategory).toBe('FUEL_VAT');
        expect(fuel.isTaxable).toBe(false);
        expect(config.vat_rate).toBeGreaterThan(0);
        expect(config).not.toHaveProperty('gst_rate');
        expect(config.hsn_code).toBe('2710');
      }
      for (const product of products.filter((item) => item.productType !== 'FUEL')) {
        const config = product.taxConfig as Record<string, unknown>;
        expect(product.taxCategory).toBe('GST');
        expect(config.gst_rate).toBe(18);
      }
      const items = await db
        .select({ item: schema.purchaseItems, purchase: schema.purchases })
        .from(schema.purchaseItems)
        .innerJoin(schema.purchases, eq(schema.purchases.id, schema.purchaseItems.purchaseId))
        .where(eq(schema.purchases.organizationId, demo.organizationId));
      expect(items.length).toBeGreaterThanOrEqual(4);
      for (const { item, purchase } of items) {
        expect(item.taxCategory).toBe('FUEL_VAT');
        expect(Number(item.cgst) + Number(item.sgst) + Number(item.igst)).toBe(0);
        expect(item.lineTotal).toBe(item.taxableAmount);
        expect(Number(item.invoiceDensity)).toBeGreaterThan(700);
        // Fuel invoices are Office Records: entry date, no business day.
        expect(purchase.entryDate).not.toBeNull();
        expect(purchase.businessDayId).toBeNull();
      }
    });

    it('seeds the Decantation & Density story', async () => {
      const decantations = await db
        .select()
        .from(schema.decantations)
        .where(eq(schema.decantations.organizationId, demo.organizationId))
        .orderBy(asc(schema.decantations.createdAt));
      expect(decantations).toHaveLength(4);
      const statusOf = (row: (typeof decantations)[number]) => row.status;
      const lines = await db
        .select()
        .from(schema.decantationTankLines)
        .where(eq(schema.decantationTankLines.organizationId, demo.organizationId));
      const measured = decantations.filter((row) => statusOf(row) === 'MEASURED');
      expect(measured.length).toBeGreaterThanOrEqual(3);
      // Exactly one draft: today's tanker, still unloading.
      const drafts = decantations.filter((row) => row.status === 'DRAFT');
      expect(drafts).toHaveLength(1);
      expect(drafts[0].unloadEndedAt).toBeNull();
      // One flagged TANKER_SHORT (chamber short, seal broken).
      const flagged = decantations.filter((row) =>
        (row.flags as Array<{ code: string }>).some((flag) => flag.code === 'TANKER_SHORT'),
      );
      expect(flagged).toHaveLength(1);
      // Every measured line has a link with invoice, received and variance.
      const links = await db
        .select()
        .from(schema.decantationPurchases)
        .where(eq(schema.decantationPurchases.organizationId, demo.organizationId));
      const measuredIds = new Set(measured.map((row) => row.id));
      const measuredLinks = links.filter((link) => measuredIds.has(link.decantationId));
      expect(measuredLinks).toHaveLength(4); // 2 products on day -6 + day -4 + day -2
      for (const link of measuredLinks) {
        expect(link.varianceComputedAt).not.toBeNull();
        expect(Number(link.varianceQty)).toBe(Number(link.receivedQty) - Number(link.invoiceQty));
      }
      const variances = measuredLinks.map((link) => Number(link.varianceQty)).sort((a, b) => a - b);
      expect(variances).toEqual([-60, -32, -24, 15]);
      // The day -4 HSD tanker had no after dip: measured by a later routine dip.
      expect(lines.filter((line) => line.measuredBy === 'TANK_DIP')).toHaveLength(1);
      expect(lines.filter((line) => line.measuredBy === 'AFTER_DIP')).toHaveLength(3);
      // RO density within tolerance of the invoice, except nothing is flagged for density.
      for (const row of decantations)
        expect((row.flags as Array<{ code: string }>).map((flag) => flag.code)).not.toContain(
          'DENSITY_OUT_OF_TOLERANCE',
        );
      // Today's draft is linked to this morning's invoice.
      expect(links.some((link) => link.decantationId === drafts[0].id)).toBe(true);
    });

    it('never books fuel Purchase stock; fuel stock is Decantation + opening only', async () => {
      const tanks = await db
        .select()
        .from(schema.tanks)
        .where(eq(schema.tanks.organizationId, demo.organizationId));
      const movements = await db
        .select()
        .from(schema.stockMovements)
        .where(
          inArray(
            schema.stockMovements.tankId,
            tanks.map((tank) => tank.id),
          ),
        )
        .orderBy(asc(schema.stockMovements.createdAt));
      expect(movements.some((movement) => movement.movementType === 'Purchase')).toBe(false);
      const types = new Set(movements.map((movement) => movement.movementType));
      expect(types).toContain('Decantation');
      const opening = movements.filter((movement) => movement.movementType === 'OpeningBalance');
      expect(opening).toHaveLength(tanks.length);
      for (const movement of opening) expect(movement.notes).toBe('Onboarding opening stock');
      // Tanks stay positive and within capacity through the whole history.
      // Metered sales are booked when their shift closes (their own createdAt is
      // the write time), so order each movement by when it really happened.
      const shifts = await db
        .select()
        .from(schema.shifts)
        .where(eq(schema.shifts.organizationId, demo.organizationId));
      const closedAt = new Map(shifts.map((shift) => [shift.id, shift.closedAt]));
      const happenedAt = (movement: (typeof movements)[number]) =>
        ((movement.shiftId && closedAt.get(movement.shiftId)) || movement.createdAt).getTime();
      for (const tank of tanks) {
        let running = 0;
        for (const movement of movements
          .filter((item) => item.tankId === tank.id)
          .sort((a, b) => happenedAt(a) - happenedAt(b))) {
          running += Number(movement.quantity);
          expect(running, `${tank.name} after ${movement.movementType}`).toBeGreaterThan(0);
          expect(running).toBeLessThanOrEqual(Number(tank.capacity));
        }
      }
    });

    it('keeps a density register: a Morning reading per product per closed day, today 1/2', async () => {
      const readings = await db
        .select()
        .from(schema.densityReadings)
        .where(eq(schema.densityReadings.organizationId, demo.organizationId));
      const morning = readings.filter((reading) => reading.kind === 'MORNING');
      const dates = [...new Set(morning.map((reading) => reading.businessDate))].sort();
      expect(dates).toHaveLength(8);
      for (const date of dates.filter((value) => value !== TODAY))
        expect(morning.filter((reading) => reading.businessDate === date)).toHaveLength(2);
      expect(morning.filter((reading) => reading.businessDate === TODAY)).toHaveLength(1);
      expect(readings.filter((reading) => reading.kind === 'ADHOC')).toHaveLength(1);
      expect(readings.filter((reading) => reading.kind === 'DECANTATION').length).toBeGreaterThan(
        3,
      );
      expect(readings.some((reading) => (reading.flags as unknown[]).length > 0)).toBe(false);
      for (const reading of readings) {
        const value = Number(reading.density15);
        expect(value).toBeGreaterThan(740);
        expect(value).toBeLessThan(840);
      }
    });

    it('stores explicit decantation settings and spec bands on the station', async () => {
      const [station] = await db
        .select()
        .from(schema.stations)
        .where(eq(schema.stations.organizationId, demo.organizationId));
      const settings = station.settings as Record<string, unknown>;
      expect(settings).toMatchObject({
        densityToleranceKgM3: 3,
        settlingTimeMinutes: 30,
        densityEntryMethod: 'HYDROMETER',
      });
      expect(Object.keys(settings.densitySpecBands as object)).toHaveLength(2);
    });

    it('seeds a second organisation independently: no shared IDs, no cross-organisation rows', async () => {
      const other = await seed('Second Demo');
      for (const table of organizationScopedTables()) {
        const columns = getTableColumns(table);
        if (!('id' in columns)) continue;
        const rowsA = await db
          .select({ id: columns.id })
          .from(table)
          .where(eq(columns.organizationId, demo.organizationId));
        const rowsB = await db
          .select({ id: columns.id })
          .from(table)
          .where(eq(columns.organizationId, other.organizationId));
        const shared = rowsA.filter((a) => rowsB.some((b) => b.id === a.id));
        expect(shared, getTableName(table)).toEqual([]);
      }
      // Rows without organization_id hang off this org's shifts only.
      const crossReadings = await db.execute(dsql`
        select count(*)::int as count from nozzle_readings r
        join shifts s on s.id = r.shift_id
        join nozzles n on n.id = r.nozzle_id
        where s.organization_id <> n.organization_id`);
      expect((crossReadings as unknown as Array<{ count: number }>)[0].count).toBe(0);
      const crossEvents = await db.execute(dsql`
        select count(*)::int as count from events e
        join stations st on st.id = e.station_id
        where e.organization_id <> st.organization_id`);
      expect((crossEvents as unknown as Array<{ count: number }>)[0].count).toBe(0);
    }, 120_000);
  });

  describe('lifecycle (#368)', () => {
    function app(admin: DemoAuthAdmin) {
      const root = new Hono();
      root.use('*', async (c, next) => {
        c.set('db' as never, db as never);
        c.set(
          'platformAdmin' as never,
          { email: 'admin@pumpos.app', subjectId: 'admin-1' } as never,
        );
        c.set('demoAuthAdmin' as never, admin as never);
        await next();
      });
      root.route('/demos', platformDemosRouter);
      return root;
    }
    const env = { ALLOW_DEMO_ORGS: 'true' };
    const json = (method: string, body?: unknown) => ({
      method,
      ...(body
        ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }
        : {}),
    });

    it('creates, resets, extends and deletes a demo, leaving no rows behind', async () => {
      const { admin, calls } = fakeAuthAdmin();
      const created = await app(admin).request(
        '/demos',
        json('POST', {
          ...SETUP,
          stationName: 'Lifecycle Fuels',
          tanks: 3,
          nozzles: 4,
          attendants: 2,
          prospectEmail: 'prospect@demo.pumpos.invalid',
          expiresInDays: 7,
        }),
        env,
      );
      expect(created.status).toBe(201);
      const { data } = (await created.json()) as {
        data: { organizationId: string; authUserId: string };
      };
      expect(calls.invited).toEqual(['prospect@demo.pumpos.invalid']);
      const tanksBefore = await db
        .select()
        .from(schema.tanks)
        .where(eq(schema.tanks.organizationId, data.organizationId));
      expect(tanksBefore).toHaveLength(3);

      const reset = await app(admin).request(
        `/demos/${data.organizationId}/reset`,
        json('POST'),
        env,
      );
      expect(reset.status).toBe(200);
      const tanksAfter = await db
        .select()
        .from(schema.tanks)
        .where(eq(schema.tanks.organizationId, data.organizationId));
      expect(tanksAfter).toHaveLength(3);
      expect(tanksAfter.map((t) => t.id)).not.toContain(tanksBefore[0].id);
      const nozzlesAfter = await db
        .select()
        .from(schema.nozzles)
        .where(eq(schema.nozzles.organizationId, data.organizationId));
      expect(nozzlesAfter).toHaveLength(4);
      const [owner] = await db
        .select()
        .from(schema.users)
        .where(
          and(eq(schema.users.organizationId, data.organizationId), eq(schema.users.role, 'Owner')),
        );
      expect(owner.authUserId).toBe(data.authUserId);

      const extended = await app(admin).request(
        `/demos/${data.organizationId}/extend`,
        json('POST', { expiresInDays: 30 }),
        env,
      );
      expect(extended.status).toBe(200);
      const [organization] = await db
        .select()
        .from(schema.organizations)
        .where(eq(schema.organizations.id, data.organizationId));
      expect(organization.demoExpiresAt!.getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000);

      const deleted = await app(admin).request(
        `/demos/${data.organizationId}`,
        json('DELETE'),
        env,
      );
      expect(deleted.status).toBe(200);
      expect(calls.deleted).toContain(data.authUserId);
      expect(await rowsLeftFor(data.organizationId)).toEqual({});
      expect(
        await db
          .select()
          .from(schema.organizations)
          .where(eq(schema.organizations.id, data.organizationId)),
      ).toEqual([]);
    }, 180_000);

    it('refuses to reset or delete a non-demo organisation', async () => {
      const { admin } = fakeAuthAdmin();
      const [real] = await db
        .insert(schema.organizations)
        .values({ name: 'Real Station' })
        .returning();
      for (const [path, method] of [
        [`/demos/${real.id}/reset`, 'POST'],
        [`/demos/${real.id}`, 'DELETE'],
      ] as const) {
        const response = await app(admin).request(path, json(method), env);
        expect(response.status).toBe(409);
        expect(await response.json()).toMatchObject({ error: { code: 'NOT_A_DEMO_ORGANIZATION' } });
      }
      expect(
        await db.select().from(schema.organizations).where(eq(schema.organizations.id, real.id)),
      ).toHaveLength(1);
    });

    it('refuses the delete when is_demo is cleared while the delete waits on the row lock', async () => {
      const { admin } = fakeAuthAdmin();
      const { organizationId } = await emptyDemoOrganization('Racing Demo');
      const flipper = postgres(CONNECTION!, {
        max: 1,
        onnotice: () => {},
        connection: { search_path: TEST_SCHEMA },
      });
      try {
        let deletion: Promise<Response> | undefined;
        await flipper.begin(async (tx) => {
          await tx`select id from organizations where id = ${organizationId} for update`;
          deletion = Promise.resolve(
            app(admin).request(`/demos/${organizationId}`, json('DELETE'), env),
          );
          await new Promise((resolve) => setTimeout(resolve, 200));
          await tx`update organizations set is_demo = false where id = ${organizationId}`;
        });
        const response = await deletion!;
        expect(response.status).toBe(409);
      } finally {
        await flipper.end();
      }
      expect(
        await db
          .select()
          .from(schema.organizations)
          .where(eq(schema.organizations.id, organizationId)),
      ).toHaveLength(1);
    });

    it('expiry deactivates expired demos and deletes those past the 7-day grace', async () => {
      const { admin, calls } = fakeAuthAdmin();
      const expired = await seed('Expired Demo');
      const stale = await emptyDemoOrganization('Stale Demo');
      const ownerLogin = crypto.randomUUID();
      await db
        .update(schema.users)
        .set({ authUserId: ownerLogin })
        .where(
          and(
            eq(schema.users.organizationId, expired.organizationId),
            eq(schema.users.role, 'Owner'),
          ),
        );
      await db
        .update(schema.organizations)
        .set({ demoExpiresAt: new Date(NOW.getTime() - 86_400_000) })
        .where(eq(schema.organizations.id, expired.organizationId));
      await db
        .update(schema.organizations)
        .set({ demoExpiresAt: new Date(NOW.getTime() - 8 * 86_400_000) })
        .where(eq(schema.organizations.id, stale.organizationId));

      const summary = await expireDemoOrganizations(db, admin, NOW);
      expect(summary.failed).toBe(0);

      const [deactivated] = await db
        .select()
        .from(schema.organizations)
        .where(eq(schema.organizations.id, expired.organizationId));
      expect(deactivated.suspendedAt).not.toBeNull();
      expect(calls.banned).toEqual([ownerLogin]);
      const [owner] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.authUserId, ownerLogin));
      expect(owner.status).toBe('INACTIVE');
      expect(
        await db
          .select()
          .from(schema.organizations)
          .where(eq(schema.organizations.id, stale.organizationId)),
      ).toEqual([]);
      expect(await rowsLeftFor(stale.organizationId)).toEqual({});
    }, 120_000);
  });
});
