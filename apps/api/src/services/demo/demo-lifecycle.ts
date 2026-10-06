import { and, eq, ilike, ne, sql } from 'drizzle-orm';
import { schema, seedDemoStation, type DbClient } from '@pump/db';
import { err, ok, SuspendOrganization, type CoreError, type Result } from '@pump/core';
import { buildPlatformContext } from '../../infra/context.js';
import { DrizzleOrganizationSubscriptionRepository } from '../../infra/repositories/organization-access.repo.js';
import { runInTransaction } from '../../infra/transaction.js';
import type { SupabaseAdmin } from '../../infra/supabase-admin.js';
import { seedDemoHistory } from './demo-history.js';

/** The Supabase admin calls the demo lifecycle needs (a port, for tests). */
export type DemoAuthAdmin = Pick<
  SupabaseAdmin,
  'createUser' | 'inviteUserByEmail' | 'updateAppMetadata' | 'banUser' | 'deleteUser'
>;

export interface DemoActor {
  email: string;
  subjectId: string | null;
}

export interface DemoSetup {
  stationName: string;
  town: string;
  tanks: number;
  nozzles: number;
  attendants: number;
}

/** Days after `demo_expires_at` before an expired demo is hard-deleted. */
export const DEMO_DELETE_GRACE_DAYS = 7;
const DAY_MS = 86_400_000;
const EXPIRY_ACTOR = { email: 'system:demo-expiry', subjectId: null };

const NOT_A_DEMO: CoreError = {
  code: 'NOT_A_DEMO_ORGANIZATION',
  message: 'This organization is not a demo.',
};

function failure(code: string, message: string): Result<never> {
  return err({ code, message });
}

/** Structured Worker log: the durable record of demo lifecycle actions (#368). */
export function logDemo(event: string, detail: Record<string, unknown>) {
  console.info(`[platform-demo] ${event}`, detail);
}

export function logDemoError(
  action: string,
  detail: { organizationId?: string; authUserId?: string },
  error: unknown,
) {
  console.error(`[platform-demo] ${action} failed`, {
    ...detail,
    detail: error instanceof Error ? error.message : String(error),
  });
}

/** Lock the organisation row and confirm it is still a demo. */
export async function lockDemoOrganization(tx: DbClient, organizationId: string) {
  const [organization] = await tx
    .select()
    .from(schema.organizations)
    .where(eq(schema.organizations.id, organizationId))
    .for('update')
    .limit(1);
  return organization?.isDemo ? organization : null;
}

const org = (organizationId: string) => sql`${organizationId}::uuid`;

/**
 * Delete every operational row of one organisation, children first. Rows on
 * tables without `organization_id` are reached through their parents
 * (shift, business day, customer, supplier, sale, purchase, handover).
 * Called by create-rollback, reset, delete and the expiry job.
 */
