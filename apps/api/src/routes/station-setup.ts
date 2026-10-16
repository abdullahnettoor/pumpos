import { Hono } from 'hono';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { schema, DbClient } from '@pump/db';
import {
  can,
  DECANTATION_SETTINGS_KEY_SET,
  DECANTATION_SETTINGS_KEYS,
  decantationSettingsSchema,
  finalizeOnboardingSchema,
  fuelPriceSchema,
  canActOnTeamMember,
  canWriteStationSetup,
  isAuthorizedForStation,
  normalizeIndianMobile,
  OnboardingDraft,
  phoneToAuthEmail,
  resolveDecantationSettings,
  Role,
  stationSchema,
  TANK_LEVEL_SETTINGS_KEY,
  tankLevelsChanged,
  userSchema,
  userUpdateSchema,
} from '@pump/shared';
import { z } from 'zod';
import { validateJson } from '../utils/validator.js';
import {
  CreateStation,
  UpdateStation,
  CreateUser,
  UpdateUser,
  ResetUserPassword,
  SetUserStatus,
  RecordFuelPrice,
  CreateTank,
  UpdateTank,
  DeleteTank,
  CreateDispenser,
  CreateDispenserWithNozzles,
  UpdateDispenser,
  DeleteDispenser,
  CreateNozzle,
  UpdateNozzle,
  DeleteNozzle,
  CreateShiftTemplate,
  CreateShiftTemplates,
  UpdateShiftTemplate,
  DeleteShiftTemplate,
  FinalizeStationOnboarding,
  BusinessEvents,
  eventFromContext,
  type Result,
} from '@pump/core';
import { buildContext } from '../infra/context.js';
import {
  listCurrentFuelPrices,
  listFuelPriceHistory,
} from '../infra/repositories/fuel-price-queries.js';
import type { AuthenticatedPrincipal } from '../infra/authenticated-principal.js';
import { createDispatcher } from '../infra/events.js';
import { runInTransaction } from '../infra/transaction.js';
import { SupabaseAdmin } from '../infra/supabase-admin.js';
import { rateLimit } from '../infra/rate-limit.js';
import { DrizzleOnboardingProvisioner } from '../infra/onboarding-provisioner.js';
import { DrizzleProductRepository } from '../infra/repositories/product.repo.js';
import { DrizzleStationCapacityPort } from '../infra/repositories/organization-access.repo.js';
import { sendResult } from '../infra/send-result.js';
import {
  loadStationDecantationSettings,
  stationNotFound,
  stationExistsInOrg,
} from '../infra/station-clock.js';
import { writePolicyGuard } from '../infra/write-policy-guard.js';
import {
  DrizzleStationRepository,
  DrizzleUserRepository,
  DrizzleFuelPriceRepository,
  DrizzleTankRepository,
  DrizzleDispenserRepository,
  DrizzleNozzleRepository,
  DrizzleShiftTemplateRepository,
} from '../infra/repositories/setup-repositories.js';

type Bindings = {
  SUPABASE_URL?: string;
  SUPABASE_SECRET_KEY?: string;
};

type Variables = {
  db: DbClient;
  user: AuthenticatedPrincipal;
};

export const stationSetupRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// ----------------------------------------------------
// Helper Checkers
// ----------------------------------------------------
function checkWriteAccess(c: any, stationId?: string | null): boolean {
  return canWriteStationSetup(c.var.user, stationId);
}

/**
 * Org-scoped station existence check (#235): a stationId naming another
 * tenant's station must be indistinguishable from a missing one. Every route
 * that anchors a record to a caller-supplied stationId must pass this before
 * writing — `checkWriteAccess` alone lets an Owner name ANY stationId.
 */
async function stationInOrg(
  c: { var: { db: DbClient; user: AuthenticatedPrincipal } },
  stationId: string | null | undefined,
): Promise<boolean> {
  if (!stationId) return false;
  return stationExistsInOrg(c.var.db, c.var.user.organizationId, stationId);
}

// Onboarding draft validation + multi-aggregate provisioning now live in the
// core FinalizeStationOnboarding use-case (+ DrizzleOnboardingProvisioner adapter).

// ----------------------------------------------------
// Stations CRUD
// ----------------------------------------------------

// GET /api/setup/stations
stationSetupRouter.get('/stations', async (c) => {
  const user = c.var.user;
  const repo = new DrizzleStationRepository(c.var.db);
  const all = await repo.listByOrganization(user.organizationId);
  const visible = all.filter((s) =>
    isAuthorizedForStation(user, { organizationId: user.organizationId, stationId: s.id }),
  );
  const data = visible.map((station) => ({
    ...station,
    settings: {
      ...station.settings,
      ...resolveDecantationSettings(station.settings),
    },
  }));
  return c.json({
    success: true,
    data,
  });
});

