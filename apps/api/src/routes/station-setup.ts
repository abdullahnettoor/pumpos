import { Hono } from 'hono';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { schema, DbClient } from '@pump/db';
import {
  canManageProduct,
  canManageInfrastructure,
  canManageUsers,
  isAuthorizedForStation,
  stationSchema,
  userSchema,
  fuelPriceSchema,
  finalizeOnboardingSchema,
  OnboardingDraft,
  Role,
} from '@pump/shared';
import { validateJson } from '../utils/validator.js';
import {
  CreateStation, UpdateStation,
  CreateUser, UpdateUser,
  RecordFuelPrice,
  CreateTank, UpdateTank, DeleteTank,
  CreateDispenser, UpdateDispenser, DeleteDispenser,
  CreateNozzle, UpdateNozzle, DeleteNozzle,
  CreateShiftTemplate, UpdateShiftTemplate, DeleteShiftTemplate,
  BusinessEvents,
  eventFromContext,
  type Result,
} from '@pump/core';
import { buildContext } from '../infra/context.js';
import { createDispatcher } from '../infra/events.js';
import {
  DrizzleStationRepository,
  DrizzleUserRepository,
  DrizzleFuelPriceRepository,
  DrizzleTankRepository,
  DrizzleDispenserRepository,
  DrizzleNozzleRepository,
  DrizzleShiftTemplateRepository,
} from '../infra/repositories/setup-repositories.js';

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

export const stationSetupRouter = new Hono<{ Variables: Variables }>();

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

class FinalizeOnboardingError extends Error {
  stage: string;
  status: number;

  constructor(stage: string, message: string, status = 400) {
    super(message);
    this.stage = stage;
    this.status = status;
  }
}

function assertFinalize(condition: unknown, stage: string, message: string, status = 400): asserts condition {
  if (!condition) {
    throw new FinalizeOnboardingError(stage, message, status);
  }
}

function validateFinalizeDraft(payload: OnboardingDraft) {
  const { station, businessRules, products, tanks, dispensers, nozzles } = payload;

  assertFinalize(station.name.trim().length >= 2, 'Validating draft', 'Station name is required');
  assertFinalize(station.code.trim().length >= 2, 'Validating draft', 'Station code is required');
  assertFinalize(products.length > 0, 'Validating draft', 'Add at least one active fuel product before provisioning');
  assertFinalize(tanks.length > 0, 'Validating draft', 'Add at least one storage tank before provisioning');
  assertFinalize(dispensers.length > 0, 'Validating draft', 'Add at least one dispenser before provisioning');
  assertFinalize(nozzles.length > 0, 'Validating draft', 'Add at least one nozzle before provisioning');

  const normalizedProductCodes = new Set<string>();
  const normalizedProductNames = new Set<string>();
  for (const product of products) {
    const productCode = product.code.trim().toUpperCase();
    const productName = product.name.trim().toLowerCase();
    assertFinalize(!normalizedProductCodes.has(productCode), 'Validating draft', `Duplicate fuel code "${product.code}" found in draft`);
    assertFinalize(!normalizedProductNames.has(productName), 'Validating draft', `Duplicate fuel name "${product.name}" found in draft`);
    normalizedProductCodes.add(productCode);
    normalizedProductNames.add(productName);
  }

  const normalizedDispenserCodes = new Set<string>();
  const normalizedDispenserNames = new Set<string>();
  for (const dispenser of dispensers) {
    const dispenserCode = dispenser.code.trim().toUpperCase();
    const dispenserName = dispenser.name.trim().toLowerCase();
    assertFinalize(!normalizedDispenserCodes.has(dispenserCode), 'Validating draft', `Duplicate dispenser code "${dispenser.code}" found in draft`);
    assertFinalize(!normalizedDispenserNames.has(dispenserName), 'Validating draft', `Duplicate dispenser name "${dispenser.name}" found in draft`);
    normalizedDispenserCodes.add(dispenserCode);
    normalizedDispenserNames.add(dispenserName);
  }

  const productMap = new Map<string, OnboardingDraft['products'][number]>(products.map((product) => [product.draftId, product]));
  const tankMap = new Map<string, OnboardingDraft['tanks'][number]>(tanks.map((tank) => [tank.draftId, tank]));
  const dispenserMap = new Map<string, OnboardingDraft['dispensers'][number]>(dispensers.map((dispenser) => [dispenser.draftId, dispenser]));

  for (const day of businessRules.operatingSchedule.days) {
    if (day.isOpen) {
      assertFinalize(day.openTime < day.closeTime || businessRules.operatingSchedule.isTwentyFourSeven, 'Validating draft', `Operating hours for ${day.day} must have opening time before closing time`);
    }
  }

  for (const tank of tanks) {
    assertFinalize(productMap.has(tank.productDraftId), 'Validating draft', `Tank "${tank.name}" is linked to a missing fuel product`);
    assertFinalize(tank.openingQuantity <= tank.capacity, 'Validating draft', `Opening stock for tank "${tank.name}" cannot exceed its capacity`);
  }

  for (const nozzle of nozzles) {
    assertFinalize(dispenserMap.has(nozzle.dispenserDraftId), 'Validating draft', `Nozzle "${nozzle.name}" is linked to a missing dispenser`);
    assertFinalize(tankMap.has(nozzle.tankDraftId), 'Validating draft', `Nozzle "${nozzle.name}" is linked to a missing tank`);
    assertFinalize(productMap.has(nozzle.productDraftId), 'Validating draft', `Nozzle "${nozzle.name}" is linked to a missing fuel product`);

    const tank = tankMap.get(nozzle.tankDraftId)!;
    assertFinalize(
      tank.productDraftId === nozzle.productDraftId,
      'Validating draft',
      `Nozzle "${nozzle.name}" fuel must match the selected tank fuel`
    );
  }
}

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

