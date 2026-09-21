/**
 * End-to-end operational-loop smoke test.
 *
 * Exercises the full v2 chain against the real database inside ONE transaction
 * that is rolled back at the end (no data is persisted):
 *   provision a station -> open business day -> open shift -> record a cash sale
 *   -> record a drawer expense -> close shift -> generate DSSR.
 *
 * Run:  cd packages/db && set -a && . ./.env && set +a && node ../../apps/api/scripts/smoke-operational-loop.mjs
 *
 * Requires the workspace to be built (npx tsc -b) so dist artifacts exist.
 */
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { schema } from '@pump/db';
import {
  OpenBusinessDay,
  OpenShift,
  RecordExpense,
  CreateSale,
  CloseShift,
  GenerateDssr,
  SystemClock,
  UuidGenerator,
  InProcessEventDispatcher,
} from '@pump/core';
import { DrizzleEventStore } from '/Users/abdullahnettoor/Projects/pump-erp/apps/api/dist/infra/events.js';
import { TimestampDocumentNumberGenerator } from '/Users/abdullahnettoor/Projects/pump-erp/apps/api/dist/infra/doc-numbers.js';
import {
  DrizzleBusinessDayRepository,
  DrizzleShiftRepository,
  DrizzleNozzleReadingRepository,
  DrizzleShiftReconciliationReader,
  DrizzleCreditSalesReader,
  DrizzleStockMovementWriter,
  DrizzleShiftSummaryWriter,
} from '/Users/abdullahnettoor/Projects/pump-erp/apps/api/dist/infra/repositories/station-ops-repositories.js';
import {
  DrizzleNozzleRepository,
  DrizzleFuelPriceRepository,
} from '/Users/abdullahnettoor/Projects/pump-erp/apps/api/dist/infra/repositories/setup-repositories.js';
import { DrizzleStockMovementRepository } from '/Users/abdullahnettoor/Projects/pump-erp/apps/api/dist/infra/repositories/inventory-repositories.js';
import { DrizzleSaleRepository } from '/Users/abdullahnettoor/Projects/pump-erp/apps/api/dist/infra/repositories/retail-repositories.js';
import { DrizzleExpenseRepository } from '/Users/abdullahnettoor/Projects/pump-erp/apps/api/dist/infra/repositories/finance-repositories.js';
import {
  DrizzleCustomerRepository,
  DrizzleCustomerLedgerRepository,
} from '/Users/abdullahnettoor/Projects/pump-erp/apps/api/dist/infra/repositories/crm-repositories.js';
import {
  DrizzleDssrSnapshotRepository,
  DrizzleDssrDataReader,
} from '/Users/abdullahnettoor/Projects/pump-erp/apps/api/dist/infra/repositories/reporting-repositories.js';

const url = process.env.DATABASE_URL || process.env.DIRECT_URL;
const stats2 = { n: 0, t0: new Map(), log: [] };
const rawClient = postgres(url, { ssl: 'require', max: 1, debug: (conn, q) => { stats2.n++; stats2.log.push([performance.now(), String(q).replace(/\s+/g,' ').slice(0,100)]); } });
// [DEBUG-perf1] wrap postgres client: count round trips + total DB time
const stats = { n: 0, ms: 0, log: [] };
const client = new Proxy(rawClient, {
  apply(target, thisArg, args) { return Reflect.apply(target, thisArg, args); },
  get(target, prop) {
    if (prop === 'unsafe') {
      return (q, params, opts) => {
        const t0 = performance.now();
        const p = target.unsafe(q, params, opts);
        const done = () => { const d = performance.now() - t0; stats.n++; stats.ms += d; stats.log.push([d, String(q).replace(/\s+/g,' ').slice(0,90)]); };
        if (p && typeof p.then === 'function') { p.then(done, done); }
        return p;
      };
    }
    const v = target[prop];
    return typeof v === 'function' ? v.bind(target) : v;
  },
});
globalThis.__phase = (label) => {
  const s2 = { n: stats2.n };
  const t = performance.now();
  return () => console.log(`[DEBUG-perf1] ${label}: ${(performance.now()-t).toFixed(0)}ms wall, ${stats2.n-s2.n} queries (avg ${((performance.now()-t)/Math.max(1,stats2.n-s2.n)).toFixed(0)}ms/q)`);
};
globalThis.__phaseOld = (label) => {
  const snap = { n: stats.n, ms: stats.ms, t: performance.now() };
  return () => console.log(`[DEBUG-perf1] ${label}: ${(performance.now()-snap.t).toFixed(0)}ms wall, ${stats.n-snap.n} queries, ${(stats.ms-snap.ms).toFixed(0)}ms in DB`);
};
const db = drizzle(client, { schema });

