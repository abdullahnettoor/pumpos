import { Hono } from 'hono';
import { eq, and, desc } from 'drizzle-orm';
import { schema, DbClient } from '@pump/db';
import {
  canManageProduct,
  canManageInfrastructure,
  canManageUsers,
  isAuthorizedForStation,
  stationSchema,
  userSchema,
  fuelPriceSchema,
  Role,
} from '@pump/shared';
import { validateJson } from '../utils/validator.js';

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

// ----------------------------------------------------
// Stations CRUD
// ----------------------------------------------------

// GET /api/setup/stations
stationSetupRouter.get('/stations', async (c) => {
  const db = c.var.db;
  const user = c.var.user;

  const results = await db
    .select()
    .from(schema.stations)
    .where(eq(schema.stations.organizationId, user.organizationId));

  // If not Owner, filter by assigned stations
  const visible = results.filter((s) =>
    isAuthorizedForStation(user, { organizationId: user.organizationId, stationId: s.id })
  );

  return c.json({ success: true, data: visible });
});

// POST /api/setup/stations
stationSetupRouter.post('/stations', validateJson(stationSchema), async (c) => {
  const db = c.var.db;
  const user = c.var.user;

  if (user.role !== 'Owner') {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Only Owners can create stations' } }, 403);
  }

  const parsed = c.req.valid('json');

  const [newStation] = await db
    .insert(schema.stations)
    .values({
      organizationId: user.organizationId,
      name: parsed.name,
      code: parsed.code,
      address: parsed.address,
      phone: parsed.phone,
      settings: parsed.settings,
      onboardingStatus: parsed.onboardingStatus,
      isActive: parsed.isActive,
    })
    .returning();

  return c.json({ success: true, data: newStation });
});

// PUT /api/setup/stations/:id
stationSetupRouter.put('/stations/:id', validateJson(stationSchema.partial()), async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  const stationId = c.req.param('id');

  if (!checkWriteAccess(c, stationId)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient write permissions for this station' } }, 403);
  }

  const parsed = c.req.valid('json');

  const [updated] = await db
    .update(schema.stations)
    .set({
      name: parsed.name,
      code: parsed.code,
      address: parsed.address,
      phone: parsed.phone,
      settings: parsed.settings,
      onboardingStatus: parsed.onboardingStatus,
      isActive: parsed.isActive,
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
});

// ----------------------------------------------------
// Products CRUD
// ----------------------------------------------------

stationSetupRouter.get('/products', async (c) => {
  const db = c.var.db;
  const user = c.var.user;

  const list = await db
    .select()
    .from(schema.products)
    .where(eq(schema.products.organizationId, user.organizationId));

  return c.json({ success: true, data: list });
});

stationSetupRouter.post('/products', async (c) => {
  const db = c.var.db;
  const user = c.var.user;

  if (!canManageProduct(user.role)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions to create products' } }, 403);
  }

  try {
    const body = await c.req.json();
    const [newProduct] = await db
      .insert(schema.products)
      .values({
        organizationId: user.organizationId,
        name: body.name,
        code: body.code,
        productType: body.productType,
        stockTracked: body.stockTracked ?? true,
        isTaxable: body.isTaxable ?? true,
        unit: body.unit,
        taxConfig: body.taxConfig ?? { gst_rate: 18 },
        isActive: body.isActive ?? true,
      })
      .returning();

    return c.json({ success: true, data: newProduct });
  } catch (err: any) {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: err.message } }, 400);
  }
});

