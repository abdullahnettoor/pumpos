import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';
import { Hono } from 'hono';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import { schema, type DbClient } from '@pump/db';
import { stationSetupRouter } from '../../../routes/station-setup.js';
import { productsRouter } from '../../../routes/products.js';
import { paymentTerminalsRouter } from '../../../routes/payment-terminals.js';
import { transactionsRouter } from '../../../routes/transactions.js';
import type { AuthenticatedPrincipal } from '../../authenticated-principal.js';
import {
  DrizzleStationRepository,
  DrizzleTankRepository,
  DrizzleDispenserRepository,
  DrizzleNozzleRepository,
  DrizzleShiftTemplateRepository,
  DrizzleUserRepository,
} from '../setup-repositories.js';
import { DrizzleProductRepository } from '../product.repo.js';
import { DrizzlePaymentTerminalRepository } from '../payment-terminal.repo.js';

// Same shipped-migration harness as #713. No RLS crutch: exercise the API's
// privileged database connection and prove the adapters themselves scope SQL.
const CONNECTION = process.env.TEST_DATABASE_URL;
const TEST_SCHEMA = 'setup_tenancy_lock_it';
const ORG = '00000000-0000-0000-0000-00000000e101';
const FOREIGN = '00000000-0000-0000-0000-00000000e102';
const STATION = '00000000-0000-0000-0000-00000000e103';
const ACTOR = '00000000-0000-0000-0000-00000000e104';
const TARGET = '00000000-0000-0000-0000-00000000e105';
const PRODUCT = '00000000-0000-0000-0000-00000000e106';
const TANK = '00000000-0000-0000-0000-00000000e107';
const DU = '00000000-0000-0000-0000-00000000e108';
const NOZZLE = '00000000-0000-0000-0000-00000000e109';
const TEMPLATE = '00000000-0000-0000-0000-00000000e110';
const TERMINAL = '00000000-0000-0000-0000-00000000e111';
const DAY = '00000000-0000-0000-0000-00000000e112';
const SHIFT = '00000000-0000-0000-0000-00000000e113';
const SALE = '00000000-0000-0000-0000-00000000e114';
const OWN_STATION = '00000000-0000-0000-0000-00000000e115';
const STORED = { shift_grace_minutes: 15, report_config: { paper: 'A4' } };

const affectedRoutes = [
  ['PUT', `/setup/stations/${STATION}`, { settings: { report_config: {} } }],
  ['GET', `/setup/stations/${STATION}/decantation-settings`, {}],
  ['PUT', `/setup/tanks/${TANK}`, { name: 'changed' }],
  ['DELETE', `/setup/tanks/${TANK}`, {}],
  ['PUT', `/setup/dispensers/${DU}`, { name: 'changed' }],
  ['DELETE', `/setup/dispensers/${DU}`, {}],
  ['PUT', `/setup/nozzles/${NOZZLE}`, { name: 'changed' }],
  ['DELETE', `/setup/nozzles/${NOZZLE}`, {}],
  ['PUT', `/setup/shift-templates/${TEMPLATE}`, { name: 'changed' }],
  ['DELETE', `/setup/shift-templates/${TEMPLATE}`, {}],
  ['PUT', `/setup/products/${PRODUCT}`, { name: 'changed' }],
  ['DELETE', `/setup/products/${PRODUCT}`, {}],
  ['PUT', `/setup/payment-terminals/${TERMINAL}`, { label: 'changed' }],
  ['DELETE', `/setup/payment-terminals/${TERMINAL}`, {}],
  ['PUT', `/setup/users/${TARGET}`, { fullName: 'changed' }],
  ['GET', `/setup/users/${TARGET}/role-change-preview?role=Staff`, {}],
  ['GET', `/setup/users/${TARGET}/permissions`, {}],
  ['PUT', `/setup/users/${TARGET}/permissions`, { granted: [], revoked: [] }],
  ['POST', `/setup/users/${TARGET}/reset-password`, { password: 'a-valid-test-password' }],
  [
    'POST',
    `/setup/users/${TARGET}/app-access`,
    { email: 'target@example.com', password: 'a-valid-test-password' },
  ],
  ['POST', `/setup/users/${TARGET}/deactivate`, {}],
  ['POST', `/setup/users/${TARGET}/reactivate`, {}],
  ['POST', `/transactions/sales/${SALE}/invoice`, {}],
] as const;