// GET /api/setup/stations/:id/decantation-settings
stationSetupRouter.get('/stations/:id/decantation-settings', async (c) => {
  const stationId = c.req.param('id');
  if (
    !isAuthorizedForStation(c.var.user, { organizationId: c.var.user.organizationId, stationId })
  ) {
    return c.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'No access to this station' } },
      403,
    );
  }
  const settings = await loadStationDecantationSettings(
    c.var.db,
    c.var.user.organizationId,
    stationId,
  );
  if (!settings) return stationNotFound(c);
  return c.json({ success: true, data: settings });
});

// POST /api/setup/stations
stationSetupRouter.post(
  '/stations',
  writePolicyGuard('POST /setup/stations'),
  validateJson(stationSchema),
  async (c) => {
    const user = c.var.user;
    if (!can(user, 'station.create')) {
      return c.json(
        {
          success: false,
          error: { code: 'FORBIDDEN', message: 'Only Owners can create stations' },
        },
        403,
      );
    }
    const body = c.req.valid('json');
    // Creating a Station consumes `station_count`, so this path takes the same
    // guard and the same lock as onboarding finalization — otherwise the Limit
    // is bypassable by choosing the other endpoint.
    const result = await runInTransaction(c.var.db, (tx, events) =>
      new CreateStation({
        repository: new DrizzleStationRepository(tx),
        capacity: new DrizzleStationCapacityPort(tx),
        events,
      }).execute(body, buildContext(user)),
    );
    return sendResult(c, result);
  },
);

// PUT /api/setup/stations/:id
stationSetupRouter.put(
  '/stations/:id',
  writePolicyGuard('PUT /setup/stations/:id'),
  validateJson(stationSchema.partial()),
  async (c) => {
    const user = c.var.user;
    const stationId = c.req.param('id');
    if (!checkWriteAccess(c, stationId)) {
      return c.json(
        {
          success: false,
          error: { code: 'FORBIDDEN', message: 'Insufficient write permissions for this station' },
        },
        403,
      );
    }
    const body = c.req.valid('json');
    const submittedSettings = body.settings as Record<string, unknown> | undefined;
    const updatesDecantationSettings =
      !!submittedSettings &&
      Object.keys(submittedSettings).some((key) => DECANTATION_SETTINGS_KEY_SET.has(key));
    if (updatesDecantationSettings) {
      if (!can(user, 'station.manage')) {
        return c.json(
          {
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'Only an Owner or Manager can change Decantation settings',
            },
          },
          403,
        );
      }
      const decantationValues = Object.fromEntries(
        DECANTATION_SETTINGS_KEYS.filter((key) => key in submittedSettings).map((key) => [
          key,
          submittedSettings[key],
        ]),
      );
      const parsed = decantationSettingsSchema.safeParse(decantationValues);
      if (!parsed.success) {
        return c.json(
          {
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'Invalid Decantation settings' },
          },
          400,
        );
      }
    }
    // Report templates decide what prints for everyone (#332): only Owner and
    // Manager may change `settings.report_config`. Write access already implies
    // one of those roles today; this keeps the rule if write access widens.
    if (
      body.settings &&
      'report_config' in (body.settings as Record<string, unknown>) &&
      !can(user, 'station.reportTemplates')
    ) {
      return c.json(
        {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Only an Owner or Manager can change report templates',
          },
        },
        403,
      );
    }
    // Tank-level thresholds (#520) colour every tank on every screen: Owner and
    // Manager only, and — like the UpdateStation use-case — only an actual
    // change is refused, so re-saving other settings that echo the stored
    // thresholds back (keys reordered by JSONB) passes. Answers early at the edge.
    if (
      submittedSettings &&
      TANK_LEVEL_SETTINGS_KEY in submittedSettings &&
      !can(user, 'station.tankLevels')
    ) {
      const existing = await new DrizzleStationRepository(c.var.db).findById(stationId);
      const stored =
        existing && existing.organizationId === user.organizationId
          ? existing.settings[TANK_LEVEL_SETTINGS_KEY]
          : undefined;
      if (tankLevelsChanged(stored, submittedSettings[TANK_LEVEL_SETTINGS_KEY])) {
        return c.json(
          {
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'Only an Owner or Manager can change tank levels',
            },
          },
          403,
        );
      }
    }
    const result = await runInTransaction(c.var.db, (tx, events) =>
      new UpdateStation({
        repository: new DrizzleStationRepository(tx),
        events,
      }).execute({ ...body, id: stationId }, buildContext(user)),
    );
    return sendResult(c, result);
  },
);

// ----------------------------------------------------
// Products are managed by the core-backed products router (routes/products.ts).
// ----------------------------------------------------

// ----------------------------------------------------
// Tanks CRUD
// ----------------------------------------------------

stationSetupRouter.get('/tanks', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  const stationId = c.req.query('stationId');

  if (!stationId) {
    return c.json(
      {
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Missing stationId query parameter' },
      },
      400,
    );
  }

  if (!isAuthorizedForStation(user, { organizationId: user.organizationId, stationId })) {
    return c.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'No access to this station' } },
      403,
    );
  }

  const list = await db
    .select()
    .from(schema.tanks)
    .where(
      and(
        eq(schema.tanks.stationId, stationId),
        eq(schema.tanks.organizationId, user.organizationId),
        eq(schema.tanks.status, 'ACTIVE'),
      ),
    );

  return c.json({ success: true, data: list });
});