stationSetupRouter.put('/products/:id', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  const prodId = c.req.param('id');

  if (!canManageProduct(user.role)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions to modify products' } }, 403);
  }

  try {
    const body = await c.req.json();
    const [updated] = await db
      .update(schema.products)
      .set({
        name: body.name,
        code: body.code,
        productType: body.productType,
        stockTracked: body.stockTracked,
        isTaxable: body.isTaxable,
        unit: body.unit,
        taxConfig: body.taxConfig,
        isActive: body.isActive,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.products.id, prodId),
          eq(schema.products.organizationId, user.organizationId)
        )
      )
      .returning();

    if (!updated) {
      return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Product not found' } }, 404);
    }
    return c.json({ success: true, data: updated });
  } catch (err: any) {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: err.message } }, 400);
  }
});

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
  const db = c.var.db;
  const user = c.var.user;

  try {
    const body = await c.req.json();
    if (!checkWriteAccess(c, body.stationId) || !canManageInfrastructure(user.role)) {
      return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient write permissions' } }, 403);
    }

    const [newTank] = await db
      .insert(schema.tanks)
      .values({
        organizationId: user.organizationId,
        stationId: body.stationId,
        name: body.name,
        productId: body.productId,
        capacity: body.capacity,
      })
      .returning();

    return c.json({ success: true, data: newTank });
  } catch (err: any) {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: err.message } }, 400);
  }
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
  const db = c.var.db;
  const user = c.var.user;

  try {
    const body = await c.req.json();
    if (!checkWriteAccess(c, body.stationId) || !canManageInfrastructure(user.role)) {
      return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient write permissions' } }, 403);
    }

    const [du] = await db
      .insert(schema.dispenserUnits)
      .values({
        organizationId: user.organizationId,
        stationId: body.stationId,
        name: body.name,
        code: body.code,
        status: body.status || 'ACTIVE',
      })
      .returning();

    return c.json({ success: true, data: du });
  } catch (err: any) {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: err.message } }, 400);
  }
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
  const db = c.var.db;
  const user = c.var.user;

  try {
    const body = await c.req.json();
    if (!checkWriteAccess(c, body.stationId) || !canManageInfrastructure(user.role)) {
      return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient write permissions' } }, 403);
    }

    const [nozzle] = await db
      .insert(schema.nozzles)
      .values({
        organizationId: user.organizationId,
        stationId: body.stationId,
        duId: body.duId,
        tankId: body.tankId,
        productId: body.productId,
        name: body.name,
        currentReading: body.currentReading || '0',
      })
      .returning();

    return c.json({ success: true, data: nozzle });
  } catch (err: any) {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: err.message } }, 400);
  }
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
  const db = c.var.db;
  const user = c.var.user;

  if (user.role !== 'Owner' && user.role !== 'Manager') {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Only Owners/Managers can manage templates' } }, 403);
  }

  try {
    const body = await c.req.json();
    const [tpl] = await db
      .insert(schema.shiftTemplates)
      .values({
        organizationId: user.organizationId,
        name: body.name,
        startTime: body.startTime,
        endTime: body.endTime,
        isActive: body.isActive ?? true,
      })
      .returning();

    return c.json({ success: true, data: tpl });
  } catch (err: any) {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: err.message } }, 400);
  }
});

// ----------------------------------------------------
// User Management & Assignments
// ----------------------------------------------------

stationSetupRouter.get('/users', async (c) => {
  const db = c.var.db;
  const user = c.var.user;

  const userList = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.organizationId, user.organizationId));

  // Map roles and assignments
  const mapped = await Promise.all(
    userList.map(async (u) => {
      const roleRec = await db.query.userRoles.findFirst({
        where: eq(schema.userRoles.userId, u.id),
      });
      const assigns = await db
        .select()
        .from(schema.userStationAssignments)
        .where(eq(schema.userStationAssignments.userId, u.id));

      return {
        ...u,
        role: roleRec?.role || 'Staff',
        stationIds: assigns.map((a) => a.stationId),
      };
    })
  );

  return c.json({ success: true, data: mapped });
});

stationSetupRouter.post('/users', validateJson(userSchema, 'BAD_REQUEST'), async (c) => {
  const db = c.var.db;
  const user = c.var.user;

  if (!canManageUsers(user.role)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Only Owners can manage users' } }, 403);
  }

  const parsed = c.req.valid('json');
  const body = await c.req.json(); // we still need raw body for stationIds and role

  const [newUser] = await db
    .insert(schema.users)
    .values({
      organizationId: user.organizationId,
      fullName: parsed.fullName,
      email: (parsed.email && parsed.email.trim() !== '') ? parsed.email : null,
      phone: parsed.phone,
      status: parsed.status,
    })
    .returning();

  // Insert user role
  await db.insert(schema.userRoles).values({
    userId: newUser.id,
    role: body.role || 'Staff',
  });

  // Insert station assignments
  if (body.stationIds && Array.isArray(body.stationIds)) {
    for (const sid of body.stationIds) {
      await db.insert(schema.userStationAssignments).values({
        userId: newUser.id,
        stationId: sid,
      });
    }
  }

  return c.json({ success: true, data: newUser });
});

