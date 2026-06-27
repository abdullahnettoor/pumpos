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
  FinalizeStationOnboarding,
  BusinessEvents,
  eventFromContext,
  type Result,
} from '@pump/core';
import { buildContext } from '../infra/context.js';
import { createDispatcher } from '../infra/events.js';
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
