import { and, eq, ilike, ne, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { schema, seedDemoStation, type DbClient } from '@pump/db';
import { createEvent, SystemClock, UuidGenerator, type DomainEvent } from '@pump/core';
import { SupabaseAdmin } from '../infra/supabase-admin.js';

type DemoBindings = {
  ALLOW_DEMO_ORGS?: string;
  SUPABASE_URL?: string;
  SUPABASE_SECRET_KEY?: string;
  INVITE_REDIRECT_URL?: string;
};
type DemoVariables = { db: DbClient; platformAdmin: { email: string; subjectId: string | null } };

export const platformDemosRouter = new Hono<{ Bindings: DemoBindings; Variables: DemoVariables }>();

function appendDemoEvent(
  db: DbClient,
  eventType: string,
  organizationId: string,
  aggregateId: string,
  stationId: string | null,
  payload: Record<string, unknown>,
) {
  const ids = new UuidGenerator();
  const event = createEvent(
    {
      eventType,
      aggregateType: 'organization',
      aggregateId,
      payload: { ...payload, source: 'platform-demo' },
      organizationId,
      stationId,
      actorId: null,
      correlationId: ids.newId(),
      metadata: {
        source: 'platform-demo',
        grouping: { role: 'primary' },
        actorSnapshot: {
          kind: 'platform_admin',
          displayName: 'Platform Admin',
          role: 'Platform Admin',
        },
      },
    },
    { ids, clock: new SystemClock() },
  );
  return db.insert(schema.events).values({
    eventId: event.eventId,
    eventType: event.eventType,
    organizationId: event.organizationId,
    stationId: event.stationId,
    businessDayId: null,
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId,
    occurredAt: new Date(event.occurredAt),
    recordedAt: new Date(event.recordedAt),
    actorId: event.actorId,
    correlationId: event.correlationId,
    payload: event.payload as Record<string, unknown>,
    metadata: event.metadata,
  });
}

platformDemosRouter.use('*', async (c, next) => {
  if (c.env.ALLOW_DEMO_ORGS !== 'true') {
    return c.json(
      {
        success: false,
        error: { code: 'FORBIDDEN', message: 'Demo organizations are disabled for this target' },
      },
      403,
    );
  }
  await next();
});

function adminFor(c: { env: DemoBindings }) {
  if (!c.env.SUPABASE_URL || !c.env.SUPABASE_SECRET_KEY) return null;
  return new SupabaseAdmin({ url: c.env.SUPABASE_URL, secretKey: c.env.SUPABASE_SECRET_KEY });
}

async function ownerFor(db: DbClient, organizationId: string) {
  const [owner] = await db
    .select()
    .from(schema.users)
    .where(and(eq(schema.users.organizationId, organizationId), eq(schema.users.role, 'Owner')))
    .limit(1);
  return owner ?? null;
}

async function clearDemoData(db: DbClient, organizationId: string, keepUsers: boolean) {
  await db.execute(
    sql`delete from handover_terminal_entries where handover_id in (select id from attendant_handovers where organization_id = ${organizationId}::uuid)`,
  );
  await db.execute(
    sql`delete from shift_summaries where shift_id in (select id from shifts where organization_id = ${organizationId}::uuid)`,
  );
  await db.execute(
    sql`delete from nozzle_readings where shift_id in (select id from shifts where organization_id = ${organizationId}::uuid)`,
  );
  await db.execute(
    sql`delete from shift_staff_assignments where shift_id in (select id from shifts where organization_id = ${organizationId}::uuid)`,
  );
  await db.execute(
    sql`delete from shift_terminal_links where shift_id in (select id from shifts where organization_id = ${organizationId}::uuid)`,
  );
  await db.execute(
    sql`delete from invoices where sale_id in (select id from sales where organization_id = ${organizationId}::uuid)`,
  );
  await db.execute(
    sql`delete from sale_items where sale_id in (select id from sales where organization_id = ${organizationId}::uuid)`,
  );
  await db.execute(
    sql`delete from purchase_items where purchase_id in (select id from purchases where organization_id = ${organizationId}::uuid)`,
  );
  await db.execute(
    sql`delete from customer_vehicles where customer_id in (select id from customers where organization_id = ${organizationId}::uuid)`,
  );
  await db.execute(
    sql`delete from customer_discount_rules where customer_id in (select id from customers where organization_id = ${organizationId}::uuid)`,
  );
  await db.execute(
    sql`delete from supplier_transactions where supplier_id in (select id from suppliers where organization_id = ${organizationId}::uuid)`,
  );
  await db.execute(sql`delete from sales where organization_id = ${organizationId}::uuid`);
  await db.execute(
    sql`delete from attendant_handovers where organization_id = ${organizationId}::uuid`,
  );
  await db.execute(
    sql`delete from stock_variances where business_day_id in (select id from business_days where organization_id = ${organizationId}::uuid)`,
  );
  await db.execute(
    sql`delete from stock_variances where shift_id in (select id from shifts where organization_id = ${organizationId}::uuid)`,
  );
  await db.execute(
    sql`delete from customer_transactions where shift_id in (select id from shifts where organization_id = ${organizationId}::uuid)`,
  );
  await db.execute(
    sql`delete from ledger_entries where shift_id in (select id from shifts where organization_id = ${organizationId}::uuid)`,
  );
  await db.execute(
    sql`delete from stock_movements where business_day_id in (select id from business_days where organization_id = ${organizationId}::uuid)`,
  );
  await db.execute(
    sql`delete from purchases where business_day_id in (select id from business_days where organization_id = ${organizationId}::uuid)`,
  );
  await db.execute(
    sql`delete from customer_transactions where organization_id = ${organizationId}::uuid`,
  );
  await db.execute(
    sql`delete from idempotency_keys where organization_id = ${organizationId}::uuid`,
  );
  await db.execute(sql`delete from ledger_entries where organization_id = ${organizationId}::uuid`);
  await db.execute(sql`delete from events where organization_id = ${organizationId}::uuid`);
  await db.execute(
    sql`delete from nozzle_readings where nozzle_id in (select n.id from nozzles n join stations s on s.id = n.station_id where s.organization_id = ${organizationId}::uuid)`,
  );
  await db.execute(
    sql`delete from user_station_assignments where station_id in (select id from stations where organization_id = ${organizationId}::uuid)`,
  );
  const tables = [
    'collections',
    'other_income',
    'expenses',
    'dssr_snapshots',
    'document_sequences',
    'fuel_prices',
    'expense_categories',
    'income_categories',
    'financial_accounts',
    'payment_terminals',
    'nozzles',
    'dispenser_units',
    'tanks',
    'products',
    'customers',
    'suppliers',
    'shifts',
    'business_days',
    'shift_templates',
    'stations',
  ];
  for (const table of tables)
    await db.execute(
      sql`delete from public.${sql.identifier(table)} where organization_id = ${organizationId}::uuid`,
    );
  await db
    .delete(schema.organizationCapabilityGrants)
    .where(eq(schema.organizationCapabilityGrants.organizationId, organizationId));
  await db
    .delete(schema.organizationLimitOverrides)
    .where(eq(schema.organizationLimitOverrides.organizationId, organizationId));
  if (!keepUsers)
    await db.delete(schema.users).where(eq(schema.users.organizationId, organizationId));
}

function optionsFromBody(body: Record<string, unknown>) {
  return {
    stationName: typeof body.stationName === 'string' ? body.stationName.trim() : 'Sample Fuels',
    town: typeof body.town === 'string' ? body.town.trim() : 'Thrissur',
    tanks: typeof body.tanks === 'number' ? body.tanks : 2,
    nozzles: typeof body.nozzles === 'number' ? body.nozzles : 6,
    attendants: typeof body.attendants === 'number' ? body.attendants : 3,
    today: typeof body.today === 'string' ? body.today : undefined,
  };
}

async function makeStation(
  db: DbClient,
  organizationId: string,
  ownerUserId: string,
  options: ReturnType<typeof optionsFromBody>,
) {
  await db.transaction(async (tx) => {
    await seedDemoStation(tx as never, { organizationId, ownerUserId, ...options });
  });
}

function demoEvent(
  eventType: string,
  organizationId: string,
  aggregateId: string,
  payload: Record<string, unknown>,
  stationId: string | null,
): DomainEvent<string, Record<string, unknown>> {
  const ids = new UuidGenerator();
  return createEvent(
    {
      eventType,
      aggregateType: 'organization',
      aggregateId,
      payload,
      organizationId,
      stationId,
      actorId: null,
      correlationId: ids.newId(),
      metadata: { grouping: { role: 'primary' }, source: 'platform-demo' },
    },
    { ids, clock: new SystemClock() },
  );
}

platformDemosRouter.post('/', async (c) => {
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  const options = optionsFromBody(body ?? {});
  const days = typeof body?.expiresInDays === 'number' ? body.expiresInDays : 2;
  if (options.stationName.length < 2 || options.town.length < 2 || ![2, 7, 30].includes(days)) {
    return c.json(
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Station name and town are required; expiry must be 2, 7 or 30 days',
        },
      },
      400,
    );
  }
  if (!options.tanks || !options.nozzles || !options.attendants)
    return c.json(
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Tank, nozzle and attendant counts must be positive integers',
        },
      },
      400,
    );
  const admin = adminFor(c);
  if (!admin)
    return c.json(
      {
        success: false,
        error: { code: 'CONFIG_ERROR', message: 'Auth provisioning is not configured' },
      },
      500,
    );
  const email =
    typeof body?.prospectEmail === 'string' ? body.prospectEmail.trim().toLowerCase() : '';
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return c.json(
      { success: false, error: { code: 'VALIDATION_ERROR', message: 'Prospect email is invalid' } },
      400,
    );
  }
  if (email) {
    const [existingOwner] = await c.var.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(ilike(schema.users.email, email))
      .limit(1);
    if (existingOwner) {
      return c.json(
        {
          success: false,
          error: {
            code: 'OWNER_ALREADY_EXISTS',
            message:
              'This email already has a PumpOS account. Use a new prospect email for the demo invite.',
          },
        },
        409,
      );
    }
  }
  const hasRealOwnerEmail = !!email;
  const organizationName = `${options.stationName} Demo`;
  const ownerEmail = email || `owner+${crypto.randomUUID()}@demo.pumpos.invalid`;
  let authUserId: string | undefined;
  let organizationId: string | undefined;
  let password: string | undefined;
  let provisioned = false;
  try {
    const ownerMetadata = {
      signup_intent: 'owner',
      organization_name: organizationName,
      full_name: 'Demo Owner',
      role: 'Owner',
    };
    if (hasRealOwnerEmail) {
      const invited = await admin.inviteUserByEmail(ownerEmail, {
        redirectTo: c.env.INVITE_REDIRECT_URL,
        data: ownerMetadata,
      });
      authUserId = invited.id;
      provisioned = true;
      await admin.updateAppMetadata(authUserId, {
        signup_intent: 'owner',
        organization_name: organizationName,
      });
    } else {
      password = `${crypto.randomUUID()}aA1!`;
      const created = await admin.createUser({
        email: ownerEmail,
        password,
        userMetadata: ownerMetadata,
        appMetadata: { signup_intent: 'owner' },
      });
      authUserId = created.id;
      provisioned = true;
    }
    const db = c.var.db;
    await new Promise((resolve) => setTimeout(resolve, 150));
    const [owner] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.authUserId, authUserId))
      .limit(1);
    if (!owner) throw new Error('Owner profile was not created by the auth provisioning trigger');
    organizationId = owner.organizationId;
    const expiresAt = new Date(Date.now() + days * 86_400_000);
    await db.transaction(async (tx) => {
      const transactionDb = tx as unknown as DbClient;
      await transactionDb
        .update(schema.organizations)
        .set({ isDemo: true, demoExpiresAt: expiresAt })
        .where(eq(schema.organizations.id, owner.organizationId));
      const seeded = await seedDemoStation(tx as never, {
        organizationId: owner.organizationId,
        ownerUserId: owner.id,
        ...options,
      });
      await appendDemoEvent(
        transactionDb,
        'DEMO_ORGANIZATION_CREATED',
        owner.organizationId,
        seeded.station.id,
        seeded.station.id,
        {
          stationName: seeded.station.name,
          expiresAt: expiresAt.toISOString(),
        },
      );
    });
    return c.json(
      {
        success: true,
        data: {
          organizationId: owner.organizationId,
          ownerEmail: owner.email,
          authUserId,
          ...(password ? { password } : {}),
          demoExpiresAt: expiresAt.toISOString(),
        },
      },
      201,
    );
  } catch (error) {
    if (organizationId) {
      await c.var.db
        .transaction(async (tx) => {
          const transactionDb = tx as unknown as DbClient;
          await clearDemoData(transactionDb, organizationId!, false);
          await transactionDb
            .delete(schema.organizations)
            .where(eq(schema.organizations.id, organizationId!));
        })
        .catch(() => undefined);
    }
    if (provisioned && authUserId) await admin.deleteUser(authUserId).catch(() => undefined);
    return c.json(
      {
        success: false,
        error: {
          code: 'DEMO_CREATE_FAILED',
          message: error instanceof Error ? error.message : 'Could not create demo',
        },
      },
      400,
    );
  }
});