stationSetupRouter.put('/users/:id', validateJson(userSchema.partial(), 'BAD_REQUEST'), async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  const id = c.req.param('id');

  if (!canManageUsers(user.role)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Only Owners can manage users' } }, 403);
  }

  const parsed = c.req.valid('json');
  const body = await c.req.json();

  const [updatedUser] = await db
    .update(schema.users)
    .set({
      fullName: parsed.fullName,
      email: (parsed.email !== undefined) ? ((parsed.email && parsed.email.trim() !== '') ? parsed.email : null) : undefined,
      phone: parsed.phone,
      status: parsed.status,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.users.id, id),
        eq(schema.users.organizationId, user.organizationId)
      )
    )
    .returning();

  if (!updatedUser) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } }, 404);
  }

  // Update role if provided
  if (body.role) {
    await db
      .delete(schema.userRoles)
      .where(eq(schema.userRoles.userId, id));

    await db.insert(schema.userRoles).values({
      userId: id,
      role: body.role,
    });
  }

  // Update station assignments if provided
  if (body.stationIds && Array.isArray(body.stationIds)) {
    await db
      .delete(schema.userStationAssignments)
      .where(eq(schema.userStationAssignments.userId, id));

    for (const sid of body.stationIds) {
      await db.insert(schema.userStationAssignments).values({
        userId: id,
        stationId: sid,
      });
    }
  }

  return c.json({ success: true, data: updatedUser });
});

// ----------------------------------------------------
// Missing CRUD updates (PUT/DELETE)
// ----------------------------------------------------

stationSetupRouter.put('/tanks/:id', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  const id = c.req.param('id');
  try {
    const body = await c.req.json();
    if (!checkWriteAccess(c, body.stationId) || !canManageInfrastructure(user.role)) {
      return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient write permissions' } }, 403);
    }
    const [updated] = await db
      .update(schema.tanks)
      .set({
        name: body.name,
        productId: body.productId,
        capacity: body.capacity,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.tanks.id, id),
          eq(schema.tanks.organizationId, user.organizationId)
        )
      )
      .returning();
    if (!updated) {
      return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Tank not found' } }, 404);
    }
    return c.json({ success: true, data: updated });
  } catch (err: any) {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: err.message } }, 400);
  }
});

stationSetupRouter.delete('/tanks/:id', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  const id = c.req.param('id');
  try {
    if (!canManageInfrastructure(user.role)) {
      return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient write permissions' } }, 403);
    }
    const [deleted] = await db
      .delete(schema.tanks)
      .where(
        and(
          eq(schema.tanks.id, id),
          eq(schema.tanks.organizationId, user.organizationId)
        )
      )
      .returning();
    if (!deleted) {
      return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Tank not found' } }, 404);
    }
    return c.json({ success: true, data: deleted });
  } catch (err: any) {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: err.message } }, 400);
  }
});

stationSetupRouter.put('/dispensers/:id', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  const id = c.req.param('id');
  try {
    const body = await c.req.json();
    if (!checkWriteAccess(c, body.stationId) || !canManageInfrastructure(user.role)) {
      return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient write permissions' } }, 403);
    }
    const [updated] = await db
      .update(schema.dispenserUnits)
      .set({
        name: body.name,
        code: body.code,
        status: body.status,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.dispenserUnits.id, id),
          eq(schema.dispenserUnits.organizationId, user.organizationId)
        )
      )
      .returning();
    if (!updated) {
      return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Dispenser not found' } }, 404);
    }
    return c.json({ success: true, data: updated });
  } catch (err: any) {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: err.message } }, 400);
  }
});

stationSetupRouter.delete('/dispensers/:id', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  const id = c.req.param('id');
  try {
    if (!canManageInfrastructure(user.role)) {
      return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient write permissions' } }, 403);
    }
    const [deleted] = await db
      .delete(schema.dispenserUnits)
      .where(
        and(
          eq(schema.dispenserUnits.id, id),
          eq(schema.dispenserUnits.organizationId, user.organizationId)
        )
      )
      .returning();
    if (!deleted) {
      return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Dispenser not found' } }, 404);
    }
    return c.json({ success: true, data: deleted });
  } catch (err: any) {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: err.message } }, 400);
  }
});