describe.skipIf(!CONNECTION)('setup tenancy and Station PUT locking (#716), real Postgres', () => {
  const clients: postgres.Sql[] = [];
  let dbA: DbClient;
  let dbB: DbClient;
  let probe: postgres.Sql;
  let pidA: number;
  let pidB: number;
  const connect = () => {
    const client = postgres(CONNECTION!, {
      max: 1,
      onnotice: () => {},
      connection: { search_path: TEST_SCHEMA },
    });
    clients.push(client);
    return client;
  };
  beforeAll(async () => {
    const bootstrap = postgres(CONNECTION!, { max: 1, onnotice: () => {} });
    try {
      await bootstrap.unsafe('select pg_advisory_lock(872634)');
      await bootstrap.unsafe(`
        do $$ begin
          if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
          if not exists (select from pg_roles where rolname = 'anon') then create role anon; end if;
        end $$;
        drop schema if exists ${TEST_SCHEMA} cascade; create schema ${TEST_SCHEMA};
      `);
      const dir = path.resolve(__dirname, '../../../../../../supabase/migrations');
      const migrations = readdirSync(dir)
        .filter((f) => f.endsWith('.sql'))
        .sort()
        .map((f) => readFileSync(path.join(dir, f), 'utf8'))
        .join('\n')
        .replace(/(?:"public"|public)\./g, `"${TEST_SCHEMA}".`)
        .replace(
          /create trigger on_auth_user_created/gi,
          'create or replace trigger on_auth_user_created',
        );
      await bootstrap.unsafe(`set search_path to ${TEST_SCHEMA};` + migrations);
      await bootstrap.unsafe('select pg_advisory_unlock(872634)');
    } finally {
      await bootstrap.end();
    }
    const a = connect();
    const b = connect();
    dbA = drizzle(a, { schema }) as unknown as DbClient;
    dbB = drizzle(b, { schema }) as unknown as DbClient;
    probe = connect();
    pidA = (await a`select pg_backend_pid() as pid`)[0]!.pid;
    pidB = (await b`select pg_backend_pid() as pid`)[0]!.pid;
    await dbA.insert(schema.organizations).values([
      { id: ORG, name: 'Caller', subscriptionStatus: 'ACTIVE' },
      { id: FOREIGN, name: 'Other tenant', subscriptionStatus: 'ACTIVE' },
    ]);
    await dbA.insert(schema.users).values([
      { id: ACTOR, organizationId: ORG, fullName: 'Owner', role: 'Owner' },
      { id: TARGET, organizationId: FOREIGN, fullName: 'Target', role: 'Staff' },
    ]);
    await dbA.insert(schema.organizationCapabilityGrants).values({
      organizationId: ORG,
      capabilityKey: 'permissions.custom',
      grantedByEmail: 'platform@example.com',
    });
    await dbA.insert(schema.stations).values({
      id: STATION,
      organizationId: FOREIGN,
      name: 'Foreign Station',
      code: 'FOREIGN',
      settings: STORED,
    });
    await dbA.insert(schema.stations).values({
      id: OWN_STATION,
      organizationId: ORG,
      name: 'Caller Station',
      code: 'OWN',
      settings: STORED,
    });
    await dbA.insert(schema.products).values({
      id: PRODUCT,
      organizationId: FOREIGN,
      name: 'Fuel',
      code: 'MS',
      productType: 'FUEL',
      inventoryType: 'TANK',
      unit: 'L',
    });
    await dbA.insert(schema.tanks).values({
      id: TANK,
      organizationId: FOREIGN,
      stationId: STATION,
      productId: PRODUCT,
      name: 'Tank',
      capacity: '10000',
    });
    await dbA
      .insert(schema.dispenserUnits)
      .values({ id: DU, organizationId: FOREIGN, stationId: STATION, name: 'DU', code: 'DU' });
    await dbA.insert(schema.nozzles).values({
      id: NOZZLE,
      organizationId: FOREIGN,
      stationId: STATION,
      duId: DU,
      tankId: TANK,
      productId: PRODUCT,
      name: 'Nozzle',
      currentReading: '0',
    });
    await dbA.insert(schema.shiftTemplates).values({
      id: TEMPLATE,
      organizationId: FOREIGN,
      name: 'Day',
      startTime: '06:00',
      endTime: '14:00',
    });
    await dbA.insert(schema.paymentTerminals).values({
      id: TERMINAL,
      organizationId: FOREIGN,
      stationId: STATION,
      label: 'Terminal',
      provider: 'HDFC',
    });
    await dbA.insert(schema.businessDays).values({
      id: DAY,
      organizationId: FOREIGN,
      stationId: STATION,
      businessDate: '2026-10-09',
      openedBy: TARGET,
    });
    await dbA.insert(schema.shifts).values({
      id: SHIFT,
      organizationId: FOREIGN,
      stationId: STATION,
      businessDayId: DAY,
      shiftTemplateId: TEMPLATE,
      openedBy: TARGET,
    });
    await dbA.insert(schema.sales).values({
      id: SALE,
      documentNumber: 'SAL-716',
      shiftId: SHIFT,
      businessDayId: DAY,
      saleType: 'Product',
      subtotalAmount: '100',
      taxAmount: '0',
      totalAmount: '100',
    });
  }, 60_000);

  afterAll(async () => {
    if (probe) {
      await probe.unsafe('select pg_advisory_lock(872634)');
      await probe.unsafe(`drop schema if exists ${TEST_SCHEMA} cascade`);
      await probe.unsafe('select pg_advisory_unlock(872634)');
    }
    await Promise.all(clients.map((c) => c.end()));
  });

  const principal: AuthenticatedPrincipal = {
    id: ACTOR,
    organizationId: ORG,
    role: 'Owner',
    fullName: 'Owner',
    email: 'owner@example.com',
    assignedStationIds: [],
  };
  function app(db: DbClient, user: AuthenticatedPrincipal = principal) {
    const server = new Hono<{ Variables: { db: DbClient; user: AuthenticatedPrincipal } }>();
    server.use('*', async (c, next) => {
      c.set('db', db);
      c.set('user', user);
      await next();
    });
    server.route('/setup', stationSetupRouter);
    server.route('/setup', productsRouter);
    server.route('/setup', paymentTerminalsRouter);
    server.route('/transactions', transactionsRouter);
    return server;
  }
  const request = async (
    db: DbClient,
    method: string,
    url: string,
    body: unknown,
    user: AuthenticatedPrincipal = principal,
  ) =>
    app(db, user).request(
      url,
      {
        method,
        headers: { 'Content-Type': 'application/json' },
        ...(method === 'GET' ? {} : { body: JSON.stringify(body) }),
      },
      {
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SECRET_KEY: 'test-secret-never-used',
      },
    );
  // Compare whole rows, including settings, timestamps and login linkage.
  async function snapshot() {
    const result: Record<string, unknown> = {};
    for (const table of [
      'stations',
      'tanks',
      'dispenser_units',
      'nozzles',
      'shift_templates',
      'users',
      'products',
      'payment_terminals',
      'events',
      'user_station_assignments',
      'sales',
      'invoices',
    ]) {
      result[table] = await probe.unsafe(`select * from ${table} order by 1`);
    }
    return JSON.parse(JSON.stringify(result));
  }

  it.each(affectedRoutes)(
    '%s %s refuses a foreign row without any write',
    async (method, url, body) => {
      const before = await snapshot();
      const res = await request(dbA, method, url, body);
      expect([403, 404]).toContain(res.status);
      expect(await res.json()).toMatchObject({
        success: false,
        error: { code: res.status === 404 ? 'NOT_FOUND' : expect.any(String) },
      });
      expect(await snapshot()).toEqual(before);
    },
  );

  it.each(affectedRoutes)(
    '%s %s rejects a malformed id with VALIDATION_ERROR',
    async (method, url, body) => {
      const malformed = url.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/, 'not-a-uuid');
      const before = await snapshot();
      const res = await request(dbA, method, malformed, body);
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({
        success: false,
        error: { code: 'VALIDATION_ERROR' },
      });
      expect(await snapshot()).toEqual(before);
    },
  );

  const repositories = () =>
    [
      ['Station', new DrizzleStationRepository(dbA), STATION],
      ['Tank', new DrizzleTankRepository(dbA), TANK],
      ['Dispenser', new DrizzleDispenserRepository(dbA), DU],
      ['Nozzle', new DrizzleNozzleRepository(dbA), NOZZLE],
      ['ShiftTemplate', new DrizzleShiftTemplateRepository(dbA), TEMPLATE],
      ['User', new DrizzleUserRepository(dbA), TARGET],
      ['Product', new DrizzleProductRepository(dbA), PRODUCT],
      ['PaymentTerminal', new DrizzlePaymentTerminalRepository(dbA), TERMINAL],
    ] as const;

  for (let i = 0; i < 8; i++) {
    it(`repository ${['Station', 'Tank', 'Dispenser', 'Nozzle', 'ShiftTemplate', 'User', 'Product', 'PaymentTerminal'][i]} refuses a foreign read`, async () => {
      const [, repo, id] = repositories()[i]!;
      expect(await repo.findById(id, ORG)).toBeNull();
      expect((await repo.findById(id, FOREIGN))?.id).toBe(id);
    });
    it(`repository ${['Station', 'Tank', 'Dispenser', 'Nozzle', 'ShiftTemplate', 'User', 'Product', 'PaymentTerminal'][i]} cannot upsert over another tenant`, async () => {
      const [, repo, id] = repositories()[i]!;
      const row = await repo.findById(id, FOREIGN);
      expect(row?.id).toBe(id);
      const before = await snapshot();
      // Discriminated entity types are only erased at this table-driven seam.
      await repo.save({
        ...row,
        organizationId: ORG,
        name: 'changed',
        label: 'changed',
        fullName: 'changed',
      } as never);
      expect(await snapshot()).toEqual(before);
    });
  }

  const directMethods: Array<[string, () => Promise<unknown>, unknown]> = [
    [
      'Tank.findByIdForUpdate',
      () => new DrizzleTankRepository(dbA).findByIdForUpdate(TANK, ORG),
      null,
    ],
    ['Tank.hasNozzles', () => new DrizzleTankRepository(dbA).hasNozzles(TANK, ORG), false],
    ['Tank.deactivateById', () => new DrizzleTankRepository(dbA).deactivateById(TANK, ORG), false],
    ['Dispenser.deleteById', () => new DrizzleDispenserRepository(dbA).deleteById(DU, ORG), false],
    ['Nozzle.deleteById', () => new DrizzleNozzleRepository(dbA).deleteById(NOZZLE, ORG), false],
    [
      'ShiftTemplate.deleteById',
      () => new DrizzleShiftTemplateRepository(dbA).deleteById(TEMPLATE, ORG),
      false,
    ],
    [
      'User.linkLogin',
      () => new DrizzleUserRepository(dbA).linkLogin(TARGET, ACTOR, ORG),
      undefined,
    ],
    [
      'User.setStationAssignments',
      async () => {
        await expect(
          new DrizzleUserRepository(dbA).setStationAssignments(TARGET, [], ORG),
        ).rejects.toThrow('User does not belong');
      },
      undefined,
    ],
    [
      'Product.updateCostBasis',
      () => new DrizzleProductRepository(dbA).updateCostBasis(PRODUCT, '999', ORG),
      undefined,
    ],
    [
      'Station.lockForUpdate',
      () => new DrizzleStationRepository(dbA).lockForUpdate(STATION, ORG),
      null,
    ],
    [
      'Station.patchSettings',
      () =>
        new DrizzleStationRepository(dbA).patchSettings(
          STATION,
          ORG,
          { changed: true },
          '2026-10-09T00:00:00Z',
        ),
      null,
    ],
  ];
  it.each(directMethods)('%s refuses a foreign direct operation', async (_name, run, expected) => {
    const before = await snapshot();
    expect(await run()).toEqual(expected);
    expect(await snapshot()).toEqual(before);
  });

  it('a Manager General form save retains tank rules without station.tankLevels (#716)', async () => {
    const initial = {
      ...STORED,
      tankLevels: { criticalBelowPct: 20, lowBelowPct: 40 },
      stock_variance_tolerance_pct: 1.5,
    };
    await dbA
      .update(schema.stations)
      .set({ settings: initial })
      .where(eq(schema.stations.id, OWN_STATION));
    const general = {
      shift_grace_minutes: 30,
      timezone: 'Asia/Kolkata',
      business_day_starts_at: '06:00',
    };
    const res = await request(
      dbA,
      'PUT',
      `/setup/stations/${OWN_STATION}`,
      { settings: general },
      {
        ...principal,
        role: 'Manager',
        permissions: new Set(['station.manage']),
        assignedStationIds: [OWN_STATION],
      },
    );
    expect(res.status).toBe(200);
    const [row] = await dbA
      .select()
      .from(schema.stations)
      .where(eq(schema.stations.id, OWN_STATION));
    expect(row!.settings).toEqual({ ...initial, ...general });
  });

  async function waitUntilBlocked(pid: number) {
    for (let i = 0; i < 300; i++) {
      const [row] = await probe`select wait_event_type from pg_stat_activity where pid = ${pid}`;
      if (row?.wait_event_type === 'Lock') return;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error(`backend ${pid} never blocked`);
  }

  async function race(
    a: Record<string, unknown>,
    b: Record<string, unknown>,
    initial: Record<string, unknown> = STORED,
  ) {
    await dbA
      .update(schema.stations)
      .set({ settings: initial })
      .where(eq(schema.stations.id, OWN_STATION));
    await dbA.delete(schema.events);
    // An external transaction gates both real HTTP requests. With the fix,
    // each queues before reading; without it both read stale settings then
    // block at the upsert. No mocked repository/SQL/transaction or timing race.
    const blocker = connect();
    let first: Promise<Response> | undefined;
    let second: Promise<Response> | undefined;
    try {
      await blocker`begin`;
      await blocker`select id from stations where id = ${OWN_STATION} for update`;
      first = request(dbA, 'PUT', `/setup/stations/${OWN_STATION}`, { settings: a });
      await waitUntilBlocked(pidA);
      second = request(dbB, 'PUT', `/setup/stations/${OWN_STATION}`, { settings: b });
      await waitUntilBlocked(pidB);
    } finally {
      await blocker`commit`;
    }
    expect((await first!).status).toBe(200);
    expect((await second!).status).toBe(200);
    const [row] = await dbA
      .select()
      .from(schema.stations)
      .where(eq(schema.stations.id, OWN_STATION));
    const events =
      await probe`select payload from events where event_type = 'STATION_UPDATED' order by occurred_at, id`;
    return { settings: row!.settings, payloads: events.map((e) => e.payload) };
  }

  it('concurrent Station PUTs to different settings keys both survive', async () => {
    const result = await race({ shift_grace_minutes: 30 }, { report_config: { paper: 'LETTER' } });
    expect(result.settings).toEqual({
      shift_grace_minutes: 30,
      report_config: { paper: 'LETTER' },
    });
    expect(result.payloads).toEqual([{ stationId: OWN_STATION }, { stationId: OWN_STATION }]);
  });

  it('concurrent General and Branding form-shaped PUTs preserve both forms and replace nested values (#716)', async () => {
    // These are the exact settings-key sets asserted from the rendered forms
    // in StationPages.dom.test.tsx. Both operators start from this same version.
    const initial = {
      ...STORED,
      timezone: 'Asia/Kolkata',
      business_day_starts_at: '06:00',
      legal: { legalName: 'Old name', roCode: 'OLD', contact: 'Old contact' },
      fuel_brand: 'Old brand',
      logo_data_url: null,
    };
    const general = {
      shift_grace_minutes: 30,
      timezone: 'Asia/Dubai',
      business_day_starts_at: '05:00',
    };
    const branding = {
      legal: {
        legalName: 'New name',
        gstin: null,
        stateCode: null,
        addressLine: null,
        pincode: null,
        roCode: null,
      },
      fuel_brand: 'New brand',
      logo_data_url: null,
    };
    const result = await race(general, branding, initial);
    expect(result.settings).toEqual({ ...STORED, ...general, ...branding });
    expect(result.payloads).toEqual([{ stationId: OWN_STATION }, { stationId: OWN_STATION }]);
  });

  it('concurrent Station PUT events use the preceding committed before/after', async () => {
    const result = await race(
      { stock_variance_tolerance_pct: 1 },
      { stock_variance_tolerance_pct: 2 },
    );
    expect(result.settings).toEqual({ ...STORED, stock_variance_tolerance_pct: 2 });
    expect(result.payloads).toEqual([
      { stationId: OWN_STATION, stockVarianceTolerancePct: { before: 0.5, after: 1 } },
      { stationId: OWN_STATION, stockVarianceTolerancePct: { before: 1, after: 2 } },
    ]);
  });
});
