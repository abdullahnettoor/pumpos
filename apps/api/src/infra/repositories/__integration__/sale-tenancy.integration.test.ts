import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vite-plus/test';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { schema, type DbClient } from '@pump/db';
import {
  CreateSale,
  FixedClock,
  OpenShift,
  RecordCreditSale,
  RecordOmcCardSale,
  RecordExpense,
  RecordIncome,
  RecordPurchase,
  RecordCollection,
  RecordMerchandiseHandover,
  UuidGenerator,
  type ExecutionContext,
} from '@pump/core';
import { transactionsRouter } from '../../../routes/transactions.js';
import { shiftsRouter } from '../../../routes/shifts.js';
import { runInTransaction } from '../../transaction.js';
import { DrizzleTenantReferenceReader } from '../tenant-reference-reader.js';
import { DrizzleProductRepository } from '../product.repo.js';
import {
  DrizzleCustomerLedgerRepository,
  DrizzleCustomerRepository,
  DrizzleCollectionRepository,
  DrizzleSupplierRepository,
} from '../crm-repositories.js';
import {
  DrizzleSaleRepository,
  DrizzleMerchandiseHandoverRepository,
} from '../retail-repositories.js';
import { DrizzleStockMovementRepository } from '../inventory-repositories.js';
import {
  DrizzleShiftRepository,
  DrizzleBusinessDayRepository,
  DrizzleShiftWriteGateReader,
  DrizzleNozzleReadingRepository,
  DrizzleStaffDirectory,
  DrizzleFuelNameReader,
} from '../station-ops-repositories.js';
import { DrizzleExpenseRepository, DrizzleIncomeRepository } from '../finance-repositories.js';
import {
  DrizzleFinancialAccountRepository,
  DrizzleFinancialAccountReader,
} from '../finance-account-repositories.js';
import {
  DrizzlePurchaseRepository,
  DrizzlePurchaseItemRepository,
  DrizzleSupplierTransactionRepository,
} from '../purchasing-repositories.js';
import {
  DrizzleDispenserRepository,
  DrizzleNozzleRepository,
  DrizzleFuelPriceRepository,
  DrizzleStationRepository,
} from '../setup-repositories.js';
import { DrizzlePurchaseStationLegalReader } from '../../transaction-reference-sql.js';
import { densityRouter } from '../../../routes/density.js';
import { DrizzleDssrDataReader } from '../reporting-repositories.js';
import {
  DrizzleCustomerLedgerReader,
  DrizzleSupplierLedgerReader,
} from '../party-ledger-readers.js';
import { projectShiftSummary } from '../../shift-summary-projection.js';
import { listFuelPriceHistory } from '../fuel-price-queries.js';
import { DrizzleAttendantHandoverReportReader } from '../attendant-report-repositories.js';
import {
  DrizzleDensityReadingRepository,
  DrizzleDecantationLinkRepository,
} from '../decantation-repositories.js';
import type { AuthenticatedPrincipal } from '../../authenticated-principal.js';

const CONNECTION = process.env.TEST_DATABASE_URL;
const TEST_SCHEMA = 'sale_tenancy_it';
const ids = () => ({
  org: randomUUID(),
  station: randomUUID(),
  user: randomUUID(),
  product: randomUUID(),
  tank: randomUUID(),
  du: randomUUID(),
  nozzle: randomUUID(),
  customer: randomUUID(),
  vehicle: randomUUID(),
  supplier: randomUUID(),
  account: randomUUID(),
  expenseHead: randomUUID(),
  incomeHead: randomUUID(),
  terminal: randomUUID(),
});
const A = ids();
const B = ids();
const C = ids();
const OTHER_TEMPLATE = randomUUID();
const DAY = randomUUID();
const SHIFT = randomUUID();
const TEMPLATE = randomUUID();
const SALE = randomUUID();
const BILLED_SALE = randomUUID();
const COLLECTION = randomUUID();
const PURCHASE = randomUUID();
const CREDIT = randomUUID();
const SECRET = 'TENANT_B_PRIVATE';
const DATE = '2026-10-09';
const NOW = new Date('2026-10-09T10:00:00Z');
const docNumbers = { next: async () => `TEST-${randomUUID()}` };
const ctx = (): ExecutionContext => ({
  organizationId: A.org,
  stationId: A.station,
  businessDayId: DAY,
  actorId: A.user,
  correlationId: null,
  clock: new FixedClock(NOW),
  ids: new UuidGenerator(),
  timeZone: 'Asia/Kolkata',
});

function shippedSchema(): string {
  const dir = path.resolve(__dirname, '../../../../../../supabase/migrations');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => readFileSync(path.join(dir, f), 'utf8'))
    .join('\n')
    .replace(/(?:"public"|public)\./g, `"${TEST_SCHEMA}".`)
    .replace(
      /create trigger on_auth_user_created/gi,
      'create or replace trigger on_auth_user_created',
    );
}

