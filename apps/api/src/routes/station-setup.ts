import { Hono } from 'hono';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { schema, DbClient } from '@pump/db';
import {
  canManageProduct,
  canManageInfrastructure,
  canManageStaff,
  isManageableByManager,
  isAuthorizedForStation,
  normalizePhone,
  phoneToAuthEmail,
  stationSchema,
  userSchema,
  userUpdateSchema,
  fuelPriceSchema,
  finalizeOnboardingSchema,
  OnboardingDraft,
  Role,
} from '@pump/shared';
import { validateJson } from '../utils/validator.js';
import {
  CreateStation, UpdateStation,
  CreateUser, UpdateUser, ResetUserPassword, SetUserStatus,
  RecordFuelPrice,
  CreateTank, UpdateTank, DeleteTank,
  CreateDispenser, UpdateDispenser, DeleteDispenser,
  CreateNozzle, UpdateNozzle, DeleteNozzle,
  CreateShiftTemplate, UpdateShiftTemplate, DeleteShiftTemplate,
  FinalizeStationOnboarding,
  BusinessEvents,
  eventFromContext,
  type Result,
} from '@pump/core';
import { buildContext } from '../infra/context.js';
import { createDispatcher } from '../infra/events.js';
import { SupabaseAdmin } from '../infra/supabase-admin.js';
import { rateLimit } from '../infra/rate-limit.js';
import { DrizzleOnboardingProvisioner } from '../infra/onboarding-provisioner.js';
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
  user: {
    id: string;
    email: string;
    organizationId: string;
    role: Role;
    assignedStationIds: string[];
  };
};

export const stationSetupRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const STATUS_BY_CODE: Record<string, number> = {
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  FORBIDDEN: 403,
  UNAUTHORIZED: 401,
};

function sendResult<T>(c: any, result: Result<T>) {
  if (result.success) return c.json({ success: true, data: result.data });
  const status = STATUS_BY_CODE[result.error.code] ?? 400;
  return c.json({ success: false, error: result.error }, status);
}

// ----------------------------------------------------
// Helper Checkers
// ----------------------------------------------------
function checkWriteAccess(c: any, stationId?: string | null): boolean {
  const user = c.var.user;
  if (user.role === 'Owner') return true;
  if (user.role === 'Manager') {
    if (!stationId) return false;
    return user.assignedStationIds.includes(stationId);
  }
  return false; // Accountant & Staff are read-only
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
    isAuthorizedForStation(user, { organizationId: user.organizationId, stationId: s.id })
  );
  return c.json({ success: true, data: visible });
});

// POST /api/setup/stations
stationSetupRouter.post('/stations', validateJson(stationSchema), async (c) => {
  const user = c.var.user;
  if (user.role !== 'Owner') {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Only Owners can create stations' } }, 403);
  }
  const body = c.req.valid('json');
  const db = c.var.db;
  const useCase = new CreateStation({ repository: new DrizzleStationRepository(db), events: createDispatcher(db) });
  const result = await useCase.execute(body as any, buildContext(user));
  return sendResult(c, result);
});

// PUT /api/setup/stations/:id
stationSetupRouter.put('/stations/:id', validateJson(stationSchema.partial()), async (c) => {
  const user = c.var.user;
  const stationId = c.req.param('id');
  if (!checkWriteAccess(c, stationId)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient write permissions for this station' } }, 403);
  }
  const body = c.req.valid('json');
  const db = c.var.db;
  const useCase = new UpdateStation({ repository: new DrizzleStationRepository(db), events: createDispatcher(db) });
  const result = await useCase.execute({ ...body, id: stationId } as any, buildContext(user));
  return sendResult(c, result);
});

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
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Missing stationId query parameter' } }, 400);
  }

  if (!isAuthorizedForStation(user, { organizationId: user.organizationId, stationId })) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this station' } }, 403);
  }

  const list = await db
    .select()
    .from(schema.tanks)
    .where(
      and(
        eq(schema.tanks.stationId, stationId),
        eq(schema.tanks.organizationId, user.organizationId)
      )
    );

  return c.json({ success: true, data: list });
});