export async function clearDemoData(
  tx: DbClient,
  organizationId: string,
  options: { keepOwner: boolean },
) {
  const id = org(organizationId);
  const shiftsOf = sql`(select id from shifts where organization_id = ${id})`;
  const daysOf = sql`(select id from business_days where organization_id = ${id})`;
  const salesOf = sql`(select id from sales where shift_id in ${shiftsOf} or business_day_id in ${daysOf})`;
  const purchasesOf = sql`(select id from purchases where shift_id in ${shiftsOf} or business_day_id in ${daysOf} or supplier_id in (select id from suppliers where organization_id = ${id}))`;
  const statements = [
    sql`delete from handover_terminal_entries where organization_id = ${id} or handover_id in (select id from attendant_handovers where organization_id = ${id})`,
    sql`delete from attendant_handovers where organization_id = ${id}`,
    sql`delete from shift_summaries where shift_id in ${shiftsOf}`,
    sql`delete from nozzle_readings where shift_id in ${shiftsOf} or nozzle_id in (select id from nozzles where organization_id = ${id})`,
    sql`delete from shift_staff_assignments where shift_id in ${shiftsOf}`,
    sql`delete from shift_terminal_links where shift_id in ${shiftsOf}`,
    sql`delete from invoices where organization_id = ${id} or sale_id in ${salesOf}`,
    sql`delete from sale_items where sale_id in ${salesOf}`,
    sql`delete from sales where id in ${salesOf}`,
    sql`delete from purchase_items where purchase_id in ${purchasesOf}`,
    sql`delete from purchases where id in ${purchasesOf}`,
    sql`delete from customer_transactions where shift_id in ${shiftsOf} or business_day_id in ${daysOf} or customer_id in (select id from customers where organization_id = ${id})`,
    sql`delete from stock_variances where organization_id = ${id} or shift_id in ${shiftsOf} or business_day_id in ${daysOf}`,
    sql`delete from stock_movements where shift_id in ${shiftsOf} or business_day_id in ${daysOf} or tank_id in (select id from tanks where organization_id = ${id})`,
    sql`delete from supplier_transactions where organization_id = ${id} or supplier_id in (select id from suppliers where organization_id = ${id})`,
    sql`delete from customer_vehicles where organization_id = ${id} or customer_id in (select id from customers where organization_id = ${id})`,
    sql`delete from customer_discount_rules where organization_id = ${id} or customer_id in (select id from customers where organization_id = ${id})`,
    sql`delete from ledger_entries where organization_id = ${id}`,
    sql`delete from user_station_assignments where station_id in (select id from stations where organization_id = ${id}) or user_id in (select id from users where organization_id = ${id})`,
    sql`delete from events where organization_id = ${id}`,
    sql`delete from idempotency_keys where organization_id = ${id}`,
  ];
  for (const statement of statements) await tx.execute(statement);
  for (const table of [
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
    'customers',
    'suppliers',
    'shifts',
    'business_days',
    'products',
    'shift_templates',
    'stations',
    'organization_capability_grants',
    'organization_limit_overrides',
  ]) {
    await tx.execute(sql`delete from ${sql.identifier(table)} where organization_id = ${id}`);
  }
  await tx
    .delete(schema.users)
    .where(
      options.keepOwner
        ? and(eq(schema.users.organizationId, organizationId), ne(schema.users.role, 'Owner'))
        : eq(schema.users.organizationId, organizationId),
    );
}

/** Seed master data and the use-case-driven history for one demo station. */
export async function seedDemoOrganization(
  tx: DbClient,
  organizationId: string,
  ownerUserId: string,
  setup: DemoSetup,
  clock: { today?: string; now?: Date } = {},
) {
  const seeded = await seedDemoStation(tx, { organizationId, ownerUserId, ...setup });
  const history = await seedDemoHistory(tx, {
    organizationId,
    stationId: seeded.station.id,
    ...clock,
  });
  return { station: seeded.station, history };
}

/** Read the counts a demo was created with (stored on the station). */
export function storedDemoSetup(station: {
  name: string;
  address: string | null;
  settings: unknown;
}): DemoSetup {
  const settings = (station.settings ?? {}) as Record<string, unknown>;
  const stored = (settings.demo_setup ?? {}) as Record<string, unknown>;
  const count = (key: string, fallback: number) =>
    typeof stored[key] === 'number' ? stored[key] : fallback;
  return {
    stationName: station.name,
    town: station.address ?? 'Thrissur',
    tanks: count('tanks', 2),
    nozzles: count('nozzles', 6),
    attendants: count('attendants', 3),
  };
}

async function authUserIdsOf(db: DbClient, organizationId: string) {
  const rows = await db
    .select({ authUserId: schema.users.authUserId })
    .from(schema.users)
    .where(eq(schema.users.organizationId, organizationId));
  return rows.map((row) => row.authUserId).filter((value): value is string => !!value);
}

/** Delete logins after the database work committed; failures are logged, not thrown. */
async function deleteLogins(
  admin: DemoAuthAdmin | null,
  organizationId: string,
  authUserIds: string[],
) {
  if (!admin) return;
  const results = await Promise.allSettled(authUserIds.map((id) => admin.deleteUser(id)));
  results.forEach((result, index) => {
    if (result.status === 'rejected')
      logDemoError(
        'delete login',
        { organizationId, authUserId: authUserIds[index] },
        result.reason,
      );
  });
}

/** Lock, re-check `is_demo`, clear every row and delete the organisation. */
async function deleteDemoRows(tx: DbClient, organizationId: string): Promise<Result<true>> {
  if (!(await lockDemoOrganization(tx, organizationId))) return err(NOT_A_DEMO);
  await clearDemoData(tx, organizationId, { keepOwner: false });
  const deleted = await tx
    .delete(schema.organizations)
    .where(and(eq(schema.organizations.id, organizationId), eq(schema.organizations.isDemo, true)))
    .returning({ id: schema.organizations.id });
  return deleted.length === 1 ? ok(true) : err(NOT_A_DEMO);
}