stationSetupRouter.post('/tanks', writePolicyGuard('POST /setup/tanks'), async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => ({}));
  if (!checkWriteAccess(c, body.stationId) || !can(user, 'station.infrastructure')) {
    return c.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Insufficient write permissions' } },
      403,
    );
  }
  if (!(await stationInOrg(c, body.stationId))) return stationNotFound(c);
  const db = c.var.db;
  const useCase = new CreateTank({
    repository: new DrizzleTankRepository(db),
    events: createDispatcher(db),
  });
  const result = await useCase.execute(body, buildContext(user, { stationId: body.stationId }));
  return sendResult(c, result);
});

// ----------------------------------------------------
// Dispensers CRUD
// ----------------------------------------------------

stationSetupRouter.get('/dispensers', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  const stationId = c.req.query('stationId');

  if (!stationId) {
    return c.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'Missing stationId' } },
      400,
    );
  }

  const list = await db
    .select()
    .from(schema.dispenserUnits)
    .where(
      and(
        eq(schema.dispenserUnits.stationId, stationId),
        eq(schema.dispenserUnits.organizationId, user.organizationId),
      ),
    );

  return c.json({ success: true, data: list });
});

stationSetupRouter.post('/dispensers', writePolicyGuard('POST /setup/dispensers'), async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => ({}));
  if (!checkWriteAccess(c, body.stationId) || !can(user, 'station.infrastructure')) {
    return c.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Insufficient write permissions' } },
      403,
    );
  }
  if (!(await stationInOrg(c, body.stationId))) return stationNotFound(c);
  const db = c.var.db;
  const useCase = new CreateDispenser({
    repository: new DrizzleDispenserRepository(db),
    events: createDispatcher(db),
  });
  const result = await useCase.execute(body, buildContext(user, { stationId: body.stationId }));
  return sendResult(c, result);
});

/**
 * Ids the dispenser-with-nozzles body names, checked at the edge so a
 * malformed one answers VALIDATION_ERROR instead of reaching the driver. The
 * rest of the command is validated by the use-case.
 */
const dispenserWithNozzlesIds = z
  .object({
    stationId: z.string().uuid(),
    nozzles: z
      .array(z.object({ tankId: z.string().uuid(), productId: z.string().uuid() }).passthrough())
      .default([]),
  })
  .passthrough();

/**
 * Create a dispenser and its nozzles in one request (#591): one use-case, one
 * transaction, one Idempotency-Key. A refused nozzle leaves no dispenser, and a
 * replayed key answers with the first result instead of a second dispenser.
 * `POST /dispensers` and `POST /nozzles` stay for adding one later.
 */
stationSetupRouter.post(
  '/dispensers/with-nozzles',
  writePolicyGuard('POST /setup/dispensers/with-nozzles'),
  validateJson(dispenserWithNozzlesIds),
  async (c) => {
    const user = c.var.user;
    const body = c.req.valid('json');
    if (!checkWriteAccess(c, body.stationId) || !can(user, 'station.infrastructure')) {
      return c.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Insufficient write permissions' } },
        403,
      );
    }
    if (!(await stationInOrg(c, body.stationId))) return stationNotFound(c);
    const db = c.var.db;
    const result = await runInTransaction(db, (tx, events) =>
      new CreateDispenserWithNozzles({
        dispensers: new DrizzleDispenserRepository(tx),
        nozzles: new DrizzleNozzleRepository(tx),
        tanks: new DrizzleTankRepository(tx),
        products: new DrizzleProductRepository(tx),
        events,
      }).execute(body, buildContext(user, { stationId: body.stationId })),
    );
    return sendResult(c, result);
  },
);

// ----------------------------------------------------
// Nozzles CRUD
// ----------------------------------------------------

stationSetupRouter.get('/nozzles', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  const stationId = c.req.query('stationId');

  if (!stationId) {
    return c.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'Missing stationId' } },
      400,
    );
  }

  const list = await db
    .select()
    .from(schema.nozzles)
    .where(
      and(
        eq(schema.nozzles.stationId, stationId),
        eq(schema.nozzles.organizationId, user.organizationId),
      ),
    );

  return c.json({ success: true, data: list });
});

stationSetupRouter.post('/nozzles', writePolicyGuard('POST /setup/nozzles'), async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => ({}));
  if (!checkWriteAccess(c, body.stationId) || !can(user, 'station.infrastructure')) {
    return c.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Insufficient write permissions' } },
      403,
    );
  }
  if (!(await stationInOrg(c, body.stationId))) return stationNotFound(c);
  const db = c.var.db;
  const result = await runInTransaction(db, (tx, events) =>
    new CreateNozzle({
      repository: new DrizzleNozzleRepository(tx),
      tanks: new DrizzleTankRepository(tx),
      products: new DrizzleProductRepository(tx),
      dispensers: new DrizzleDispenserRepository(tx),
      events,
    }).execute(body, buildContext(user, { stationId: body.stationId })),
  );
  return sendResult(c, result);
});