stationSetupRouter.post('/tanks', async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => ({}));
  if (!checkWriteAccess(c, body.stationId) || !canManageInfrastructure(user.role)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient write permissions' } }, 403);
  }
  const db = c.var.db;
  const useCase = new CreateTank({ repository: new DrizzleTankRepository(db), events: createDispatcher(db) });
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
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Missing stationId' } }, 400);
  }

  const list = await db
    .select()
    .from(schema.dispenserUnits)
    .where(
      and(
        eq(schema.dispenserUnits.stationId, stationId),
        eq(schema.dispenserUnits.organizationId, user.organizationId)
      )
    );

  return c.json({ success: true, data: list });
});

stationSetupRouter.post('/dispensers', async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => ({}));
  if (!checkWriteAccess(c, body.stationId) || !canManageInfrastructure(user.role)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient write permissions' } }, 403);
  }
  const db = c.var.db;
  const useCase = new CreateDispenser({ repository: new DrizzleDispenserRepository(db), events: createDispatcher(db) });
  const result = await useCase.execute(body, buildContext(user, { stationId: body.stationId }));
  return sendResult(c, result);
});

// ----------------------------------------------------
// Nozzles CRUD
// ----------------------------------------------------

stationSetupRouter.get('/nozzles', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  const stationId = c.req.query('stationId');

  if (!stationId) {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Missing stationId' } }, 400);
  }

  const list = await db
    .select()
    .from(schema.nozzles)
    .where(
      and(
        eq(schema.nozzles.stationId, stationId),
        eq(schema.nozzles.organizationId, user.organizationId)
      )
    );

  return c.json({ success: true, data: list });
});

stationSetupRouter.post('/nozzles', async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => ({}));
  if (!checkWriteAccess(c, body.stationId) || !canManageInfrastructure(user.role)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient write permissions' } }, 403);
  }
  const db = c.var.db;
  const useCase = new CreateNozzle({ repository: new DrizzleNozzleRepository(db), events: createDispatcher(db) });
  const result = await useCase.execute(body, buildContext(user, { stationId: body.stationId }));
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

stationSetupRouter.post('/shift-templates', async (c) => {
  const user = c.var.user;
  if (user.role !== 'Owner' && user.role !== 'Manager') {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Only Owners/Managers can manage templates' } }, 403);
  }
  const body = await c.req.json().catch(() => ({}));
  const db = c.var.db;
  const useCase = new CreateShiftTemplate({ repository: new DrizzleShiftTemplateRepository(db), events: createDispatcher(db) });
  const result = await useCase.execute(body, buildContext(user));
  return sendResult(c, result);
});

// ----------------------------------------------------
// User Management & Assignments
// ----------------------------------------------------

stationSetupRouter.get('/users', async (c) => {
  const user = c.var.user;
  const repo = new DrizzleUserRepository(c.var.db);
  const data = await repo.listWithAssignments(user.organizationId);
  return c.json({ success: true, data });
});

// Resolve the Supabase admin adapter or return null when secrets are absent.
function getSupabaseAdmin(c: any): SupabaseAdmin | null {
  const url = c.env?.SUPABASE_URL;
  const key = c.env?.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return new SupabaseAdmin({ url, secretKey: key });
}

// Owner = full; Manager = Staff/Attendant on own stations only.
function canActOnTarget(
  actor: { role: Role; assignedStationIds: string[] },
  targetRole: Role,
  targetStationIds: string[] = [],
): boolean {
  if (actor.role === 'Owner') return true;
  if (actor.role !== 'Manager') return false;
  if (!isManageableByManager(targetRole)) return false;
  // Manager must share at least one assigned station with the target (or the
  // target has no station scope yet, e.g. brand-new record).
  if (targetStationIds.length === 0) return true;
  return targetStationIds.some((s) => actor.assignedStationIds.includes(s));
}