stationSetupRouter.post('/users', validateJson(userSchema, 'BAD_REQUEST'), async (c) => {
  const user = c.var.user;
  if (!canManageUsers(user.role)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Only Owners can manage users' } }, 403);
  }
  const body = await c.req.json();
  const db = c.var.db;
  const useCase = new CreateUser({ repository: new DrizzleUserRepository(db), events: createDispatcher(db) });
  const result = await useCase.execute(body, buildContext(user));
  return sendResult(c, result);
});

stationSetupRouter.put('/users/:id', validateJson(userSchema.partial(), 'BAD_REQUEST'), async (c) => {
  const user = c.var.user;
  const id = c.req.param('id');
  if (!canManageUsers(user.role)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Only Owners can manage users' } }, 403);
  }
  const body = await c.req.json();
  const db = c.var.db;
  const useCase = new UpdateUser({ repository: new DrizzleUserRepository(db), events: createDispatcher(db) });
  const result = await useCase.execute({ ...body, id }, buildContext(user));
  return sendResult(c, result);
});

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
    const { draft } = parsed;

    validateFinalizeDraft(draft);

    const result = await db.transaction(async (tx) => {
      const existingStation = await tx
        .select()
        .from(schema.stations)
        .where(and(eq(schema.stations.organizationId, user.organizationId), eq(schema.stations.code, draft.station.code.toUpperCase())))
        .limit(1);

      assertFinalize(existingStation.length === 0, 'Creating station', `Station code "${draft.station.code}" already exists`, 409);

      const [newStation] = await tx
        .insert(schema.stations)
        .values({
          organizationId: user.organizationId,
          name: draft.station.name,
          code: draft.station.code.toUpperCase(),
          address: draft.station.address,
          phone: draft.station.phone,
          settings: {
            shift_grace_minutes: draft.station.shiftGraceMinutes,
            shift_lock_grace_days: 3,
            offline_warning_days: 3,
            offline_critical_days: 7,
            business_day_starts_at: draft.businessRules.businessDayStartsAt,
            timezone: draft.station.timezone,
            operating_schedule: draft.businessRules.operatingSchedule,
            pending_opening_stock_seed: [],
          },
          onboardingStatus: 'IN_PROGRESS',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      const productIdMap = new Map<string, string>();
      for (const product of draft.products) {
        const [createdProduct] = await tx
          .insert(schema.products)
          .values({
            organizationId: user.organizationId,
            name: product.name,
            code: product.code.toUpperCase(),
            productType: product.productType,
            inventoryType:
              product.productType === 'FUEL'
                ? 'BULK'
                : product.productType === 'SERVICE'
                  ? 'NONE'
                  : 'ITEM',
            stockTracked: product.stockTracked,
            isTaxable: product.isTaxable,
            unit: product.unit,
            taxConfig: product.taxConfig,
            isActive: product.isActive,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning();

        productIdMap.set(product.draftId, createdProduct.id);
      }

      const tankIdMap = new Map<string, string>();
      const pendingOpeningStockSeed: Array<{ tankId: string; productId: string; quantity: number }> = [];
      for (const tank of draft.tanks) {
        const mappedProductId = productIdMap.get(tank.productDraftId);
        assertFinalize(mappedProductId, 'Linking infrastructure', `Tank "${tank.name}" references an unknown fuel product`);

        const [createdTank] = await tx
          .insert(schema.tanks)
          .values({
            organizationId: user.organizationId,
            stationId: newStation.id,
            name: tank.name,
            productId: mappedProductId,
            capacity: String(tank.capacity),
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning();

        tankIdMap.set(tank.draftId, createdTank.id);
        if (tank.openingQuantity > 0) {
          pendingOpeningStockSeed.push({
            tankId: createdTank.id,
            productId: mappedProductId,
            quantity: tank.openingQuantity,
          });
        }
      }

      const dispenserIdMap = new Map<string, string>();
      for (const dispenser of draft.dispensers) {
        const [createdDispenser] = await tx
          .insert(schema.dispenserUnits)
          .values({
            organizationId: user.organizationId,
            stationId: newStation.id,
            name: dispenser.name,
            code: dispenser.code.toUpperCase(),
            status: dispenser.status,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning();

        dispenserIdMap.set(dispenser.draftId, createdDispenser.id);
      }

      for (const nozzle of draft.nozzles) {
        const mappedDispenserId = dispenserIdMap.get(nozzle.dispenserDraftId);
        const mappedTankId = tankIdMap.get(nozzle.tankDraftId);
        const mappedProductId = productIdMap.get(nozzle.productDraftId);
        assertFinalize(mappedDispenserId, 'Linking infrastructure', `Nozzle "${nozzle.name}" references an unknown dispenser`);
        assertFinalize(mappedTankId, 'Linking infrastructure', `Nozzle "${nozzle.name}" references an unknown tank`);
        assertFinalize(mappedProductId, 'Linking infrastructure', `Nozzle "${nozzle.name}" references an unknown fuel product`);

        await tx.insert(schema.nozzles).values({
          organizationId: user.organizationId,
          stationId: newStation.id,
          duId: mappedDispenserId,
          tankId: mappedTankId,
          productId: mappedProductId,
          name: nozzle.name,
          currentReading: String(nozzle.openingReading),
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      const activeFuelProducts = draft.products.filter((product) => product.isActive);
      if (activeFuelProducts.length > 0) {
        await tx.insert(schema.fuelPrices).values(
          activeFuelProducts.map((product) => ({
            organizationId: user.organizationId,
            stationId: newStation.id,
            productId: productIdMap.get(product.draftId)!,
            price: String(product.currentPrice),
            effectiveFrom: new Date(),
            createdAt: new Date(),
          }))
        );
      }

      if (draft.shiftTemplates.length > 0) {
        await tx.insert(schema.shiftTemplates).values(
          draft.shiftTemplates.map((template) => ({
            organizationId: user.organizationId,
            name: template.name,
            startTime: template.startTime,
            endTime: template.endTime,
            isActive: template.isActive,
          }))
        );
      }

      const [readyStation] = await tx
        .update(schema.stations)
        .set({
          onboardingStatus: 'READY_FOR_OPERATIONS',
          settings: {
            ...(newStation.settings as Record<string, unknown>),
            pending_opening_stock_seed: pendingOpeningStockSeed,
          },
          updatedAt: new Date(),
        })
        .where(eq(schema.stations.id, newStation.id))
        .returning();

      return {
        station: readyStation,
        summary: {
          productCount: draft.products.length,
          tankCount: draft.tanks.length,
          dispenserCount: draft.dispensers.length,
          nozzleCount: draft.nozzles.length,
          shiftTemplateCount: draft.shiftTemplates.length,
        },
      };
    });

    // Interim: emit ONBOARDING_COMPLETED after the provisioning transaction
    // commits. The full FinalizeStationOnboarding orchestration use-case lands
    // with the UnitOfWork in Phase 3.
    if (result.station?.id) {
      try {
        const dispatcher = createDispatcher(db);
        const ctx = buildContext(user, { stationId: result.station.id });
        await dispatcher.publish([
          eventFromContext(ctx, {
            eventType: BusinessEvents.ONBOARDING_COMPLETED,
            aggregateType: 'Station',
            aggregateId: result.station.id,
            stationId: result.station.id,
            payload: { stationId: result.station.id, ...result.summary },
          }),
        ]);
      } catch (e) {
        console.error('Failed to emit ONBOARDING_COMPLETED', e);
      }
    }

    return c.json({ success: true, data: result });
  } catch (err: any) {
    if (err instanceof FinalizeOnboardingError) {
      return c.json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: err.message,
          details: {
            stage: err.stage,
          },
        },
      }, err.status as any);
    }

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