// ----------------------------------------------------
// Shift Templates CRUD
// ----------------------------------------------------

stationSetupRouter.get('/shift-templates', async (c) => {
  const db = c.var.db;
  const user = c.var.user;

  const list = await db
    .select()
    .from(schema.shiftTemplates)
    .where(eq(schema.shiftTemplates.organizationId, user.organizationId));

  return c.json({ success: true, data: list });
});

stationSetupRouter.post(
  '/shift-templates',
  writePolicyGuard('POST /setup/shift-templates'),
  async (c) => {
    const user = c.var.user;
    if (!can(user, 'station.manage')) {
      return c.json(
        {
          success: false,
          error: { code: 'FORBIDDEN', message: 'Only Owners/Managers can manage templates' },
        },
        403,
      );
    }
    const body = await c.req.json().catch(() => ({}));
    const db = c.var.db;
    const useCase = new CreateShiftTemplate({
      repository: new DrizzleShiftTemplateRepository(db),
      events: createDispatcher(db),
    });
    const result = await useCase.execute(body, buildContext(user));
    return sendResult(c, result);
  },
);

/**
 * Create several shift templates in one request (#591), e.g. the three-shift
 * pre-fill: all or nothing in one transaction under one Idempotency-Key.
 */
stationSetupRouter.post(
  '/shift-templates/batch',
  writePolicyGuard('POST /setup/shift-templates/batch'),
  async (c) => {
    const user = c.var.user;
    if (!can(user, 'station.manage')) {
      return c.json(
        {
          success: false,
          error: { code: 'FORBIDDEN', message: 'Only Owners/Managers can manage templates' },
        },
        403,
      );
    }
    const body = await c.req.json().catch(() => ({}));
    const result = await runInTransaction(c.var.db, (tx, events) =>
      new CreateShiftTemplates({
        repository: new DrizzleShiftTemplateRepository(tx),
        events,
      }).execute(body, buildContext(user)),
    );
    return sendResult(c, result);
  },
);

// ----------------------------------------------------
// User Management & Assignments
// ----------------------------------------------------

stationSetupRouter.get('/users', async (c) => {
  const user = c.var.user;
  const repo = new DrizzleUserRepository(c.var.db);
  const data = await repo.listWithAssignments(user.organizationId);
  // Never expose auth linkage ids to clients; they only need "has a login".
  const sanitized = data.map(({ authUserId, ...rest }) => ({ ...rest, hasLogin: !!authUserId }));
  return c.json({ success: true, data: sanitized });
});

// Resolve the Supabase admin adapter or return null when secrets are absent.
function getSupabaseAdmin(c: any): SupabaseAdmin | null {
  const url = c.env?.SUPABASE_URL;
  const key = c.env?.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return new SupabaseAdmin({ url, secretKey: key });
}

// Owner = full; Manager = Staff/Attendant on own stations only (whose-data rule).
function canActOnTarget(
  actor: { role: Role; assignedStationIds: string[] },
  targetRole: Role,
  targetStationIds: string[] = [],
): boolean {
  return canActOnTeamMember(
    { role: actor.role, stationIds: actor.assignedStationIds },
    targetRole,
    targetStationIds,
  );
}

/** Current station assignments of a target user (for authorization). */
async function loadTargetStationIds(db: DbClient, userId: string): Promise<string[]> {
  const rows = await db
    .select({ stationId: schema.userStationAssignments.stationId })
    .from(schema.userStationAssignments)
    .where(eq(schema.userStationAssignments.userId, userId));
  return rows.map((r) => r.stationId);
}

stationSetupRouter.post(
  '/users',
  writePolicyGuard('POST /setup/users'),
  rateLimit({ scope: 'users-write', max: 30, windowMs: 60_000 }),
  validateJson(userSchema, 'BAD_REQUEST'),
  async (c) => {
    const user = c.var.user;
    if (!can(user, 'team.manage')) {
      return c.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Not allowed to manage users' } },
        403,
      );
    }
    const body = c.req.valid('json');
    const targetRole: Role = body.role ?? 'Staff';
    if (!canActOnTarget(user, targetRole, body.stationIds ?? [])) {
      return c.json(
        {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Managers may only add Staff/Attendant on their own stations',
          },
        },
        403,
      );
    }

    const db = c.var.db;
    const wantsLogin = !!body.enableAppAccess;

    // Compute identity: an email identity uses the real email; a phone identity
    // uses a synthetic handle. The real phone is always normalized + stored.
    const rawEmail: string | null =
      body.email && String(body.email).trim() !== ''
        ? String(body.email).trim().toLowerCase()
        : null;
    // The request schema already refused an invalid mobile (#300), so this is
    // the single stored spelling, +91XXXXXXXXXX, or null when blank.
    const normalizedPhone = normalizeIndianMobile(body.phone);
    let authUserId: string | null = null;

    if (wantsLogin) {
      const admin = getSupabaseAdmin(c);
      if (!admin) {
        return c.json(
          {
            success: false,
            error: {
              code: 'CONFIG_ERROR',
              message: 'Auth provisioning is not configured on the server',
            },
          },
          500,
        );
      }
      // Prefer email identity when present; otherwise derive the phone handle.
      const authEmail = rawEmail ?? phoneToAuthEmail(normalizedPhone);
      if (!authEmail || !body.password) {
        return c.json(
          {
            success: false,
            error: {
              code: 'BAD_REQUEST',
              message: 'An email or phone plus a password are required for app access',
            },
          },
          400,
        );
      }
      try {
        const created = await admin.createUser({
          email: authEmail,
          password: String(body.password),
        });
        authUserId = created.id;
      } catch (e: any) {
        const status = e?.status === 422 ? 409 : 400;
        return c.json(
          {
            success: false,
            error: {
              code: 'AUTH_PROVISION_FAILED',
              message: e?.message ?? 'Could not create login account',
            },
          },
          status,
        );
      }
    }

    const useCase = new CreateUser({
      repository: new DrizzleUserRepository(db),
      events: createDispatcher(db),
    });
    const result = await useCase.execute(
      {
        fullName: body.fullName,
        // Phone-identity accounts keep users.email null (handle is synthetic).
        email: rawEmail,
        phone: normalizedPhone,
        role: targetRole,
        status: body.status ?? 'ACTIVE',
        stationIds: body.stationIds,
        authUserId,
      },
      buildContext(user),
    );
    return sendResult(c, result);
  },
);