const ids = new UuidGenerator();
let pass = 0;
let fail = 0;
function check(label, cond) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.log(`  ✗ ${label}`);
  }
}
function unwrap(label, r) {
  check(label, r?.success === true);
  if (!r?.success) console.log('    ->', JSON.stringify(r?.error));
  return r?.success ? r.data : null;
}

class RollbackSignal extends Error {}

const [org] = await client`select id from organizations limit 1`;
const [owner] =
  await client`select id from users where organization_id=${org.id} order by created_at limit 1`;
const organizationId = org.id;
const actorId = owner.id;

try {
  await db.transaction(async (tx) => {
    const events = new InProcessEventDispatcher({ store: new DrizzleEventStore(tx) });
    const ctxBase = { organizationId, actorId, correlationId: null, clock: new SystemClock(), ids };

    // --- Setup: minimal station + fuel product + tank + DU + nozzle + price + item product ---
    const suffix = Date.now().toString().slice(-6);
    const [station] = await tx
      .insert(schema.stations)
      .values({
        organizationId,
        name: `Smoke ${suffix}`,
        code: `SMK${suffix}`,
        settings: {
          business_day_starts_at: '06:00',
          shift_grace_minutes: 15,
          shift_lock_grace_days: 3,
        },
        onboardingStatus: 'READY_FOR_OPERATIONS',
        isActive: true,
      })
      .returning();
    const [fuel] = await tx
      .insert(schema.products)
      .values({
        organizationId,
        name: 'Petrol',
        code: `MS${suffix}`,
        productType: 'FUEL',
        inventoryType: 'BULK',
        stockTracked: true,
        isTaxable: false,
        unit: 'Liters',
        isActive: true,
      })
      .returning();
    const [item] = await tx
      .insert(schema.products)
      .values({
        organizationId,
        name: 'Engine Oil',
        code: `OIL${suffix}`,
        productType: 'LUBRICANT',
        inventoryType: 'ITEM',
        stockTracked: true,
        isTaxable: true,
        unit: 'Piece',
        isActive: true,
      })
      .returning();
    const [tank] = await tx
      .insert(schema.tanks)
      .values({
        organizationId,
        stationId: station.id,
        name: 'T1',
        productId: fuel.id,
        capacity: '20000',
      })
      .returning();
    const [du] = await tx
      .insert(schema.dispenserUnits)
      .values({
        organizationId,
        stationId: station.id,
        name: 'DU1',
        code: `DU1${suffix}`,
        status: 'ACTIVE',
      })
      .returning();
    const [nozzle] = await tx
      .insert(schema.nozzles)
      .values({
        organizationId,
        stationId: station.id,
        duId: du.id,
        tankId: tank.id,
        productId: fuel.id,
        name: 'N1',
        currentReading: '1000',
      })
      .returning();
    await tx.insert(schema.fuelPrices).values({
      organizationId,
      stationId: station.id,
      productId: fuel.id,
      price: '100',
      effectiveFrom: new Date(),
    });
    const [template] = await tx
      .insert(schema.shiftTemplates)
      .values({
        organizationId,
        name: `Day ${suffix}`,
        startTime: '06:00',
        endTime: '18:00',
        isActive: true,
      })
      .returning();
    console.log('Setup OK: station', station.code);

    const ctx = { ...ctxBase, stationId: station.id, businessDayId: null };

    // --- Open business day ---
    const bdRes = await new OpenBusinessDay({
      repository: new DrizzleBusinessDayRepository(tx),
      events,
    }).execute({ stationId: station.id }, ctx);
    unwrap('OpenBusinessDay', bdRes);

    // --- Open shift ---
    const shiftRes = await new OpenShift({
      shifts: new DrizzleShiftRepository(tx),
      businessDays: new DrizzleBusinessDayRepository(tx),
      nozzles: new DrizzleNozzleRepository(tx),
      nozzleReadings: new DrizzleNozzleReadingRepository(tx),
      fuelPrices: new DrizzleFuelPriceRepository(tx),
      events,
    }).execute({ stationId: station.id, shiftTemplateId: template.id, openingCash: 5000 }, ctx);
    const opened = unwrap('OpenShift', shiftRes);
    const shiftId = opened?.shift?.id;

    // Seed opening stock for the item product (Purchase movement) so the sale can decrement.
    await new DrizzleStockMovementRepository(tx).save({
      id: ids.newId(),
      shiftId: null,
      businessDayId: opened.shift.businessDayId,
      productId: item.id,
      tankId: null,
      movementType: 'OpeningBalance',
      quantity: '10',
      referenceType: 'SEED',
      referenceId: null,
      notes: null,
      createdAt: new Date().toISOString(),
    });

    // --- Record a cash merchandise sale (2 x 250 = 500) ---
    const saleRes = await new CreateSale({
      businessDays: new DrizzleBusinessDayRepository(tx),
      sales: new DrizzleSaleRepository(tx),
      stock: new DrizzleStockMovementRepository(tx),
      ledger: new DrizzleCustomerLedgerRepository(tx),
      customers: new DrizzleCustomerRepository(tx),
      shifts: new DrizzleShiftRepository(tx),
      docNumbers: new TimestampDocumentNumberGenerator(),
      events,
    }).execute(
      {
        shiftId,
        paymentMethod: 'Cash',
        lines: [{ productId: item.id, quantity: 2, unitPrice: 250 }],
      },
      ctx,
    );
    const sale = unwrap('CreateSale (cash merchandise)', saleRes);
    check('  sale total = 500', sale?.sale?.totalAmount === '500');

    // --- Record a drawer expense (300) ---
    const expRes = await new RecordExpense({
      businessDays: new DrizzleBusinessDayRepository(tx),
      expenses: new DrizzleExpenseRepository(tx),
      shifts: new DrizzleShiftRepository(tx),
      businessDays: new DrizzleBusinessDayRepository(tx),
      events,
    }).execute(
      {
        shiftId,
        categoryId: await seedCategory(tx, organizationId),
        amount: 300,
        description: 'Tea',
        paidFrom: 'SHIFT_CASH',
      },
      ctx,
    );
    unwrap('RecordExpense (drawer)', expRes);

    // --- Close shift: expectedDrawerCash = 5000 + cashSales(500) - drawerExpenses(300) = 5200 ---
    const __endClose = globalThis.__phase('CloseShift');
    const closeRes = await new CloseShift({
      creditSales: new DrizzleCreditSalesReader(tx),
      shifts: new DrizzleShiftRepository(tx),
      nozzles: new DrizzleNozzleRepository(tx),
      nozzleReadings: new DrizzleNozzleReadingRepository(tx),
      reconciliation: new DrizzleShiftReconciliationReader(tx),
      stockMovements: new DrizzleStockMovementWriter(tx),
      summaries: new DrizzleShiftSummaryWriter(tx),
      events,
    }).execute(
      {
        shiftId,
        closingCash: 5200,
        nozzleReadings: [{ nozzleId: nozzle.id, closingReading: 1500 }],
      },
      ctx,
    );
    __endClose();
    const closed = unwrap('CloseShift', closeRes);
    check('  expectedDrawerCash = 5200', Number(closed?.snapshot?.expectedDrawerCash) === 5200);
    check('  cashVariance = 0', Number(closed?.snapshot?.cashVariance) === 0);
    check('  fuel volume = 500', Number(closed?.snapshot?.totalVolume) === 500);

    // --- Generate DSSR for the business day ---
    const dssrRes = await new GenerateDssr({
      businessDays: new DrizzleBusinessDayRepository(tx),
      snapshots: new DrizzleDssrSnapshotRepository(tx),
      reader: new DrizzleDssrDataReader(tx),
      events,
    }).execute({ businessDayId: opened.shift.businessDayId }, ctx);
    const dssr = unwrap('GenerateDssr', dssrRes);
    check('  DSSR shiftsIncluded = 1', dssr?.snapshotData?.shiftsIncluded === 1);
    check('  DSSR fuel volume = 500', dssr?.snapshotData?.fuel?.totalVolume === 500);
    check(
      '  DSSR merchandise cash = 500',
      dssr?.snapshotData?.merchandise?.byPaymentMethod?.Cash === 500,
    );
    check('  DSSR drawer expenses = 300', dssr?.snapshotData?.expenses?.drawer === 300);

    console.log(`[DEBUG-perf1] TOTAL: ${stats2.n} queries, ${stats.ms.toFixed(0)}ms cumulative DB time`);
    stats.log.sort((a,b)=>b[0]-a[0]).slice(0,8).forEach(([d,q])=>console.log(`[DEBUG-perf1]   ${d.toFixed(0)}ms  ${q}`));
    throw new RollbackSignal('rollback (smoke complete)');
  });
} catch (e) {
  if (!(e instanceof RollbackSignal)) {
    console.error('SMOKE ERROR:', e.stack);
    fail++;
  }
}

async function seedCategory(tx, organizationId) {
  const [cat] = await tx
    .insert(schema.expenseCategories)
    .values({ organizationId, name: `Smoke Cat ${Date.now()}`, isSystem: false })
    .returning();
  return cat.id;
}

await client.end();
console.log(`\nSMOKE RESULT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