describe.skipIf(!CONNECTION)('Organization boundaries against real Postgres (#719)', () => {
  let client: postgres.Sql;
  let db: DbClient;
  let writes: string[] = [];
  let queries: { query: string; params: unknown[] }[] = [];
  let app: Hono<{ Variables: { db: DbClient; user: AuthenticatedPrincipal } }>;

  beforeAll(async () => {
    client = postgres(CONNECTION!, {
      max: 1,
      onnotice: () => {},
      connection: { search_path: TEST_SCHEMA },
    });
    await client.unsafe('select pg_advisory_lock(872634)');
    await client.unsafe(`do $$ begin
      if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
      if not exists (select from pg_roles where rolname = 'anon') then create role anon; end if;
      end $$;
      drop schema if exists ${TEST_SCHEMA} cascade; create schema ${TEST_SCHEMA};`);
    await client.unsafe(shippedSchema());
    await client.unsafe('select pg_advisory_unlock(872634)');
    db = drizzle(client, {
      schema,
      logger: {
        logQuery(query, params) {
          queries.push({ query, params });
          if (/^(insert|update|delete)\b/i.test(query)) writes.push(query);
        },
      },
    }) as unknown as DbClient;
    const router = new Hono<{ Variables: { db: DbClient; user: AuthenticatedPrincipal } }>();
    router.use('*', async (c, next) => {
      c.set('db', db);
      c.set('user', {
        id: A.user,
        organizationId: A.org,
        role: 'Owner',
        fullName: 'Owner A',
        email: 'owner@example.test',
        assignedStationIds: [A.station],
      });
      await next();
    });
    router.route('/transactions', transactionsRouter);
    router.route('/transactions', densityRouter);
    router.route('/shifts', shiftsRouter);
    app = router;
  }, 60_000);

  afterAll(async () => {
    if (client) {
      await client.unsafe('select pg_advisory_lock(872634)');
      await client.unsafe(`drop schema if exists ${TEST_SCHEMA} cascade`);
      await client.unsafe('select pg_advisory_unlock(872634)');
      await client.end();
    }
  });

  beforeEach(async () => {
    await client.unsafe('truncate organizations cascade');
    for (const t of [A, B]) {
      const name = t === A ? 'LOCAL_A' : SECRET;
      await db
        .insert(schema.organizations)
        .values({ id: t.org, name, subscriptionStatus: 'ACTIVE' });
      await db.insert(schema.stations).values({
        id: t.station,
        organizationId: t.org,
        name,
        code: name,
        settings: { timezone: 'Asia/Kolkata', business_day_starts_at: '06:00' },
      });
      await db
        .insert(schema.users)
        .values({ id: t.user, organizationId: t.org, fullName: name, role: 'Owner' });
      await db.insert(schema.products).values({
        id: t.product,
        organizationId: t.org,
        name,
        code: name,
        productType: 'LUBRICANT',
        unit: 'PCS',
        sellingPrice: '118',
        taxCategory: 'GST',
        taxConfig: { gst_rate: 18, hsn_code: t === B ? SECRET : 'LOCAL_HSN' },
      });
      await db.insert(schema.tanks).values({
        id: t.tank,
        organizationId: t.org,
        stationId: t.station,
        name,
        productId: t.product,
        capacity: '10000',
      });
      await db
        .insert(schema.dispenserUnits)
        .values({ id: t.du, organizationId: t.org, stationId: t.station, name, code: name });
      await db.insert(schema.nozzles).values({
        id: t.nozzle,
        organizationId: t.org,
        stationId: t.station,
        name,
        productId: t.product,
        tankId: t.tank,
        duId: t.du,
        currentReading: '100',
      });
      await db.insert(schema.customers).values({
        id: t.customer,
        organizationId: t.org,
        name,
        customerType: t === B ? 'Fleet' : 'Credit',
        metadata: { gstin: name, stateCode: '32' },
      });
      await db.insert(schema.customerVehicles).values({
        id: t.vehicle,
        organizationId: t.org,
        customerId: t.customer,
        registrationNumber: name,
        vehicleType: 'Truck',
        defaultProductId: t.product,
      });
      await db.insert(schema.suppliers).values({ id: t.supplier, organizationId: t.org, name });
      await db.insert(schema.financialAccounts).values({
        id: t.account,
        organizationId: t.org,
        stationId: t.station,
        name,
        accountType: 'CASH_IN_HAND',
      });
      await db
        .insert(schema.expenseCategories)
        .values({ id: t.expenseHead, organizationId: t.org, name });
      await db
        .insert(schema.incomeCategories)
        .values({ id: t.incomeHead, organizationId: t.org, name });
      await db.insert(schema.paymentTerminals).values({
        id: t.terminal,
        organizationId: t.org,
        stationId: t.station,
        label: name,
        supportsCard: true,
      });
    }
    await db.insert(schema.businessDays).values({
      id: DAY,
      organizationId: A.org,
      stationId: A.station,
      businessDate: DATE,
      status: 'OPEN',
      openedBy: A.user,
    });
    await db.insert(schema.shiftTemplates).values({
      id: TEMPLATE,
      organizationId: A.org,
      name: 'Day',
      startTime: '06:00',
      endTime: '18:00',
    });
    await db.insert(schema.shifts).values({
      id: SHIFT,
      organizationId: A.org,
      stationId: A.station,
      businessDayId: DAY,
      shiftTemplateId: TEMPLATE,
      openedBy: A.user,
      openedAt: NOW,
    });
    await db.insert(schema.shiftTemplates).values({
      id: OTHER_TEMPLATE,
      organizationId: B.org,
      name: SECRET,
      startTime: '06:00',
      endTime: '18:00',
    });
    await db
      .insert(schema.shiftStaffAssignments)
      .values({ shiftId: SHIFT, userId: A.user, duId: A.du });
  });

  function deps(tx: DbClient, events: Parameters<Parameters<typeof runInTransaction>[1]>[1]) {
    return {
      references: new DrizzleTenantReferenceReader(tx),
      products: new DrizzleProductRepository(tx),
      sales: new DrizzleSaleRepository(tx),
      stock: new DrizzleStockMovementRepository(tx),
      ledger: new DrizzleCustomerLedgerRepository(tx),
      customers: new DrizzleCustomerRepository(tx),
      collections: new DrizzleCollectionRepository(tx),
      shifts: new DrizzleShiftRepository(tx),
      businessDays: new DrizzleBusinessDayRepository(tx),
      shiftWriteGate: new DrizzleShiftWriteGateReader(tx),
      docNumbers,
      events,
      handovers: new DrizzleMerchandiseHandoverRepository(tx),
      accounts: new DrizzleFinancialAccountRepository(tx),
      expenses: new DrizzleExpenseRepository(tx),
      income: new DrizzleIncomeRepository(tx),
      suppliers: new DrizzleSupplierRepository(tx),
      purchases: new DrizzlePurchaseRepository(tx),
      purchaseItems: new DrizzlePurchaseItemRepository(tx),
      supplierTxns: new DrizzleSupplierTransactionRepository(tx),
      stationLegal: new DrizzlePurchaseStationLegalReader(tx),
      // Keep the baseline dependency wired for counterfactual runs; the fixed
      // Purchase use-case reads only the scoped stationLegal adapter above.
      stations: new DrizzleStationRepository(tx),
      nozzles: new DrizzleNozzleRepository(tx),
      nozzleReadings: new DrizzleNozzleReadingRepository(tx),
      fuelPrices: new DrizzleFuelPriceRepository(tx),
      dispensers: new DrizzleDispenserRepository(tx),
      staff: new DrizzleStaffDirectory(tx),
      fuels: new DrizzleFuelNameReader(tx),
    };
  }
  const counts = async () =>
    (
      await client.unsafe(`select
    (select count(*)::int from sales) as sales,
    (select count(*)::int from sale_items) as sale_items,
    (select count(*)::int from stock_movements) as stock_movements,
    (select count(*)::int from events) as events,
    (select count(*)::int from customer_transactions) as customer_transactions,
    (select count(*)::int from collections) as collections,
    (select count(*)::int from purchases) as purchases,
    (select count(*)::int from purchase_items) as purchase_items,
    (select count(*)::int from supplier_transactions) as supplier_transactions,
    (select count(*)::int from stock_variances) as stock_variances,
    (select count(*)::int from expenses) as expenses,
    (select count(*)::int from other_income) as other_income,
    (select count(*)::int from business_days) as business_days,
    (select count(*)::int from customers) as customers,
    (select count(*)::int from suppliers) as suppliers,
    (select count(*)::int from shifts) as shifts,
    (select count(*)::int from density_readings) as density_readings`)
    )[0];
  const line = (productId = A.product) => ({ productId, quantity: 1, unitPrice: 118 });
  const post = (url: string, body: unknown) =>
    app.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  it.each(['foreign', 'missing'] as const)(
    'refuses a %s Product before any Sale, line, stock or event write',
    async (which) => {
      const before = await counts();
      writes = [];
      const result = await runInTransaction(db, (tx, events) =>
        new CreateSale(deps(tx, events)).execute(
          {
            shiftId: SHIFT,
            paymentMethod: 'Cash',
            lines: [line(), line(which === 'foreign' ? B.product : randomUUID())],
          },
          ctx(),
        ),
      );
      expect(result).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
      expect(writes).toEqual([]);
      expect(await counts()).toEqual(before);
    },
  );

  it('rejects a foreign Product before the route can save a new walk-in Customer', async () => {
    const before = await counts();
    writes = [];
    const res = await post('/transactions/sales', {
      shiftId: SHIFT,
      stationId: A.station,
      paymentMethod: 'Cash',
      lines: [line(B.product)],
      buyer: { name: 'New walk-in' },
      saveAsCustomer: true,
    });
    expect(res.status).toBe(404);
    expect(writes).toEqual([]);
    expect(await counts()).toEqual(before);
    expect(await db.select().from(schema.customers)).toHaveLength(2);
  });

  it.each(['Tank', 'Vehicle', 'Attendant'] as const)(
    'refuses a foreign %s on a retail Sale',
    async (kind) => {
      const before = await counts();
      const result = await runInTransaction(db, (tx, events) =>
        new CreateSale(deps(tx, events)).execute(
          {
            shiftId: SHIFT,
            paymentMethod: 'Cash',
            lines: [{ ...line(), ...(kind === 'Tank' ? { tankId: B.tank } : {}) }],
            ...(kind === 'Vehicle' ? { vehicleId: B.vehicle, customerId: A.customer } : {}),
            ...(kind === 'Attendant' ? { attendantId: B.user } : {}),
          },
          ctx(),
        ),
      );
      expect(result).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
      expect(await counts()).toEqual(before);
    },
  );

  it.each(
    ['Credit', 'OMC'].flatMap((type) =>
      [
        { kind: 'Product', bad: { productId: B.product } },
        { kind: 'Vehicle', bad: { vehicleId: B.vehicle } },
        { kind: 'Attendant', bad: { attendantId: B.user } },
        { kind: 'Dispenser', bad: { duId: B.du } },
      ].map((reference) => ({ type, ...reference })),
    ),
  )(
    'refuses foreign $kind in $type sales without ledger or event writes',
    async ({ type, bad }) => {
      const before = await counts();
      const result = await runInTransaction(db, (tx, events) => {
        const uc =
          type === 'Credit'
            ? new RecordCreditSale(deps(tx, events))
            : new RecordOmcCardSale(deps(tx, events));
        return uc.execute({ shiftId: SHIFT, customerId: A.customer, amount: 118, ...bad }, ctx());
      });
      expect(result).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
      expect(await counts()).toEqual(before);
    },
  );

  it('refuses a foreign Vehicle on a Collection', async () => {
    const before = await counts();
    const result = await runInTransaction(db, (tx, events) =>
      new RecordCollection(deps(tx, events)).execute(
        {
          customerId: A.customer,
          vehicleId: B.vehicle,
          amount: 118,
          paymentMethod: 'Cash',
          fundingAccountId: A.account,
          entryDate: DATE,
        },
        ctx(),
      ),
    );
    expect(result).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
    expect(await counts()).toEqual(before);
  });

  it.each(['add', 'update'] as const)(
    'refuses a foreign default Product when Vehicles %s',
    async (operation) => {
      const before = await db
        .select()
        .from(schema.customerVehicles)
        .orderBy(schema.customerVehicles.id);
      const eventsBefore = await db.select().from(schema.events);
      const url =
        operation === 'add'
          ? `/transactions/customers/${A.customer}/vehicles`
          : `/transactions/vehicles/${A.vehicle}`;
      const res = await app.request(url, {
        method: operation === 'add' ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          registrationNumber: 'NEW1234',
          vehicleType: 'Truck',
          defaultProductId: B.product,
        }),
      });
      expect(res.status).toBe(404);
      expect(await res.json()).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
      expect(
        await db.select().from(schema.customerVehicles).orderBy(schema.customerVehicles.id),
      ).toEqual(before);
      expect(await db.select().from(schema.events)).toEqual(eventsBefore);
    },
  );

  it('refuses a foreign Product in a Physical Count', async () => {
    const before = await counts();
    writes = [];
    const res = await post('/transactions/inventory/count', {
      stationId: A.station,
      productId: B.product,
      actualQuantity: 1,
      shiftId: SHIFT,
    });
    expect(res.status).toBe(404);
    expect(writes).toEqual([]);
    expect(await counts()).toEqual(before);
  });

  it.each(['expense', 'income'] as const)(
    'refuses a foreign or missing %s head before writing',
    async (type) => {
      for (const categoryId of [type === 'expense' ? B.expenseHead : B.incomeHead, randomUUID()]) {
        const before = await counts();
        const result = await runInTransaction(db, (tx, events) => {
          const uc =
            type === 'expense'
              ? new RecordExpense(deps(tx, events))
              : new RecordIncome(deps(tx, events));
          return uc.execute(
            { categoryId, fundingAccountId: A.account, amount: 118, entryDate: DATE },
            ctx(),
          );
        });
        expect(result).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
        expect(await counts()).toEqual(before);
      }
    },
  );

  it('refuses foreign Tank allocations on a Product Purchase', async () => {
    const before = await counts();
    const result = await runInTransaction(db, (tx, events) =>
      new RecordPurchase(deps(tx, events)).execute(
        {
          stationId: A.station,
          supplierId: A.supplier,
          transactionDate: DATE,
          lines: [{ ...line(), tankAllocations: [{ tankId: B.tank, quantity: 1 }] }],
        },
        ctx(),
      ),
    );
    expect(result).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
    expect(await counts()).toEqual(before);
  });

  it('refuses a foreign Attendant on a Handover Product Sale', async () => {
    const before = await counts();
    const result = await runInTransaction(db, (tx, events) =>
      new RecordMerchandiseHandover(deps(tx, events)).execute(
        {
          shiftId: SHIFT,
          attendantId: B.user,
          lines: [line()],
        },
        ctx(),
      ),
    );
    expect(result).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
    expect(await counts()).toEqual(before);
  });

  it('validates every Product before attempting to delete a prior Handover Product Sale', async () => {
    await seedSale();
    const before = await counts();
    let deletes = 0;
    const result = await runInTransaction(db, (tx, events) => {
      const base = deps(tx, events);
      return new RecordMerchandiseHandover({
        ...base,
        handovers: {
          findHandoverSaleId: (...args) => base.handovers.findHandoverSaleId(...args),
          deleteHandoverSale: async (id) => {
            deletes++;
            await base.handovers.deleteHandoverSale(id);
          },
        },
      }).execute({ shiftId: SHIFT, attendantId: A.user, lines: [line(), line(B.product)] }, ctx());
    });
    expect(result).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
    expect(deletes).toBe(0);
    expect(await counts()).toEqual(before);
  });

  async function seedSale(productId = A.product, customerId: string | null = null) {
    await db.insert(schema.sales).values({
      id: SALE,
      documentNumber: 'SALE-1',
      businessDayId: DAY,
      shiftId: SHIFT,
      saleType: 'Product',
      paymentMethod: 'Cash',
      customerId,
      attendantId: A.user,
      subtotalAmount: '118',
      taxAmount: '0',
      totalAmount: '118',
      captureMechanism: 'MERCH_HANDOVER',
    });
    await db.insert(schema.saleItems).values({
      saleId: SALE,
      productId,
      quantity: '1',
      unitPrice: '118',
      discountAmount: '0',
      taxAmount: '0',
      lineTotal: '118',
      taxCategory: 'GST',
      taxableAmount: '100',
    });
  }

  it('invoice refuses a cross-Organization Product reference, including a mixed valid/foreign invoice', async () => {
    await seedSale(B.product);
    await db.insert(schema.saleItems).values({
      saleId: SALE,
      ...line(),
      quantity: '1',
      unitPrice: '118',
      discountAmount: '0',
      taxAmount: '0',
      lineTotal: '118',
    });
    const res = await post(`/transactions/sales/${SALE}/invoice`, {});
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
    expect(JSON.stringify(body)).not.toContain(SECRET);
    expect(await db.select().from(schema.invoices)).toEqual([]);
  });

  it('invoice never copies a foreign Customer name or tax metadata', async () => {
    await seedSale(A.product, B.customer);
    const res = await post(`/transactions/sales/${SALE}/invoice`, {});
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain(SECRET);
    expect(await db.select().from(schema.invoices)).toEqual([]);
  });

  it('valid local Sale and invoice still succeed with local name and tax data', async () => {
    const result = await runInTransaction(db, (tx, events) =>
      new CreateSale(deps(tx, events)).execute(
        {
          shiftId: SHIFT,
          paymentMethod: 'Cash',
          lines: [line()],
        },
        ctx(),
      ),
    );
    expect(result.success).toBe(true);
    if (!result.success) throw new Error('local Sale refused');
    const res = await post(`/transactions/sales/${result.data.sale.id}/invoice`, {});
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('LOCAL_A');
    expect(body).toContain('LOCAL_HSN');
    expect(body).not.toContain(SECRET);
  });

  async function seedCrossReferences() {
    await seedSale(B.product, B.customer);
    await db.insert(schema.sales).values({
      id: BILLED_SALE,
      documentNumber: 'SALE-2',
      businessDayId: DAY,
      shiftId: SHIFT,
      saleType: 'Product',
      paymentMethod: 'Cash',
      customerId: B.customer,
      attendantId: A.user,
      subtotalAmount: '118',
      taxAmount: '0',
      totalAmount: '118',
      captureMechanism: 'POS',
    });
    await db.insert(schema.saleItems).values({
      saleId: BILLED_SALE,
      productId: B.product,
      quantity: '1',
      unitPrice: '118',
      discountAmount: '0',
      taxAmount: '0',
      lineTotal: '118',
      taxCategory: 'GST',
      taxableAmount: '100',
    });
    await db.insert(schema.customerTransactions).values({
      id: CREDIT,
      shiftId: SHIFT,
      businessDayId: DAY,
      customerId: B.customer,
      productId: B.product,
      vehicleId: B.vehicle,
      attendantId: A.user,
      duId: A.du,
      transactionType: 'Credit Sale',
      referenceType: 'CREDIT_SALE',
      amount: '118',
      quantity: '1',
    });
    await db.insert(schema.purchases).values({
      id: PURCHASE,
      organizationId: A.org,
      stationId: A.station,
      businessDayId: DAY,
      supplierId: B.supplier,
      documentNumber: 'PUR-1',
      amount: '118',
    });
    await db.insert(schema.purchaseItems).values({
      purchaseId: PURCHASE,
      productId: B.product,
      quantity: '1',
      unitPrice: '118',
      lineTotal: '118',
      taxableAmount: '100',
      taxCategory: 'GST',
    });
    await db.insert(schema.supplierTransactions).values({
      organizationId: A.org,
      stationId: A.station,
      supplierId: B.supplier,
      fundingAccountId: A.account,
      transactionType: 'Payment',
      amount: '118',
      entryDate: DATE,
    });
    await db.insert(schema.collections).values({
      id: COLLECTION,
      documentNumber: 'COL-1',
      organizationId: A.org,
      stationId: A.station,
      customerId: B.customer,
      fundingAccountId: A.account,
      paymentMethod: 'Cash',
      amount: '118',
      entryDate: DATE,
    });
    await db.insert(schema.stockMovements).values({
      businessDayId: DAY,
      shiftId: SHIFT,
      productId: B.product,
      tankId: B.tank,
      movementType: 'Sale',
      quantity: '-1',
      referenceType: 'SALE',
      referenceId: SALE,
    });
    await db.insert(schema.stockVariances).values({
      organizationId: A.org,
      stationId: A.station,
      businessDayId: DAY,
      productId: B.product,
      tankId: B.tank,
      expectedQuantity: '10',
      actualQuantity: '9',
      varianceQuantity: '1',
    });
    await db.update(schema.tanks).set({ productId: B.product }).where(eq(schema.tanks.id, A.tank));
    await db
      .update(schema.nozzles)
      .set({ productId: B.product, tankId: B.tank })
      .where(eq(schema.nozzles.id, A.nozzle));
    await db.insert(schema.nozzleReadings).values({
      shiftId: SHIFT,
      nozzleId: A.nozzle,
      openingReading: '100',
      closingReading: '101',
      volumeSold: '1',
      unitPrice: '118',
    });
    await db
      .update(schema.customerVehicles)
      .set({ defaultProductId: B.product })
      .where(eq(schema.customerVehicles.id, A.vehicle));
  }

  it.each([
    ['/transactions/customers/' + A.customer + '/vehicles', A.vehicle],
    ['/transactions/vehicles', A.vehicle],
    ['/transactions/vehicles/search?q=LOCAL', A.vehicle],
    ['/transactions/purchases', PURCHASE],
    ['/transactions/purchases/' + PURCHASE + '/items', B.product],
    ['/transactions/sales/tax-register', '118'],
    ['/transactions/purchases/gst-register', B.product],
    ['/transactions/supplier-payments', B.supplier],
    ['/transactions/collections', B.customer],
    ['/transactions/credit-sales', CREDIT],
    ['/transactions/money-movements', COLLECTION],
    ['/transactions/sales', SALE],
    ['/transactions/shifts/' + SHIFT + '/merchandise-handovers', SALE],
    ['/transactions/shifts/' + SHIFT + '/merchandise-sales', BILLED_SALE],
    ['/transactions/shifts/' + SHIFT + '/transactions', CREDIT],
    ['/transactions/inventory/status', A.tank],
    ['/transactions/inventory/movements', B.tank],
    ['/transactions/inventory/variances', B.tank],
    ['/shifts/status', SHIFT],
    ['/shifts/my-assignment', SHIFT],
  ])('tenant-scopes enrichment in %s', async (url, marker) => {
    await seedCrossReferences();
    const res = await app.request(
      `${url}${url.includes('?') ? '&' : '?'}stationId=${A.station}&from=${DATE}&to=${DATE}`,
    );
    const text = await res.text();
    expect(res.status, text).toBe(200);
    expect(text).toContain(marker);
    expect(text).not.toContain(SECRET);
  });

  it('DSR builder never copies a foreign Product, Tank name or Customer type', async () => {
    await seedCrossReferences();
    const source = await new DrizzleDssrDataReader(db).readBusinessDay(DAY);
    expect(source.stockVariances).toMatchObject([{ productName: 'Unknown', tankName: 'Unknown' }]);
    expect(source.creditSales).toEqual([{ customerType: 'Regular', amount: 118 }]);
    expect(JSON.stringify(source)).not.toContain(SECRET);
  });

  it('Shift Summary projection never copies foreign Product or Customer names', async () => {
    await seedCrossReferences();
    const result = await projectShiftSummary(
      db,
      {
        id: SHIFT,
        shiftTemplateId: TEMPLATE,
        openedBy: A.user,
        closedBy: null,
        openedAt: NOW,
        closedAt: null,
        openingCash: '0',
        closingCash: null,
      },
      {},
    );
    expect(JSON.stringify(result)).toContain(CREDIT);
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });

  it('Customer statement PDF source never copies a foreign Product or Vehicle', async () => {
    await seedCrossReferences();
    await db
      .update(schema.customerTransactions)
      .set({ customerId: A.customer })
      .where(eq(schema.customerTransactions.id, CREDIT));
    const result = await new DrizzleCustomerLedgerReader(db).statement(A.org, A.customer, {
      from: DATE,
      to: DATE,
    });
    expect(result.entries).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });

  it('Supplier statement PDF source never copies a foreign Product', async () => {
    await seedCrossReferences();
    await db
      .update(schema.purchases)
      .set({ supplierId: A.supplier })
      .where(eq(schema.purchases.id, PURCHASE));
    await db.insert(schema.supplierTransactions).values({
      organizationId: A.org,
      stationId: A.station,
      supplierId: A.supplier,
      transactionType: 'Purchase',
      amount: '118',
      entryDate: DATE,
      referenceType: 'PURCHASE',
      referenceId: PURCHASE,
    });
    const result = await new DrizzleSupplierLedgerReader(db).statement(
      A.org,
      A.supplier,
      { from: DATE, to: DATE },
      A.station,
    );
    expect(result.entries).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });

  it('Financial Account statement never copies foreign OMC Customer or Product names', async () => {
    await seedCrossReferences();
    await db.insert(schema.ledgerEntries).values({
      organizationId: A.org,
      stationId: A.station,
      accountId: A.account,
      direction: 'in',
      amount: '118',
      entryDate: DATE,
      sourceType: 'SALE_OMC',
      sourceId: CREDIT,
    });
    const result = await new DrizzleFinancialAccountReader(db).accountLedger(
      A.org,
      A.account,
      DATE,
      DATE,
    );
    expect(result?.entries).toHaveLength(1);
    expect(result?.entries).toMatchObject([{ omcQuantity: 1, omcNotes: null }]);
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });

  it('Fuel Price history never copies a foreign Product', async () => {
    await db.insert(schema.fuelPrices).values({
      organizationId: A.org,
      stationId: A.station,
      productId: B.product,
      price: '118',
      effectiveFrom: NOW,
    });
    expect(await listFuelPriceHistory(db, A.org, A.station)).toEqual([]);
  });

  it('density product picker never copies a foreign Product from a local Tank', async () => {
    await db
      .update(schema.products)
      .set({ productType: 'FUEL' })
      .where(eq(schema.products.id, B.product));
    await db.update(schema.tanks).set({ productId: B.product }).where(eq(schema.tanks.id, A.tank));
    expect(
      await new DrizzleDensityReadingRepository(db).listFuelProductsWithActiveTanks(
        A.org,
        A.station,
      ),
    ).toEqual([]);
  });

  it('linkable Decantation Purchase never copies a foreign Supplier name', async () => {
    await db
      .update(schema.products)
      .set({ productType: 'FUEL' })
      .where(eq(schema.products.id, A.product));
    await db.insert(schema.purchases).values({
      id: PURCHASE,
      organizationId: A.org,
      stationId: A.station,
      supplierId: B.supplier,
      documentNumber: 'FUEL-1',
      amount: '118',
      entryDate: DATE,
    });
    await db.insert(schema.purchaseItems).values({
      purchaseId: PURCHASE,
      productId: A.product,
      quantity: '1',
      unitPrice: '118',
      lineTotal: '118',
      taxableAmount: '118',
      taxCategory: 'FUEL_VAT',
    });
    const result = await new DrizzleDecantationLinkRepository(db).listLinkable(
      A.org,
      A.station,
      A.product,
    );
    expect(result).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });

  it('Attendant report PDF source never copies foreign Product, Customer or Vehicle names', async () => {
    await seedCrossReferences();
    await db
      .update(schema.shifts)
      .set({ status: 'CLOSED', closedAt: NOW })
      .where(eq(schema.shifts.id, SHIFT));
    await db.insert(schema.attendantHandovers).values({
      organizationId: A.org,
      stationId: A.station,
      shiftId: SHIFT,
      userId: A.user,
      duId: A.du,
      cashHandedOver: '118',
      cardHandedOver: '0',
      upiHandedOver: '0',
      creditHandedOver: '118',
      expectedSales: '118',
      varianceAmount: '0',
      testingVolume: '0',
    });
    const result = await new DrizzleAttendantHandoverReportReader(db).read({
      organizationId: A.org,
      stationId: A.station,
      from: DATE,
      to: DATE,
    });
    expect(result.creditSales).toHaveLength(1);
    expect(result.nozzleReadings).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });

  async function absentDay() {
    await db
      .delete(schema.shiftStaffAssignments)
      .where(eq(schema.shiftStaffAssignments.shiftId, SHIFT));
    await db.delete(schema.shifts).where(eq(schema.shifts.id, SHIFT));
    await db.delete(schema.businessDays).where(eq(schema.businessDays.id, DAY));
  }

  async function otherStation() {
    await db
      .insert(schema.stations)
      .values({ id: C.station, organizationId: A.org, name: 'Other local Station', code: 'OTHER' });
    await db.insert(schema.tanks).values({
      id: C.tank,
      organizationId: A.org,
      stationId: C.station,
      name: 'Other Tank',
      productId: A.product,
      capacity: '10000',
    });
    await db.insert(schema.dispenserUnits).values({
      id: C.du,
      organizationId: A.org,
      stationId: C.station,
      name: 'Other DU',
      code: 'OTHER',
    });
    await db.insert(schema.nozzles).values({
      id: C.nozzle,
      organizationId: A.org,
      stationId: C.station,
      duId: C.du,
      tankId: C.tank,
      productId: A.product,
      name: 'Other Nozzle',
      currentReading: '100',
    });
    await db.insert(schema.paymentTerminals).values({
      id: C.terminal,
      organizationId: A.org,
      stationId: C.station,
      label: 'Other Terminal',
    });
  }

  describe('follow-up: remaining reference boundaries', () => {
    it('retail rejects an empty Customer reference before any DML', async () => {
      writes = [];
      const res = await post('/transactions/sales', {
        stationId: A.station,
        shiftId: SHIFT,
        paymentMethod: 'Cash',
        customerId: '',
        lines: [line()],
      });
      expect(writes).toEqual([]);
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({
        success: false,
        error: { code: 'VALIDATION_ERROR' },
      });
    });
    it.each([
      { kind: 'foreign Product', bad: { productId: B.product } },
      { kind: 'missing Product', bad: { productId: randomUUID() } },
      { kind: 'foreign Tank', bad: { tankId: B.tank } },
      { kind: 'missing Tank', bad: { tankId: randomUUID() } },
      { kind: 'empty Tank', bad: { tankId: '' } },
      { kind: 'foreign Nozzle', bad: { nozzleId: B.nozzle } },
      { kind: 'missing Nozzle', bad: { nozzleId: randomUUID() } },
      { kind: 'empty Nozzle', bad: { nozzleId: '' } },
      { kind: 'other-Station Tank', bad: { tankId: C.tank } },
      { kind: 'other-Station Nozzle', bad: { nozzleId: C.nozzle } },
    ])('density rejects $kind without DML', async ({ bad }) => {
      await otherStation();
      const before = await counts();
      writes = [];
      const res = await post('/transactions/density/readings', {
        stationId: A.station,
        productId: A.product,
        kind: 'ADHOC',
        entryMethod: 'DIRECT_15',
        density15: 750,
        sampledFrom: 'NOZZLE',
        ...bad,
      });
      expect(writes).toEqual([]);
      expect(res.status).toBe(404);
      expect(await counts()).toEqual(before);
    });

    it.each(['Tank', 'Nozzle'] as const)(
      'density rejects a local %s for another Product without DML',
      async (kind) => {
        await db.insert(schema.products).values({
          id: C.product,
          organizationId: A.org,
          name: 'Other local Product',
          code: 'OTHER',
          productType: 'FUEL',
          unit: 'L',
        });
        if (kind === 'Tank')
          await db
            .update(schema.tanks)
            .set({ productId: C.product })
            .where(eq(schema.tanks.id, A.tank));
        else
          await db
            .update(schema.nozzles)
            .set({ productId: C.product })
            .where(eq(schema.nozzles.id, A.nozzle));
        writes = [];
        const res = await post('/transactions/density/readings', {
          stationId: A.station,
          productId: A.product,
          kind: 'ADHOC',
          entryMethod: 'DIRECT_15',
          density15: 750,
          ...(kind === 'Tank' ? { tankId: A.tank } : { nozzleId: A.nozzle }),
        });
        expect(writes).toEqual([]);
        expect(res.status).toBe(404);
      },
    );

    it('density rejects a local Nozzle/Tank mismatch without DML', async () => {
      await db.insert(schema.tanks).values({
        id: C.tank,
        organizationId: A.org,
        stationId: A.station,
        name: 'Second Tank',
        productId: A.product,
        capacity: '10000',
      });
      writes = [];
      const res = await post('/transactions/density/readings', {
        stationId: A.station,
        productId: A.product,
        kind: 'ADHOC',
        entryMethod: 'DIRECT_15',
        density15: 750,
        tankId: C.tank,
        nozzleId: A.nozzle,
      });
      expect(writes).toEqual([]);
      expect(res.status).toBe(404);
    });

    it('density accepts compatible local references', async () => {
      const res = await post('/transactions/density/readings', {
        stationId: A.station,
        productId: A.product,
        kind: 'ADHOC',
        entryMethod: 'DIRECT_15',
        density15: 750,
        tankId: A.tank,
        nozzleId: A.nozzle,
      });
      expect(res.status).toBe(200);
      expect(await db.select().from(schema.densityReadings)).toMatchObject([
        {
          productId: A.product,
          tankId: A.tank,
          nozzleId: A.nozzle,
          organizationId: A.org,
          stationId: A.station,
        },
      ]);
    });

    it.each([
      { kind: 'foreign Station', bad: { stationId: B.station, staffAssignments: [] } },
      { kind: 'missing Station', bad: { stationId: randomUUID(), staffAssignments: [] } },
      { kind: 'foreign Template', bad: { shiftTemplateId: OTHER_TEMPLATE } },
      { kind: 'missing Template', bad: { shiftTemplateId: randomUUID() } },
      { kind: 'foreign Terminal', bad: { terminalLinks: [{ terminalId: B.terminal }] } },
      { kind: 'missing Terminal', bad: { terminalLinks: [{ terminalId: randomUUID() }] } },
      { kind: 'other-Station Terminal', bad: { terminalLinks: [{ terminalId: C.terminal }] } },
      {
        kind: 'foreign Terminal DU',
        bad: { terminalLinks: [{ terminalId: A.terminal, duId: B.du }] },
      },
      {
        kind: 'missing Terminal DU',
        bad: { terminalLinks: [{ terminalId: A.terminal, duId: randomUUID() }] },
      },
      { kind: 'empty Terminal DU', bad: { terminalLinks: [{ terminalId: A.terminal, duId: '' }] } },
      {
        kind: 'other-Station Terminal DU',
        bad: { terminalLinks: [{ terminalId: A.terminal, duId: C.du }] },
      },
    ])('Shift open rejects $kind before any lazy-day DML', async ({ bad }) => {
      await absentDay();
      await otherStation();
      await db.insert(schema.fuelPrices).values({
        organizationId: A.org,
        stationId: A.station,
        productId: A.product,
        price: '118',
        effectiveFrom: NOW,
      });
      const before = await counts();
      writes = [];
      const result = await runInTransaction(db, (tx, events) =>
        new OpenShift(deps(tx, events)).execute(
          {
            stationId: A.station,
            shiftTemplateId: TEMPLATE,
            businessDate: DATE,
            staffAssignments: [{ userId: A.user, duId: A.du }],
            ...bad,
          },
          ctx(),
        ),
      );
      expect(writes).toEqual([]);
      expect(result).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
      expect(await counts()).toEqual(before);
    });

    it('Shift open accepts compatible local Terminal links', async () => {
      await absentDay();
      await db.insert(schema.fuelPrices).values({
        organizationId: A.org,
        stationId: A.station,
        productId: A.product,
        price: '118',
        effectiveFrom: NOW,
      });
      const result = await runInTransaction(db, (tx, events) =>
        new OpenShift(deps(tx, events)).execute(
          {
            stationId: A.station,
            shiftTemplateId: TEMPLATE,
            businessDate: DATE,
            staffAssignments: [{ userId: A.user, duId: A.du }],
            terminalLinks: [{ terminalId: A.terminal, duId: A.du }],
          },
          ctx(),
        ),
      );
      expect(result.success).toBe(true);
      expect(await db.select().from(schema.shiftTerminalLinks)).toMatchObject([
        { terminalId: A.terminal, duId: A.du },
      ]);
    });

    it.each(
      ['customers', 'suppliers'].flatMap((party) =>
        [0, 10].flatMap((openingDue) =>
          ['foreign', 'missing', 'empty'].map((kind) => ({ party, openingDue, kind })),
        ),
      ),
    )(
      '$party refuses a $kind record Station masked by a local opening Station ($openingDue)',
      async ({ party, openingDue, kind }) => {
        const before = await counts();
        writes = [];
        const res = await post(`/transactions/${party}`, {
          name: 'New party',
          customerType: 'Credit',
          stationId: kind === 'foreign' ? B.station : kind === 'missing' ? randomUUID() : '',
          openingStationId: A.station,
          openingDue,
          openingAsOf: DATE,
        });
        expect(writes).toEqual([]);
        expect(res.status).toBe(404);
        expect(await counts()).toEqual(before);
      },
    );

    it.each(
      ['Credit', 'OMC'].flatMap((type) =>
        [
          { kind: 'Product', bad: { productId: B.product } },
          { kind: 'Vehicle', bad: { vehicleId: B.vehicle } },
        ].map((reference) => ({ type, ...reference })),
      ),
    )('$type refuses foreign $kind before absent-day DML', async ({ type, bad }) => {
      await absentDay();
      const before = await counts();
      writes = [];
      const result = await runInTransaction(db, (tx, events) => {
        const uc =
          type === 'Credit'
            ? new RecordCreditSale(deps(tx, events))
            : new RecordOmcCardSale(deps(tx, events));
        return uc.execute(
          {
            stationId: A.station,
            transactionDate: DATE,
            customerId: A.customer,
            amount: 118,
            ...bad,
          },
          ctx(),
        );
      });
      expect(writes).toEqual([]);
      expect(result).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
      expect(await counts()).toEqual(before);
    });

    it.each(['foreign', 'other-Station', 'incompatible', 'sum'] as const)(
      'Purchase rejects %s allocations before absent-day DML',
      async (kind) => {
        await absentDay();
        await otherStation();
        if (kind === 'incompatible') {
          await db.insert(schema.products).values({
            id: C.product,
            organizationId: A.org,
            name: 'Other local Product',
            code: 'OTHER',
            productType: 'LUBRICANT',
            unit: 'PCS',
          });
          await db
            .update(schema.tanks)
            .set({ productId: C.product })
            .where(eq(schema.tanks.id, A.tank));
        }
        const before = await counts();
        writes = [];
        const result = await runInTransaction(db, (tx, events) =>
          new RecordPurchase(deps(tx, events)).execute(
            {
              stationId: A.station,
              supplierId: A.supplier,
              transactionDate: DATE,
              lines: [
                {
                  ...line(),
                  tankAllocations: [
                    {
                      tankId:
                        kind === 'foreign' ? B.tank : kind === 'other-Station' ? C.tank : A.tank,
                      quantity: kind === 'sum' ? 2 : 1,
                    },
                  ],
                },
              ],
            },
            ctx(),
          ),
        );
        expect(writes).toEqual([]);
        expect(result).toMatchObject({
          success: false,
          error: {
            code: kind === 'sum' ? 'INVARIANT_VIOLATION' : 'NOT_FOUND',
          },
        });
        expect(await counts()).toEqual(before);
      },
    );

    it('Purchase preserves compatible Product Tank allocations', async () => {
      const result = await runInTransaction(db, (tx, events) =>
        new RecordPurchase(deps(tx, events)).execute(
          {
            stationId: A.station,
            supplierId: A.supplier,
            transactionDate: DATE,
            lines: [{ ...line(), tankAllocations: [{ tankId: A.tank, quantity: 1 }] }],
          },
          ctx(),
        ),
      );
      expect(result.success).toBe(true);
      if (!result.success) throw new Error('compatible allocation refused');
      expect(result.data.items[0].tankAllocations).toEqual([{ tankId: A.tank, quantity: 1 }]);
      expect(result.data.movements).toMatchObject([
        { tankId: A.tank, productId: A.product, quantity: '1' },
      ]);
    });

    it.each(['new', 'deduplicated'] as const)(
      'save-as-Customer checks Vehicle membership before %s buyer DML',
      async (kind) => {
        if (kind === 'deduplicated')
          await db
            .update(schema.customers)
            .set({ name: 'Walk-in' })
            .where(eq(schema.customers.id, A.customer));
        const otherCustomer = randomUUID();
        await db.insert(schema.customers).values({
          id: otherCustomer,
          organizationId: A.org,
          name: 'Different local buyer',
          customerType: 'Regular',
        });
        await db
          .update(schema.customerVehicles)
          .set({ customerId: otherCustomer })
          .where(eq(schema.customerVehicles.id, A.vehicle));
        const before = await counts();
        writes = [];
        const res = await post('/transactions/sales', {
          stationId: A.station,
          shiftId: SHIFT,
          paymentMethod: 'Cash',
          vehicleId: A.vehicle,
          lines: [line()],
          buyer: { name: 'Walk-in' },
          saveAsCustomer: true,
        });
        expect(writes).toEqual([]);
        expect(res.status).toBe(404);
        expect(await counts()).toEqual(before);
      },
    );

    it.each(['Organization', 'Station'] as const)(
      'Financial Account statement rejects a foreign %s source quantity and notes in SQL',
      async (kind) => {
        const otherDay = randomUUID();
        const otherSource = randomUUID();
        if (kind === 'Station') await otherStation();
        await db.insert(schema.businessDays).values({
          id: otherDay,
          organizationId: kind === 'Station' ? A.org : B.org,
          stationId: kind === 'Station' ? C.station : B.station,
          businessDate: DATE,
          status: 'OPEN',
          openedBy: kind === 'Station' ? A.user : B.user,
        });
        await db.insert(schema.customerTransactions).values({
          id: otherSource,
          businessDayId: otherDay,
          transactionType: 'OMC Sale',
          referenceType: 'OMC_CARD_SALE',
          amount: '118',
          quantity: '987.654',
          notes: SECRET,
        });
        await db.insert(schema.ledgerEntries).values({
          organizationId: A.org,
          stationId: A.station,
          accountId: A.account,
          direction: 'in',
          amount: '118',
          entryDate: DATE,
          sourceType: 'SALE_OMC',
          sourceId: otherSource,
        });
        const result = await new DrizzleFinancialAccountReader(db).accountLedger(
          A.org,
          A.account,
          DATE,
          DATE,
        );
        expect(result?.entries).toMatchObject([{ omcQuantity: null, omcNotes: null }]);
        expect(JSON.stringify(result)).not.toContain(SECRET);
      },
    );

    it('invoice Customer and Station reads constrain Organization in SQL', async () => {
      await seedSale(A.product, A.customer);
      queries = [];
      const res = await post(`/transactions/sales/${SALE}/invoice`, {});
      expect(res.status).toBe(200);
      for (const table of ['customers', 'stations']) {
        // Exclude the write-policy usage COUNT; inspect the actual reference read.
        const reads = queries.filter(
          ({ query }) => query.includes(`from "${table}"`) && !query.includes('count(*)'),
        );
        expect(reads).toHaveLength(1);
        for (const read of reads) {
          expect(read.query).toContain(`"${table}"."organization_id" =`);
          expect(read.params).toContain(A.org);
        }
      }
    });

    it.each(
      ['range', 'opening'].flatMap((kind) =>
        ['Organization', 'Station'].map((boundary) => ({ kind, boundary })),
      ),
    )(
      'Financial Account $kind excludes foreign $boundary ledger rows referencing a local Account',
      async ({ kind, boundary }) => {
        if (boundary === 'Station') await otherStation();
        await db.insert(schema.ledgerEntries).values({
          organizationId: boundary === 'Station' ? A.org : B.org,
          stationId: boundary === 'Station' ? C.station : B.station,
          accountId: A.account,
          direction: 'in',
          amount: '118',
          entryDate: DATE,
          sourceType: 'EXPENSE',
          sourceId: randomUUID(),
          notes: SECRET,
        });
        const result = await new DrizzleFinancialAccountReader(db).accountLedger(
          A.org,
          A.account,
          kind === 'opening' ? '2026-10-10' : DATE,
          '2026-10-10',
        );
        expect(result?.entries).toEqual([]);
        expect(result?.periodOpeningBalance).toBe('0');
      },
    );

    it('Financial Account does not enrich non-OMC rows from a Customer transaction', async () => {
      await db.insert(schema.customerTransactions).values({
        id: CREDIT,
        businessDayId: DAY,
        transactionType: 'OMC Sale',
        referenceType: 'OMC_CARD_SALE',
        amount: '118',
        quantity: '2',
        notes: 'Local note',
      });
      await db.insert(schema.ledgerEntries).values({
        organizationId: A.org,
        stationId: A.station,
        accountId: A.account,
        direction: 'in',
        amount: '118',
        entryDate: DATE,
        sourceType: 'EXPENSE',
        sourceId: CREDIT,
      });
      const result = await new DrizzleFinancialAccountReader(db).accountLedger(
        A.org,
        A.account,
        DATE,
        DATE,
      );
      expect(result?.entries).toMatchObject([{ omcQuantity: null, omcNotes: null }]);
    });
  });
});