platformDemosRouter.post('/:orgId/reset', async (c) => {
  const organizationId = c.req.param('orgId');
  const [org] = await c.var.db
    .select()
    .from(schema.organizations)
    .where(eq(schema.organizations.id, organizationId))
    .limit(1);
  if (!org?.isDemo)
    return c.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Demo organization not found' } },
      404,
    );
  const priorStations = await c.var.db
    .select({ name: schema.stations.name, address: schema.stations.address })
    .from(schema.stations)
    .where(eq(schema.stations.organizationId, organizationId))
    .limit(1);
  const resetOptions = {
    stationName: priorStations[0]?.name ?? 'Sample Fuels',
    town: priorStations[0]?.address ?? 'Thrissur',
    tanks: 2,
    nozzles: 6,
    attendants: 3,
  };
  const owner = await ownerFor(c.var.db, organizationId);
  if (!owner)
    return c.json(
      { success: false, error: { code: 'OWNER_NOT_FOUND', message: 'Demo owner was not found' } },
      409,
    );
  const admin = adminFor(c);
  let authUserId = owner.authUserId;
  if (!authUserId && admin) {
    const credential = `owner+${crypto.randomUUID()}@demo.pumpos.invalid`;
    const created = await admin.createUser({
      email: credential,
      password: `${crypto.randomUUID()}aA1!`,
      userMetadata: {
        signup_intent: 'owner',
        organization_name: org.name,
        full_name: owner.fullName,
        role: 'Owner',
      },
      appMetadata: { signup_intent: 'owner' },
    });
    authUserId = created.id;
    await c.var.db
      .update(schema.users)
      .set({ authUserId, email: credential, status: 'ACTIVE' })
      .where(eq(schema.users.id, owner.id));
  }
  await c.var.db.transaction(async (tx) => {
    const transactionDb = tx as unknown as DbClient;
    await clearDemoData(transactionDb, organizationId, true);
    await transactionDb
      .delete(schema.users)
      .where(and(eq(schema.users.organizationId, organizationId), ne(schema.users.role, 'Owner')));
    const seeded = await seedDemoStation(transactionDb as never, {
      organizationId,
      ownerUserId: owner.id,
      ...resetOptions,
    });
    await appendDemoEvent(
      transactionDb,
      'DEMO_ORGANIZATION_RESET',
      organizationId,
      seeded.station.id,
      seeded.station.id,
      {
        stationName: seeded.station.name,
      },
    );
  });
  return c.json({ success: true, data: { organizationId, reset: true } });
});