stationSetupRouter.put('/nozzles/:id', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  const id = c.req.param('id');
  try {
    const body = await c.req.json();
    if (!checkWriteAccess(c, body.stationId) || !canManageInfrastructure(user.role)) {
      return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient write permissions' } }, 403);
    }
    const [updated] = await db
      .update(schema.nozzles)
      .set({
        duId: body.duId,
        tankId: body.tankId,
        productId: body.productId,
        name: body.name,
        currentReading: body.currentReading,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.nozzles.id, id),
          eq(schema.nozzles.organizationId, user.organizationId)
        )
      )
      .returning();
    if (!updated) {
      return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Nozzle not found' } }, 404);
    }
    return c.json({ success: true, data: updated });
  } catch (err: any) {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: err.message } }, 400);
  }
});

stationSetupRouter.delete('/nozzles/:id', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  const id = c.req.param('id');
  try {
    if (!canManageInfrastructure(user.role)) {
      return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient write permissions' } }, 403);
    }
    const [deleted] = await db
      .delete(schema.nozzles)
      .where(
        and(
          eq(schema.nozzles.id, id),
          eq(schema.nozzles.organizationId, user.organizationId)
        )
      )
      .returning();
    if (!deleted) {
      return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Nozzle not found' } }, 404);
    }
    return c.json({ success: true, data: deleted });
  } catch (err: any) {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: err.message } }, 400);
  }
});

stationSetupRouter.put('/shift-templates/:id', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  const id = c.req.param('id');
  if (user.role !== 'Owner' && user.role !== 'Manager') {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Only Owners/Managers can manage templates' } }, 403);
  }
  try {
    const body = await c.req.json();
    const [updated] = await db
      .update(schema.shiftTemplates)
      .set({
        name: body.name,
        startTime: body.startTime,
        endTime: body.endTime,
        isActive: body.isActive,
      })
      .where(
        and(
          eq(schema.shiftTemplates.id, id),
          eq(schema.shiftTemplates.organizationId, user.organizationId)
        )
      )
      .returning();
    if (!updated) {
      return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Template not found' } }, 404);
    }
    return c.json({ success: true, data: updated });
  } catch (err: any) {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: err.message } }, 400);
  }
});

stationSetupRouter.delete('/shift-templates/:id', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  const id = c.req.param('id');
  if (user.role !== 'Owner' && user.role !== 'Manager') {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Only Owners/Managers can manage templates' } }, 403);
  }
  try {
    const [deleted] = await db
      .delete(schema.shiftTemplates)
      .where(
        and(
          eq(schema.shiftTemplates.id, id),
          eq(schema.shiftTemplates.organizationId, user.organizationId)
        )
      )
      .returning();
    if (!deleted) {
      return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Template not found' } }, 404);
    }
    return c.json({ success: true, data: deleted });
  } catch (err: any) {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: err.message } }, 400);
  }
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

    const prices = await Promise.all(
      fuels.map(async (f) => {
        const [latestPrice] = await db
          .select()
          .from(schema.fuelPrices)
          .where(
            and(
              eq(schema.fuelPrices.stationId, stationId),
              eq(schema.fuelPrices.productId, f.id)
            )
          )
          .orderBy(desc(schema.fuelPrices.effectiveFrom))
          .limit(1);

        return {
          productId: f.id,
          productName: f.name,
          productCode: f.code,
          price: latestPrice ? Number(latestPrice.price) : 0,
          effectiveFrom: latestPrice ? latestPrice.effectiveFrom : null,
        };
      })
    );

    return c.json({ success: true, data: prices });
  } catch (err: any) {
    return c.json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } }, 500);
  }
});

// POST /api/setup/pricing
stationSetupRouter.post('/pricing', validateJson(fuelPriceSchema), async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  const parsed = c.req.valid('json');

  if (!checkWriteAccess(c, parsed.stationId)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient write permissions for this station' } }, 403);
  }

  try {
    const [newPrice] = await db
      .insert(schema.fuelPrices)
      .values({
        organizationId: user.organizationId,
        stationId: parsed.stationId,
        productId: parsed.productId,
        price: String(parsed.price),
        effectiveFrom: parsed.effectiveFrom ? new Date(parsed.effectiveFrom) : new Date(),
      })
      .returning();

    return c.json({ success: true, data: newPrice });
  } catch (err: any) {
    return c.json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } }, 500);
  }
});