stationSetupRouter.put(
  '/users/:id',
  writePolicyGuard('PUT /setup/users/:id'),
  validateJson(userUpdateSchema, 'BAD_REQUEST'),
  async (c) => {
    const user = c.var.user;
    const id = c.req.param('id');
    const body = c.req.valid('json');
    const repo = new DrizzleUserRepository(c.var.db);
    const target = await repo.findById(id);
    if (!target || target.organizationId !== user.organizationId) {
      return c.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'User not found' } },
        404,
      );
    }
    // Authorize against the target's actual stations plus any requested change.
    const currentStationIds = await loadTargetStationIds(c.var.db, id);
    const requestedStationIds: string[] = Array.isArray(body.stationIds) ? body.stationIds : [];
    const scope = [...new Set([...currentStationIds, ...requestedStationIds])];
    if (!canActOnTarget(user, (body.role ?? target.role) as Role, scope)) {
      return c.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Not allowed to edit this user' } },
        403,
      );
    }
    const db = c.var.db;
    const useCase = new UpdateUser({
      repository: new DrizzleUserRepository(db),
      events: createDispatcher(db),
    });
    const result = await useCase.execute({ ...body, id }, buildContext(user));
    return sendResult(c, result);
  },
);

stationSetupRouter.post(
  '/users/:id/reset-password',
  writePolicyGuard('POST /setup/users/:id/reset-password'),
  rateLimit({ scope: 'password-reset', max: 15, windowMs: 60_000 }),
  async (c) => {
    const user = c.var.user;
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const password = typeof body.password === 'string' ? body.password : '';
    if (password.length < 8) {
      return c.json(
        {
          success: false,
          error: { code: 'BAD_REQUEST', message: 'Password must be at least 8 characters' },
        },
        400,
      );
    }
    const db = c.var.db;
    const repo = new DrizzleUserRepository(db);
    const target = await repo.findById(id);
    if (!target || target.organizationId !== user.organizationId) {
      return c.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'User not found' } },
        404,
      );
    }
    if (!canActOnTarget(user, target.role, await loadTargetStationIds(db, id))) {
      return c.json(
        {
          success: false,
          error: { code: 'FORBIDDEN', message: 'Not allowed to reset this password' },
        },
        403,
      );
    }
    if (!target.authUserId) {
      return c.json(
        {
          success: false,
          error: { code: 'NO_LOGIN', message: 'This member has no login account' },
        },
        400,
      );
    }
    const admin = getSupabaseAdmin(c);
    if (!admin) {
      return c.json(
        {
          success: false,
          error: {
            code: 'CONFIG_ERROR',
            message: 'Auth provisioning is not configured on the server',
          },
        },
        500,
      );
    }
    try {
      await admin.updatePassword(target.authUserId, password);
    } catch (e: any) {
      return c.json(
        {
          success: false,
          error: { code: 'AUTH_RESET_FAILED', message: e?.message ?? 'Could not reset password' },
        },
        400,
      );
    }
    const useCase = new ResetUserPassword({ repository: repo, events: createDispatcher(db) });
    const result = await useCase.execute({ id }, buildContext(user));
    return sendResult(c, result);
  },
);

stationSetupRouter.post(
  '/users/:id/deactivate',
  writePolicyGuard('POST /setup/users/:id/deactivate'),
  rateLimit({ scope: 'user-status', max: 30, windowMs: 60_000 }),
  async (c) => {
    return setUserActive(c, false);
  },
);

stationSetupRouter.post(
  '/users/:id/reactivate',
  writePolicyGuard('POST /setup/users/:id/reactivate'),
  rateLimit({ scope: 'user-status', max: 30, windowMs: 60_000 }),
  async (c) => {
    return setUserActive(c, true);
  },
);