platformDemosRouter.post('/:orgId/extend', async (c) => {
  const organizationId = c.req.param('orgId');
  const body = (await c.req.json().catch(() => null)) as { expiresInDays?: unknown } | null;
  const days = body?.expiresInDays;
  if (typeof days !== 'number' || ![2, 7, 30].includes(days))
    return c.json(
      {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Expiry must be 2, 7 or 30 days' },
      },
      400,
    );
  const [org] = await c.var.db
    .update(schema.organizations)
    .set({ demoExpiresAt: new Date(Date.now() + days * 86_400_000) })
    .where(and(eq(schema.organizations.id, organizationId), eq(schema.organizations.isDemo, true)))
    .returning();
  if (!org)
    return c.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Demo organization not found' } },
      404,
    );
  await appendDemoEvent(
    c.var.db,
    'DEMO_ORGANIZATION_EXTENDED',
    organizationId,
    organizationId,
    null,
    { expiresAt: org.demoExpiresAt?.toISOString() ?? null },
  );
  return c.json({
    success: true,
    data: { organizationId, demoExpiresAt: org.demoExpiresAt?.toISOString() ?? null },
  });
});

platformDemosRouter.post('/:orgId/deactivate', async (c) => updateDemoActive(c, false));
platformDemosRouter.post('/:orgId/reactivate', async (c) => updateDemoActive(c, true));