stationSetupRouter.post('/users', rateLimit({ scope: 'users-write', max: 30, windowMs: 60_000 }), validateJson(userSchema, 'BAD_REQUEST'), async (c) => {
  const user = c.var.user;
  if (!canManageStaff(user.role)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Not allowed to manage users' } }, 403);
  }
  const body = c.req.valid('json') as any;
  const targetRole: Role = body.role ?? 'Staff';
  if (!canActOnTarget(user, targetRole, body.stationIds ?? [])) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Managers may only add Staff/Attendant on their own stations' } }, 403);
  }

  const db = c.var.db;
  const wantsLogin = !!body.enableAppAccess;

  // Compute identity: an email identity uses the real email; a phone identity
  // uses a synthetic handle. The real phone is always normalized + stored.
  const rawEmail: string | null = body.email && String(body.email).trim() !== '' ? String(body.email).trim().toLowerCase() : null;
  const normalizedPhone = normalizePhone(body.phone);
  let authUserId: string | null = null;

  if (wantsLogin) {
    const admin = getSupabaseAdmin(c);
    if (!admin) {
      return c.json({ success: false, error: { code: 'CONFIG_ERROR', message: 'Auth provisioning is not configured on the server' } }, 500);
    }
    // Prefer email identity when present; otherwise derive the phone handle.
    const authEmail = rawEmail ?? phoneToAuthEmail(normalizedPhone);
    if (!authEmail || !body.password) {
      return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'An email or phone plus a password are required for app access' } }, 400);
    }
    try {
      const created = await admin.createUser({ email: authEmail, password: String(body.password) });
      authUserId = created.id;
    } catch (e: any) {
      const status = e?.status === 422 ? 409 : 400;
      return c.json({ success: false, error: { code: 'AUTH_PROVISION_FAILED', message: e?.message ?? 'Could not create login account' } }, status);
    }
  }

  const useCase = new CreateUser({ repository: new DrizzleUserRepository(db), events: createDispatcher(db) });
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
});

stationSetupRouter.put('/users/:id', validateJson(userUpdateSchema, 'BAD_REQUEST'), async (c) => {
  const user = c.var.user;
  const id = c.req.param('id');
  const body = c.req.valid('json') as any;
  const repo = new DrizzleUserRepository(c.var.db);
  const target = await repo.findById(id);
  if (!target || target.organizationId !== user.organizationId) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } }, 404);
  }
  if (!canActOnTarget(user, (body.role ?? target.role) as Role)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Not allowed to edit this user' } }, 403);
  }
  const db = c.var.db;
  const useCase = new UpdateUser({ repository: new DrizzleUserRepository(db), events: createDispatcher(db) });
  const result = await useCase.execute({ ...body, id }, buildContext(user));
  return sendResult(c, result);
});

stationSetupRouter.post('/users/:id/reset-password', rateLimit({ scope: 'password-reset', max: 15, windowMs: 60_000 }), async (c) => {
  const user = c.var.user;
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const password = typeof body.password === 'string' ? body.password : '';
  if (password.length < 8) {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Password must be at least 8 characters' } }, 400);
  }
  const db = c.var.db;
  const repo = new DrizzleUserRepository(db);
  const target = await repo.findById(id);
  if (!target || target.organizationId !== user.organizationId) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } }, 404);
  }
  if (!canActOnTarget(user, target.role as Role)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Not allowed to reset this password' } }, 403);
  }
  if (!target.authUserId) {
    return c.json({ success: false, error: { code: 'NO_LOGIN', message: 'This member has no login account' } }, 400);
  }
  const admin = getSupabaseAdmin(c);
  if (!admin) {
    return c.json({ success: false, error: { code: 'CONFIG_ERROR', message: 'Auth provisioning is not configured on the server' } }, 500);
  }
  try {
    await admin.updatePassword(target.authUserId, password);
  } catch (e: any) {
    return c.json({ success: false, error: { code: 'AUTH_RESET_FAILED', message: e?.message ?? 'Could not reset password' } }, 400);
  }
  const useCase = new ResetUserPassword({ repository: repo, events: createDispatcher(db) });
  const result = await useCase.execute({ id }, buildContext(user));
  return sendResult(c, result);
});