async function setUserActive(c: any, active: boolean) {
  const user = c.var.user;
  const id = c.req.param('id');
  const db = c.var.db;
  const repo = new DrizzleUserRepository(db);
  const target = await repo.findById(id);
  if (!target || target.organizationId !== user.organizationId) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } }, 404);
  }
  if (!canActOnTarget(user, target.role, await loadTargetStationIds(db, id))) {
    return c.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Not allowed to change this user' } },
      403,
    );
  }
  if (target.authUserId) {
    const admin = getSupabaseAdmin(c);
    if (admin) {
      try {
        if (active) await admin.unbanUser(target.authUserId);
        else await admin.banUser(target.authUserId);
      } catch (e: any) {
        return c.json(
          {
            success: false,
            error: {
              code: 'AUTH_BAN_FAILED',
              message: e?.message ?? 'Could not update login account',
            },
          },
          400,
        );
      }
    }
  }
  const useCase = new SetUserStatus({ repository: repo, events: createDispatcher(db) });
  const result = await useCase.execute(
    { id, status: active ? 'ACTIVE' : 'INACTIVE' },
    buildContext(user),
  );
  return sendResult(c, result);
}

// ----------------------------------------------------
// Missing CRUD updates (PUT/DELETE)
// ----------------------------------------------------

/**
 * Resolve an infrastructure resource's STORED station within the caller's
 * organization. Authorization must use this — never a client-supplied
 * stationId, which could name a station the caller controls while the
 * resource belongs to another.
 */
async function resolveStoredStation(
  db: DbClient,
  table: typeof schema.tanks | typeof schema.dispenserUnits | typeof schema.nozzles,
  id: string,
  organizationId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ stationId: table.stationId })
    .from(table)
    .where(and(eq(table.id, id), eq(table.organizationId, organizationId)))
    .limit(1);
  return row?.stationId ?? null;
}

/** Shared guard for tank/dispenser/nozzle mutations. Response error or null. */
async function authorizeInfrastructure(
  c: any,
  table: typeof schema.tanks | typeof schema.dispenserUnits | typeof schema.nozzles,
  id: string,
): Promise<{ error: Response | null; stationId: string | null }> {
  const user = c.var.user;
  if (!can(user, 'station.infrastructure')) {
    return {
      error: c.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Insufficient write permissions' } },
        403,
      ),
      stationId: null,
    };
  }
  const stationId = await resolveStoredStation(c.var.db, table, id, user.organizationId);
  if (!stationId) {
    return {
      error: c.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Resource not found' } },
        404,
      ),
      stationId: null,
    };
  }
  if (!isAuthorizedForStation(user, { organizationId: user.organizationId, stationId })) {
    return {
      error: c.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'No access to this station' } },
        403,
      ),
      stationId: null,
    };
  }
  return { error: null, stationId };
}

stationSetupRouter.put('/tanks/:id', writePolicyGuard('PUT /setup/tanks/:id'), async (c) => {
  const user = c.var.user;
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const { error, stationId } = await authorizeInfrastructure(c, schema.tanks, id);
  if (error) return error;
  const db = c.var.db;
  const useCase = new UpdateTank({
    repository: new DrizzleTankRepository(db),
    events: createDispatcher(db),
  });
  const result = await useCase.execute({ ...body, id }, buildContext(user, { stationId }));
  return sendResult(c, result);
});

stationSetupRouter.delete('/tanks/:id', writePolicyGuard('DELETE /setup/tanks/:id'), async (c) => {
  const user = c.var.user;
  const id = c.req.param('id');
  const { error } = await authorizeInfrastructure(c, schema.tanks, id);
  if (error) return error;
  const db = c.var.db;
  const result = await runInTransaction(db, (tx, events) =>
    new DeleteTank({ repository: new DrizzleTankRepository(tx), events }).execute(
      { id },
      buildContext(user),
    ),
  );
  return sendResult(c, result);
});

stationSetupRouter.put(
  '/dispensers/:id',
  writePolicyGuard('PUT /setup/dispensers/:id'),
  async (c) => {
    const user = c.var.user;
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const { error, stationId } = await authorizeInfrastructure(c, schema.dispenserUnits, id);
    if (error) return error;
    const db = c.var.db;
    const useCase = new UpdateDispenser({
      repository: new DrizzleDispenserRepository(db),
      events: createDispatcher(db),
    });
    const result = await useCase.execute({ ...body, id }, buildContext(user, { stationId }));
    return sendResult(c, result);
  },
);

stationSetupRouter.delete(
  '/dispensers/:id',
  writePolicyGuard('DELETE /setup/dispensers/:id'),
  async (c) => {
    const user = c.var.user;
    const id = c.req.param('id');
    const { error } = await authorizeInfrastructure(c, schema.dispenserUnits, id);
    if (error) return error;
    const db = c.var.db;
    const useCase = new DeleteDispenser({
      repository: new DrizzleDispenserRepository(db),
      events: createDispatcher(db),
    });
    const result = await useCase.execute({ id }, buildContext(user));
    return sendResult(c, result);
  },
);