async function updateDemoActive(c: any, active: boolean) {
  const organizationId = c.req.param('orgId');
  const [org] = await c.var.db
    .select()
    .from(schema.organizations)
    .where(and(eq(schema.organizations.id, organizationId), eq(schema.organizations.isDemo, true)))
    .limit(1);
  if (!org)
    return c.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Demo organization not found' } },
      404,
    );
  const owner = await ownerFor(c.var.db, organizationId);
  if (!owner)
    return c.json(
      { success: false, error: { code: 'OWNER_NOT_FOUND', message: 'Demo owner not found' } },
      409,
    );
  const admin = adminFor(c);
  if (owner.authUserId && admin) {
    if (active) await admin.unbanUser(owner.authUserId);
    else await admin.banUser(owner.authUserId);
  }
  await c.var.db
    .update(schema.users)
    .set({ status: active ? 'ACTIVE' : 'INACTIVE', updatedAt: new Date() })
    .where(eq(schema.users.id, owner.id));
  await c.var.db
    .update(schema.organizations)
    .set({ suspendedAt: active ? null : new Date() })
    .where(eq(schema.organizations.id, organizationId));
  await appendDemoEvent(
    c.var.db,
    active ? 'DEMO_ORGANIZATION_REACTIVATED' : 'DEMO_ORGANIZATION_DEACTIVATED',
    organizationId,
    organizationId,
    null,
    {},
  );
  return c.json({ success: true, data: { organizationId, active } });
}