stationSetupRouter.post('/users/:id/deactivate', rateLimit({ scope: 'user-status', max: 30, windowMs: 60_000 }), async (c) => {
  return setUserActive(c, false);
});

stationSetupRouter.post('/users/:id/reactivate', rateLimit({ scope: 'user-status', max: 30, windowMs: 60_000 }), async (c) => {
  return setUserActive(c, true);
});

async function setUserActive(c: any, active: boolean) {
  const user = c.var.user;
  const id = c.req.param('id');
  const db = c.var.db;
  const repo = new DrizzleUserRepository(db);
  const target = await repo.findById(id);
  if (!target || target.organizationId !== user.organizationId) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } }, 404);
  }
  if (!canActOnTarget(user, target.role as Role)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Not allowed to change this user' } }, 403);
  }
  if (target.authUserId) {
    const admin = getSupabaseAdmin(c);
    if (admin) {
      try {
        if (active) await admin.unbanUser(target.authUserId);
        else await admin.banUser(target.authUserId);
      } catch (e: any) {
        return c.json({ success: false, error: { code: 'AUTH_BAN_FAILED', message: e?.message ?? 'Could not update login account' } }, 400);
      }
    }
  }
  const useCase = new SetUserStatus({ repository: repo, events: createDispatcher(db) });
  const result = await useCase.execute({ id, status: active ? 'ACTIVE' : 'INACTIVE' }, buildContext(user));
  return sendResult(c, result);
}

// ----------------------------------------------------
// Missing CRUD updates (PUT/DELETE)
// ----------------------------------------------------

stationSetupRouter.put('/tanks/:id', async (c) => {
  const user = c.var.user;
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  if (!checkWriteAccess(c, body.stationId) || !canManageInfrastructure(user.role)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient write permissions' } }, 403);
  }
  const db = c.var.db;
  const useCase = new UpdateTank({ repository: new DrizzleTankRepository(db), events: createDispatcher(db) });
  const result = await useCase.execute({ ...body, id }, buildContext(user, { stationId: body.stationId }));
  return sendResult(c, result);
});

stationSetupRouter.delete('/tanks/:id', async (c) => {
  const user = c.var.user;
  const id = c.req.param('id');
  if (!canManageInfrastructure(user.role)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient write permissions' } }, 403);
  }
  const db = c.var.db;
  const useCase = new DeleteTank({ repository: new DrizzleTankRepository(db), events: createDispatcher(db) });
  const result = await useCase.execute({ id }, buildContext(user));
  return sendResult(c, result);
});

stationSetupRouter.put('/dispensers/:id', async (c) => {
  const user = c.var.user;
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  if (!checkWriteAccess(c, body.stationId) || !canManageInfrastructure(user.role)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient write permissions' } }, 403);
  }
  const db = c.var.db;
  const useCase = new UpdateDispenser({ repository: new DrizzleDispenserRepository(db), events: createDispatcher(db) });
  const result = await useCase.execute({ ...body, id }, buildContext(user, { stationId: body.stationId }));
  return sendResult(c, result);
});

stationSetupRouter.delete('/dispensers/:id', async (c) => {
  const user = c.var.user;
  const id = c.req.param('id');
  if (!canManageInfrastructure(user.role)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient write permissions' } }, 403);
  }
  const db = c.var.db;
  const useCase = new DeleteDispenser({ repository: new DrizzleDispenserRepository(db), events: createDispatcher(db) });
  const result = await useCase.execute({ id }, buildContext(user));
  return sendResult(c, result);
});

stationSetupRouter.put('/nozzles/:id', async (c) => {
  const user = c.var.user;
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  if (!checkWriteAccess(c, body.stationId) || !canManageInfrastructure(user.role)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient write permissions' } }, 403);
  }
  const db = c.var.db;
  const useCase = new UpdateNozzle({ repository: new DrizzleNozzleRepository(db), events: createDispatcher(db) });
  const result = await useCase.execute({ ...body, id }, buildContext(user, { stationId: body.stationId }));
  return sendResult(c, result);
});