stationSetupRouter.put('/nozzles/:id', writePolicyGuard('PUT /setup/nozzles/:id'), async (c) => {
  const user = c.var.user;
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const { error, stationId } = await authorizeInfrastructure(c, schema.nozzles, id);
  if (error) return error;
  const db = c.var.db;
  const result = await runInTransaction(db, (tx, events) =>
    new UpdateNozzle({
      repository: new DrizzleNozzleRepository(tx),
      tanks: new DrizzleTankRepository(tx),
      products: new DrizzleProductRepository(tx),
      dispensers: new DrizzleDispenserRepository(tx),
      events,
    }).execute({ ...body, id }, buildContext(user, { stationId })),
  );
  return sendResult(c, result);
});

stationSetupRouter.delete(
  '/nozzles/:id',
  writePolicyGuard('DELETE /setup/nozzles/:id'),
  async (c) => {
    const user = c.var.user;
    const id = c.req.param('id');
    const { error } = await authorizeInfrastructure(c, schema.nozzles, id);
    if (error) return error;
    const db = c.var.db;
    const useCase = new DeleteNozzle({
      repository: new DrizzleNozzleRepository(db),
      tanks: new DrizzleTankRepository(db),
      products: new DrizzleProductRepository(db),
      dispensers: new DrizzleDispenserRepository(db),
      events: createDispatcher(db),
    });
    const result = await useCase.execute({ id }, buildContext(user));
    return sendResult(c, result);
  },
);

stationSetupRouter.put(
  '/shift-templates/:id',
  writePolicyGuard('PUT /setup/shift-templates/:id'),
  async (c) => {
    const user = c.var.user;
    const id = c.req.param('id');
    if (!can(user, 'station.manage')) {
      return c.json(
        {
          success: false,
          error: { code: 'FORBIDDEN', message: 'Only Owners/Managers can manage templates' },
        },
        403,
      );
    }
    const body = await c.req.json().catch(() => ({}));
    const db = c.var.db;
    const useCase = new UpdateShiftTemplate({
      repository: new DrizzleShiftTemplateRepository(db),
      events: createDispatcher(db),
    });
    const result = await useCase.execute({ ...body, id }, buildContext(user));
    return sendResult(c, result);
  },
);

stationSetupRouter.delete(
  '/shift-templates/:id',
  writePolicyGuard('DELETE /setup/shift-templates/:id'),
  async (c) => {
    const user = c.var.user;
    const id = c.req.param('id');
    if (!can(user, 'station.manage')) {
      return c.json(
        {
          success: false,
          error: { code: 'FORBIDDEN', message: 'Only Owners/Managers can manage templates' },
        },
        403,
      );
    }
    const db = c.var.db;
    const useCase = new DeleteShiftTemplate({
      repository: new DrizzleShiftTemplateRepository(db),
      events: createDispatcher(db),
    });
    const result = await useCase.execute({ id }, buildContext(user));
    return sendResult(c, result);
  },
);

// ----------------------------------------------------
// Onboarding Status & Completion
// ----------------------------------------------------

stationSetupRouter.get('/onboarding/status', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  const stationId = c.req.query('stationId');

  if (!stationId) {
    return c.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'Missing stationId' } },
      400,
    );
  }

  try {
    const [station] = await db
      .select()
      .from(schema.stations)
      .where(
        and(
          eq(schema.stations.id, stationId),
          eq(schema.stations.organizationId, user.organizationId),
        ),
      );

    if (!station) {
      return c.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Station not found' } },
        404,
      );
    }

    // Query entity counts to construct checklist
    const prodList = await db
      .select()
      .from(schema.products)
      .where(eq(schema.products.organizationId, user.organizationId));

    // Minimal fuel products
    const fuelCount = prodList.filter((p) => p.productType === 'FUEL' && p.isActive).length;
    const totalProducts = prodList.length;

    const tankList = await db
      .select()
      .from(schema.tanks)
      .where(
        and(
          eq(schema.tanks.stationId, stationId),
          eq(schema.tanks.organizationId, user.organizationId),
        ),
      );
    const tankCount = tankList.length;

    const duList = await db
      .select()
      .from(schema.dispenserUnits)
      .where(
        and(
          eq(schema.dispenserUnits.stationId, stationId),
          eq(schema.dispenserUnits.organizationId, user.organizationId),
        ),
      );
    const duCount = duList.length;

    const nozzleList = await db
      .select()
      .from(schema.nozzles)
      .where(
        and(
          eq(schema.nozzles.stationId, stationId),
          eq(schema.nozzles.organizationId, user.organizationId),
        ),
      );
    const nozzleCount = nozzleList.length;

    const templateList = await db
      .select()
      .from(schema.shiftTemplates)
      .where(eq(schema.shiftTemplates.organizationId, user.organizationId));
    const templateCount = templateList.length;

    // Check if ready for operations (needs products, tanks, dispensers, nozzles)
    // Fuel products must exist
    const hasFuel = fuelCount > 0;
    const hasTanks = tankCount > 0;
    const hasDispensers = duCount > 0;
    const hasNozzles = nozzleCount > 0;

    const isReady = hasFuel && hasTanks && hasDispensers && hasNozzles;

    return c.json({
      success: true,
      data: {
        stationId,
        onboardingStatus: station.onboardingStatus,
        isReady,
        checklist: {
          hasFuel,
          fuelCount,
          hasTanks,
          tankCount,
          hasDispensers,
          duCount,
          hasNozzles,
          nozzleCount,
          hasShifts: templateCount > 0,
          shiftCount: templateCount,
        },
      },
    });
  } catch (err: any) {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: err.message } }, 400);
  }
});