platformDemosRouter.delete('/:orgId', async (c) => {
  const organizationId = c.req.param('orgId');
  const [org] = await c.var.db
    .select()
    .from(schema.organizations)
    .where(eq(schema.organizations.id, organizationId))
    .limit(1);
  if (!org?.isDemo)
    return c.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Demo organization not found' } },
      404,
    );
  const users = await c.var.db
    .select({ authUserId: schema.users.authUserId })
    .from(schema.users)
    .where(eq(schema.users.organizationId, organizationId));
  await c.var.db.transaction(async (tx) => {
    const transactionDb = tx as unknown as DbClient;
    await appendDemoEvent(
      transactionDb,
      'DEMO_ORGANIZATION_DELETED',
      organizationId,
      organizationId,
      null,
      {},
    );
    await clearDemoData(transactionDb, organizationId, false);
    await transactionDb
      .delete(schema.organizations)
      .where(eq(schema.organizations.id, organizationId));
  });
  const admin = adminFor(c);
  if (admin)
    await Promise.all(
      users.filter((user) => user.authUserId).map((user) => admin.deleteUser(user.authUserId!)),
    );
  return c.json({ success: true, data: { organizationId, deleted: true } });
});

export async function expireDemoOrganizations(
  db: DbClient,
  admin: SupabaseAdmin | null,
  now = new Date(),
) {
  const expired = await db
    .select({ id: schema.organizations.id, demoExpiresAt: schema.organizations.demoExpiresAt })
    .from(schema.organizations)
    .where(eq(schema.organizations.isDemo, true));
  for (const org of expired) {
    if (!org.demoExpiresAt || org.demoExpiresAt > now) continue;
    const [owner] = await db
      .select({ authUserId: schema.users.authUserId })
      .from(schema.users)
      .where(and(eq(schema.users.organizationId, org.id), eq(schema.users.role, 'Owner')))
      .limit(1);
    if (org.demoExpiresAt.getTime() < now.getTime() - 7 * 86_400_000) {
      const authUsers = await db
        .select({ authUserId: schema.users.authUserId })
        .from(schema.users)
        .where(eq(schema.users.organizationId, org.id));
      await db.transaction(async (tx) => {
        const transactionDb = tx as unknown as DbClient;
        await clearDemoData(transactionDb, org.id, false);
        await transactionDb.delete(schema.organizations).where(eq(schema.organizations.id, org.id));
      });
      if (admin)
        await Promise.all(
          authUsers
            .filter((user) => user.authUserId)
            .map((user) => admin.deleteUser(user.authUserId!)),
        );
      continue;
    }
    await db
      .update(schema.organizations)
      .set({ suspendedAt: now })
      .where(eq(schema.organizations.id, org.id));
    await db
      .update(schema.users)
      .set({ status: 'INACTIVE', updatedAt: now })
      .where(and(eq(schema.users.organizationId, org.id), eq(schema.users.role, 'Owner')));
    if (owner?.authUserId && admin) await admin.banUser(owner.authUserId);
    await appendDemoEvent(db, 'DEMO_ORGANIZATION_EXPIRED', org.id, org.id, null, {
      expiredAt: org.demoExpiresAt.toISOString(),
    });
  }
}