stationSetupRouter.delete('/nozzles/:id', async (c) => {
  const user = c.var.user;
  const id = c.req.param('id');
  if (!canManageInfrastructure(user.role)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient write permissions' } }, 403);
  }
  const db = c.var.db;
  const useCase = new DeleteNozzle({ repository: new DrizzleNozzleRepository(db), events: createDispatcher(db) });
  const result = await useCase.execute({ id }, buildContext(user));
  return sendResult(c, result);
});

stationSetupRouter.put('/shift-templates/:id', async (c) => {
  const user = c.var.user;
  const id = c.req.param('id');
  if (user.role !== 'Owner' && user.role !== 'Manager') {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Only Owners/Managers can manage templates' } }, 403);
  }
  const body = await c.req.json().catch(() => ({}));
  const db = c.var.db;
  const useCase = new UpdateShiftTemplate({ repository: new DrizzleShiftTemplateRepository(db), events: createDispatcher(db) });
  const result = await useCase.execute({ ...body, id }, buildContext(user));
  return sendResult(c, result);
});

stationSetupRouter.delete('/shift-templates/:id', async (c) => {
  const user = c.var.user;
  const id = c.req.param('id');
  if (user.role !== 'Owner' && user.role !== 'Manager') {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Only Owners/Managers can manage templates' } }, 403);
  }
  const db = c.var.db;
  const useCase = new DeleteShiftTemplate({ repository: new DrizzleShiftTemplateRepository(db), events: createDispatcher(db) });
  const result = await useCase.execute({ id }, buildContext(user));
  return sendResult(c, result);
});

// ----------------------------------------------------
// Onboarding Status & Completion
// ----------------------------------------------------

stationSetupRouter.get('/onboarding/status', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  const stationId = c.req.query('stationId');

  if (!stationId) {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Missing stationId' } }, 400);
  }

  try {
    const [station] = await db
      .select()
      .from(schema.stations)
      .where(
        and(
          eq(schema.stations.id, stationId),
          eq(schema.stations.organizationId, user.organizationId)
        )
      );

    if (!station) {
      return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Station not found' } }, 404);
    }

    // Query entity counts to construct checklist
    const prodList = await db
      .select()
      .from(schema.products)
      .where(eq(schema.products.organizationId, user.organizationId));
    
    // Minimal fuel products
    const fuelCount = prodList.filter(p => p.productType === 'FUEL' && p.isActive).length;
    const totalProducts = prodList.length;

    const tankList = await db
      .select()
      .from(schema.tanks)
      .where(
        and(
          eq(schema.tanks.stationId, stationId),
          eq(schema.tanks.organizationId, user.organizationId)
        )
      );
    const tankCount = tankList.length;

    const duList = await db
      .select()
      .from(schema.dispenserUnits)
      .where(
        and(
          eq(schema.dispenserUnits.stationId, stationId),
          eq(schema.dispenserUnits.organizationId, user.organizationId)
        )
      );
    const duCount = duList.length;

    const nozzleList = await db
      .select()
      .from(schema.nozzles)
      .where(
        and(
          eq(schema.nozzles.stationId, stationId),
          eq(schema.nozzles.organizationId, user.organizationId)
        )
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
        }
      }
    });
  } catch (err: any) {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: err.message } }, 400);
  }
});

stationSetupRouter.post('/onboarding/complete', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  try {
    const body = await c.req.json();
    const stationId = body.stationId;

    if (!stationId) {
      return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Missing stationId' } }, 400);
    }

    if (!checkWriteAccess(c, stationId)) {
      return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient write permissions' } }, 403);
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
          eq(schema.stations.organizationId, user.organizationId)
        )
      )
      .returning();

    if (!updated) {
      return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Station not found' } }, 404);
    }

    return c.json({ success: true, data: updated });
  } catch (err: any) {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: err.message } }, 400);
  }
});