stationSetupRouter.post(
  '/onboarding/complete',
  writePolicyGuard('POST /setup/onboarding/complete'),
  async (c) => {
    const db = c.var.db;
    const user = c.var.user;
    try {
      const body = await c.req.json();
      const stationId = body.stationId;

      if (!stationId) {
        return c.json(
          { success: false, error: { code: 'BAD_REQUEST', message: 'Missing stationId' } },
          400,
        );
      }

      if (!checkWriteAccess(c, stationId)) {
        return c.json(
          {
            success: false,
            error: { code: 'FORBIDDEN', message: 'Insufficient write permissions' },
          },
          403,
        );
      }

      const [updated] = await db
        .update(schema.stations)
        .set({
          onboardingStatus: 'READY_FOR_OPERATIONS',
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.stations.id, stationId),
            eq(schema.stations.organizationId, user.organizationId),
          ),
        )
        .returning();

      if (!updated) {
        return c.json(
          { success: false, error: { code: 'NOT_FOUND', message: 'Station not found' } },
          404,
        );
      }

      return c.json({ success: true, data: updated });
    } catch (err: any) {
      return c.json({ success: false, error: { code: 'BAD_REQUEST', message: err.message } }, 400);
    }
  },
);

stationSetupRouter.post(
  '/onboarding/finalize',
  writePolicyGuard('POST /setup/onboarding/finalize'),
  validateJson(finalizeOnboardingSchema),
  async (c) => {
    const db = c.var.db;
    const user = c.var.user;

    if (!can(user, 'station.create')) {
      return c.json(
        {
          success: false,
          error: { code: 'FORBIDDEN', message: 'Only Owners can provision a new station' },
        },
        403,
      );
    }

    try {
      const parsed = c.req.valid('json') as { draft: OnboardingDraft };

      // Provisioning writes and the ONBOARDING_COMPLETED append share one
      // transaction: a failure in either rolls back the whole station setup.
      const result = await runInTransaction(db, (tx, events) =>
        new FinalizeStationOnboarding({
          provisioner: new DrizzleOnboardingProvisioner(tx),
          capacity: new DrizzleStationCapacityPort(tx),
          events,
        }).execute(parsed.draft, buildContext(user)),
      );
      return sendResult(c, result);
    } catch (err: any) {
      return c.json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } }, 500);
    }
  },
);

// ----------------------------------------------------
// Fuel Pricing Logs
// ----------------------------------------------------

// GET /api/setup/pricing
stationSetupRouter.get('/pricing', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  const stationId = c.req.query('stationId');

  if (!stationId) {
    return c.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'Missing stationId' } },
      400,
    );
  }

  if (!isAuthorizedForStation(user, { organizationId: user.organizationId, stationId })) {
    return c.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'No access to this station' } },
      403,
    );
  }

  try {
    const prices = await listCurrentFuelPrices(db, user.organizationId, stationId);
    return c.json({ success: true, data: prices });
  } catch (err: any) {
    return c.json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } }, 500);
  }
});

// GET /api/setup/pricing/history
stationSetupRouter.get('/pricing/history', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  const stationId = c.req.query('stationId');

  if (!stationId) {
    return c.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'Missing stationId' } },
      400,
    );
  }

  if (!isAuthorizedForStation(user, { organizationId: user.organizationId, stationId })) {
    return c.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'No access to this station' } },
      403,
    );
  }

  try {
    const list = await listFuelPriceHistory(db, user.organizationId, stationId);

    return c.json({ success: true, data: list });
  } catch (err: any) {
    return c.json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } }, 500);
  }
});

// POST /api/setup/pricing
stationSetupRouter.post(
  '/pricing',
  writePolicyGuard('POST /setup/pricing'),
  validateJson(fuelPriceSchema),
  async (c) => {
    const user = c.var.user;
    const parsed = c.req.valid('json');
    if (!checkWriteAccess(c, parsed.stationId)) {
      return c.json(
        {
          success: false,
          error: { code: 'FORBIDDEN', message: 'Insufficient write permissions for this station' },
        },
        403,
      );
    }
    if (!(await stationInOrg(c, parsed.stationId))) return stationNotFound(c);
    const db = c.var.db;
    const useCase = new RecordFuelPrice({
      repository: new DrizzleFuelPriceRepository(db),
      events: createDispatcher(db),
    });
    const result = await useCase.execute(
      parsed,
      buildContext(user, { stationId: parsed.stationId }),
    );
    return sendResult(c, result);
  },
);