export interface CreateDemoInput extends DemoSetup {
  prospectEmail?: string;
  expiresInDays: number;
}

export interface CreatedDemo {
  organizationId: string;
  ownerEmail: string;
  authUserId: string;
  password?: string;
  demoExpiresAt: string;
}

const OWNER_PROFILE_ATTEMPTS = 5;

/** Bounded poll for the owner profile the auth trigger creates. */
export async function waitForOwnerProfile(db: DbClient, authUserId: string) {
  for (let attempt = 0; attempt < OWNER_PROFILE_ATTEMPTS; attempt += 1) {
    const [owner] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.authUserId, authUserId))
      .limit(1);
    if (owner) return owner;
    await new Promise((resolve) => setTimeout(resolve, 50 * 2 ** attempt));
  }
  return null;
}

/**
 * Create a demo organisation with its Owner and station.
 *
 * - Prospect email: the organisation, owner profile and station commit first;
 *   only then is the invite sent. A failed invite deletes the rows.
 * - No email: the auth user is created first (its trigger provisions the
 *   organisation and owner profile); any later failure deletes the rows and
 *   the auth user.
 */
export async function createDemo(
  db: DbClient,
  admin: DemoAuthAdmin,
  input: CreateDemoInput,
  actor: DemoActor,
  options: { inviteRedirectUrl?: string; now?: Date } = {},
): Promise<Result<CreatedDemo>> {
  const { prospectEmail, expiresInDays, ...setup } = input;
  const now = options.now ?? new Date();
  const expiresAt = new Date(now.getTime() + expiresInDays * DAY_MS);
  const organizationName = `${setup.stationName} Demo`;
  const ownerMetadata = {
    signup_intent: 'owner',
    organization_name: organizationName,
    full_name: 'Demo Owner',
    role: 'Owner',
  };

  if (prospectEmail) {
    const [existing] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(ilike(schema.users.email, prospectEmail))
      .limit(1);
    if (existing)
      return failure(
        'OWNER_ALREADY_EXISTS',
        'This email already has a PumpOS account. Use a new prospect email for the demo invite.',
      );
  }

  let organizationId: string | undefined;
  let authUserId: string | undefined;
  try {
    if (prospectEmail) {
      const seeded = await runInTransaction(db, async (tx) => {
        const [organization] = await tx
          .insert(schema.organizations)
          .values({ name: organizationName, isDemo: true, demoExpiresAt: expiresAt })
          .returning();
        const [owner] = await tx
          .insert(schema.users)
          .values({
            organizationId: organization.id,
            fullName: 'Demo Owner',
            email: prospectEmail,
            role: 'Owner',
            status: 'ACTIVE',
          })
          .returning();
        await seedDemoOrganization(tx, organization.id, owner.id, setup, { now });
        return ok({ organizationId: organization.id, ownerId: owner.id });
      });
      if (!seeded.success) return seeded;
      organizationId = seeded.data.organizationId;
      try {
        const invited = await admin.inviteUserByEmail(prospectEmail, {
          redirectTo: options.inviteRedirectUrl,
          data: { ...ownerMetadata, organization_id: organizationId },
        });
        authUserId = invited.id;
        await admin.updateAppMetadata(authUserId, {
          signup_intent: 'owner',
          organization_id: organizationId,
        });
        await db
          .update(schema.users)
          .set({ authUserId })
          .where(eq(schema.users.id, seeded.data.ownerId));
      } catch (inviteError) {
        logDemoError('invite owner', { organizationId, authUserId }, inviteError);
        await rollbackCreate(db, admin, organizationId, authUserId);
        return failure('DEMO_INVITE_FAILED', 'Could not invite the demo owner.');
      }
      logDemo('DEMO_ORGANIZATION_CREATED', { organizationId, platformAdmin: actor.email });
      return ok({
        organizationId,
        ownerEmail: prospectEmail,
        authUserId,
        demoExpiresAt: expiresAt.toISOString(),
      });
    }

    const ownerEmail = `owner+${crypto.randomUUID()}@demo.pumpos.invalid`;
    const password = `${crypto.randomUUID()}aA1!`;
    const created = await admin.createUser({
      email: ownerEmail,
      password,
      userMetadata: ownerMetadata,
      appMetadata: { signup_intent: 'owner' },
    });
    authUserId = created.id;
    const owner = await waitForOwnerProfile(db, authUserId);
    if (!owner) throw new Error('Owner profile was not created by the auth provisioning trigger');
    organizationId = owner.organizationId;
    const seeded = await runInTransaction(db, async (tx) => {
      await tx
        .update(schema.organizations)
        .set({ isDemo: true, demoExpiresAt: expiresAt })
        .where(eq(schema.organizations.id, owner.organizationId));
      await seedDemoOrganization(tx, owner.organizationId, owner.id, setup, { now });
      return ok(true);
    });
    if (!seeded.success) throw new Error(seeded.error.message);
    logDemo('DEMO_ORGANIZATION_CREATED', { organizationId, platformAdmin: actor.email });
    return ok({
      organizationId,
      ownerEmail: owner.email ?? ownerEmail,
      authUserId,
      password,
      demoExpiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    logDemoError('create', { organizationId, authUserId }, error);
    await rollbackCreate(db, admin, organizationId, authUserId);
    return failure('DEMO_CREATE_FAILED', 'Could not create the demo organization.');
  }
}

async function rollbackCreate(
  db: DbClient,
  admin: DemoAuthAdmin,
  organizationId: string | undefined,
  authUserId: string | undefined,
) {
  if (organizationId) {
    try {
      const removed = await runInTransaction(db, (tx) => deleteDemoRows(tx, organizationId));
      // The auth trigger made the org; if it never became a demo, remove it too.
      if (!removed.success)
        await runInTransaction(db, async (tx) => {
          await clearDemoData(tx, organizationId, { keepOwner: false });
          await tx.delete(schema.organizations).where(eq(schema.organizations.id, organizationId));
          return ok(true);
        });
    } catch (rollbackError) {
      logDemoError('create rollback', { organizationId, authUserId }, rollbackError);
    }
  }
  if (authUserId) {
    try {
      await admin.deleteUser(authUserId);
    } catch (cleanupError) {
      logDemoError('create rollback login', { organizationId, authUserId }, cleanupError);
    }
  }
}

/**
 * Rebuild a demo with the counts it was created with. The Owner (and their
 * login) is kept; staff are record-only users with no logins, so reset never
 * creates or removes a login.
 */
export async function resetDemo(
  db: DbClient,
  organizationId: string,
  actor: DemoActor,
  options: { now?: Date } = {},
): Promise<Result<{ organizationId: string; reset: true }>> {
  const result = await runInTransaction(db, async (tx) => {
    if (!(await lockDemoOrganization(tx, organizationId))) return err(NOT_A_DEMO);
    const [owner] = await tx
      .select()
      .from(schema.users)
      .where(and(eq(schema.users.organizationId, organizationId), eq(schema.users.role, 'Owner')))
      .limit(1);
    if (!owner) return failure('OWNER_NOT_FOUND', 'Demo owner was not found.');
    const [station] = await tx
      .select()
      .from(schema.stations)
      .where(eq(schema.stations.organizationId, organizationId))
      .limit(1);
    const setup = station
      ? storedDemoSetup(station)
      : { stationName: 'Sample Fuels', town: 'Thrissur', tanks: 2, nozzles: 6, attendants: 3 };
    await clearDemoData(tx, organizationId, { keepOwner: true });
    await seedDemoOrganization(tx, organizationId, owner.id, setup, { now: options.now });
    return ok({ organizationId, reset: true as const });
  });
  if (result.success)
    logDemo('DEMO_ORGANIZATION_RESET', { organizationId, platformAdmin: actor.email });
  return result;
}

export async function extendDemo(
  db: DbClient,
  organizationId: string,
  expiresInDays: number,
  actor: DemoActor,
  now = new Date(),
): Promise<Result<{ organizationId: string; demoExpiresAt: string }>> {
  const expiresAt = new Date(now.getTime() + expiresInDays * DAY_MS);
  const result = await runInTransaction(db, async (tx) => {
    if (!(await lockDemoOrganization(tx, organizationId))) return err(NOT_A_DEMO);
    await tx
      .update(schema.organizations)
      .set({ demoExpiresAt: expiresAt, updatedAt: now })
      .where(
        and(eq(schema.organizations.id, organizationId), eq(schema.organizations.isDemo, true)),
      );
    return ok({ organizationId, demoExpiresAt: expiresAt.toISOString() });
  });
  if (result.success)
    logDemo('DEMO_ORGANIZATION_EXTENDED', {
      organizationId,
      demoExpiresAt: expiresAt.toISOString(),
      platformAdmin: actor.email,
    });
  return result;
}

/** Hard-delete a demo. Database first; logins are removed after commit. */
export async function deleteDemo(
  db: DbClient,
  admin: DemoAuthAdmin | null,
  organizationId: string,
  actor: DemoActor | { system: string },
): Promise<Result<{ organizationId: string; deleted: true }>> {
  const authUserIds = await authUserIdsOf(db, organizationId);
  const result = await runInTransaction(db, (tx) => deleteDemoRows(tx, organizationId));
  if (!result.success) return result;
  // The organisation's events are gone with it; this log line is the record.
  logDemo('DEMO_ORGANIZATION_DELETED', {
    organizationId,
    ...('system' in actor
      ? { actor: actor.system }
      : { platformAdmin: actor.email, subjectId: actor.subjectId }),
  });
  await deleteLogins(admin, organizationId, authUserIds);
  return ok({ organizationId, deleted: true as const });
}

/**
 * Nightly job: deactivate demos past `demo_expires_at`, hard-delete those
 * expired more than {@link DEMO_DELETE_GRACE_DAYS} days. Each organisation is
 * isolated: a failure is logged and the job moves on.
 */
export async function expireDemoOrganizations(
  db: DbClient,
  admin: DemoAuthAdmin | null,
  now = new Date(),
) {
  const demos = await db
    .select({
      id: schema.organizations.id,
      demoExpiresAt: schema.organizations.demoExpiresAt,
      suspendedAt: schema.organizations.suspendedAt,
    })
    .from(schema.organizations)
    .where(eq(schema.organizations.isDemo, true));
  const summary = { deactivated: 0, deleted: 0, failed: 0 };
  for (const demo of demos) {
    if (!demo.demoExpiresAt || demo.demoExpiresAt > now) continue;
    try {
      if (demo.demoExpiresAt.getTime() < now.getTime() - DEMO_DELETE_GRACE_DAYS * DAY_MS) {
        const deleted = await deleteDemo(db, admin, demo.id, { system: 'demo-expiry' });
        if (deleted.success) summary.deleted += 1;
        continue;
      }
      if (demo.suspendedAt) continue;
      const authUserIds = await authUserIdsOf(db, demo.id);
      // Same effect as the platform "Deactivate" owner action, so the
      // existing "Reactivate" action restores it.
      const deactivated = await runInTransaction(db, async (tx, events) => {
        const locked = await lockDemoOrganization(tx, demo.id);
        if (!locked || !locked.demoExpiresAt || locked.demoExpiresAt > now) return err(NOT_A_DEMO);
        const suspended = await new SuspendOrganization({
          subscriptions: new DrizzleOrganizationSubscriptionRepository(tx),
          events,
        }).execute(
          { reason: 'demo expired', actor: EXPIRY_ACTOR },
          buildPlatformContext(EXPIRY_ACTOR, demo.id),
        );
        if (!suspended.success) return suspended;
        await tx
          .update(schema.users)
          .set({ status: 'INACTIVE', updatedAt: now })
          .where(and(eq(schema.users.organizationId, demo.id), eq(schema.users.role, 'Owner')));
        return ok(true);
      });
      if (!deactivated.success) continue;
      summary.deactivated += 1;
      logDemo('DEMO_ORGANIZATION_EXPIRED', {
        organizationId: demo.id,
        expiredAt: demo.demoExpiresAt.toISOString(),
      });
      if (admin) {
        const bans = await Promise.allSettled(authUserIds.map((id) => admin.banUser(id)));
        bans.forEach((ban, index) => {
          if (ban.status === 'rejected')
            logDemoError(
              'ban login',
              { organizationId: demo.id, authUserId: authUserIds[index] },
              ban.reason,
            );
        });
      }
    } catch (error) {
      summary.failed += 1;
      logDemoError('expiry', { organizationId: demo.id }, error);
    }
  }
  return summary;
}