stationSetupRouter.post('/onboarding/finalize', validateJson(finalizeOnboardingSchema), async (c) => {
  const db = c.var.db;
  const user = c.var.user;

  if (user.role !== 'Owner') {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Only Owners can provision a new station' } }, 403);
  }

  try {
    const parsed = c.req.valid('json') as { draft: OnboardingDraft };

    const useCase = new FinalizeStationOnboarding({
      provisioner: new DrizzleOnboardingProvisioner(db),
      events: createDispatcher(db),
    });
    const result = await useCase.execute(parsed.draft, buildContext(user));
    return sendResult(c, result);
  } catch (err: any) {
    return c.json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } }, 500);
  }
});

// ----------------------------------------------------
// Fuel Pricing Logs
// ----------------------------------------------------

// GET /api/setup/pricing
stationSetupRouter.get('/pricing', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  const stationId = c.req.query('stationId');

  if (!stationId) {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Missing stationId' } }, 400);
  }

  if (!isAuthorizedForStation(user, { organizationId: user.organizationId, stationId })) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this station' } }, 403);
  }

  try {
    const fuels = await db
      .select()
      .from(schema.products)
      .where(
        and(
          eq(schema.products.organizationId, user.organizationId),
          eq(schema.products.productType, 'FUEL'),
          eq(schema.products.isActive, true)
        )
      );

    const fuelIds = fuels.map((f) => f.id);
    const allPrices = fuelIds.length > 0
      ? await db
          .select()
          .from(schema.fuelPrices)
          .where(
            and(
              eq(schema.fuelPrices.stationId, stationId),
              inArray(schema.fuelPrices.productId, fuelIds)
            )
          )
          .orderBy(desc(schema.fuelPrices.effectiveFrom))
      : [];

    const latestByProduct = new Map<string, typeof allPrices[number]>();
    for (const p of allPrices) {
      if (!latestByProduct.has(p.productId)) latestByProduct.set(p.productId, p);
    }

    const prices = fuels.map((f) => {
      const latestPrice = latestByProduct.get(f.id);
      return {
        productId: f.id,
        productName: f.name,
        productCode: f.code,
        price: latestPrice ? Number(latestPrice.price) : 0,
        effectiveFrom: latestPrice ? latestPrice.effectiveFrom : null,
      };
    });

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
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Missing stationId' } }, 400);
  }

  if (!isAuthorizedForStation(user, { organizationId: user.organizationId, stationId })) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this station' } }, 403);
  }

  try {
    const list = await db
      .select({
        id: schema.fuelPrices.id,
        productId: schema.fuelPrices.productId,
        productName: schema.products.name,
        productCode: schema.products.code,
        price: schema.fuelPrices.price,
        effectiveFrom: schema.fuelPrices.effectiveFrom,
        createdAt: schema.fuelPrices.createdAt,
      })
      .from(schema.fuelPrices)
      .innerJoin(schema.products, eq(schema.fuelPrices.productId, schema.products.id))
      .where(
        and(
          eq(schema.fuelPrices.stationId, stationId),
          eq(schema.fuelPrices.organizationId, user.organizationId)
        )
      )
      .orderBy(desc(schema.fuelPrices.effectiveFrom));

    return c.json({ success: true, data: list });
  } catch (err: any) {
    return c.json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } }, 500);
  }
});

// POST /api/setup/pricing
stationSetupRouter.post('/pricing', validateJson(fuelPriceSchema), async (c) => {
  const user = c.var.user;
  const parsed = c.req.valid('json');
  if (!checkWriteAccess(c, parsed.stationId)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient write permissions for this station' } }, 403);
  }
  const db = c.var.db;
  const useCase = new RecordFuelPrice({ repository: new DrizzleFuelPriceRepository(db), events: createDispatcher(db) });
  const result = await useCase.execute(parsed as any, buildContext(user, { stationId: parsed.stationId }));
  return sendResult(c, result);
});
