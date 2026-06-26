import { Hono } from 'hono';
import { and, desc, eq, ne } from 'drizzle-orm';
import { schema, type DbClient } from '@pump/db';
import { canOpenShift, canCloseShift, canReopenShift, isAuthorizedForStation, type Role } from '@pump/shared';
import {
  OpenShift,
  RecordNozzleReadings,
  CloseShift,
  ReopenShift,
  LockShift,
  OpenBusinessDay,
  CloseBusinessDay,
  type Result,
} from '@pump/core';
import { buildContext } from '../infra/context.js';
import { runInTransaction } from '../infra/transaction.js';
import {
  DrizzleNozzleRepository,
  DrizzleFuelPriceRepository,
} from '../infra/repositories/setup-repositories.js';
import {
  DrizzleBusinessDayRepository,
  DrizzleShiftRepository,
  DrizzleNozzleReadingRepository,
  DrizzleShiftReconciliationReader,
  DrizzleStockMovementWriter,
  DrizzleShiftSummaryWriter,
} from '../infra/repositories/station-ops-repositories.js';

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

export const shiftsRouter = new Hono<{ Variables: Variables }>();

const STATUS_BY_CODE: Record<string, number> = {
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  FORBIDDEN: 403,
  UNAUTHORIZED: 401,
  INVARIANT_VIOLATION: 409,
};

function sendResult<T>(c: any, result: Result<T>) {
  if (result.success) return c.json({ success: true, data: result.data });
  const status = STATUS_BY_CODE[result.error.code] ?? 400;
  return c.json({ success: false, error: result.error }, status);
}

function canManageDay(role: Role): boolean {
  return role === 'Owner' || role === 'Manager';
}

// GET /api/shifts/status?stationId=...
shiftsRouter.get('/status', async (c) => {
  const user = c.var.user;
  const stationId = c.req.query('stationId');
  const lite = c.req.query('lite') === 'true';
  if (!stationId) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'stationId is required' } }, 400);
  }
  if (!isAuthorizedForStation(user, { organizationId: user.organizationId, stationId })) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this station' } }, 403);
  }
  const db = c.var.db;
  const orgId = user.organizationId;

  const [station] = await db
    .select()
    .from(schema.stations)
    .where(and(eq(schema.stations.id, stationId), eq(schema.stations.organizationId, orgId)))
    .limit(1);
  if (!station) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Station not found' } }, 404);
  }
  const settings = (station.settings as any) ?? {};
  const graceMinutes = settings.shift_grace_minutes ?? 15;
  const lockGraceDays = settings.shift_lock_grace_days ?? 3;
  const now = Date.now();

  const [businessDay] = await db
    .select()
    .from(schema.businessDays)
    .where(and(eq(schema.businessDays.stationId, stationId), eq(schema.businessDays.status, 'OPEN')))
    .limit(1);

  // --- Active (OPEN) shift, enriched ---
  const [dbActiveShift] = await db
    .select()
    .from(schema.shifts)
    .where(and(eq(schema.shifts.stationId, stationId), eq(schema.shifts.status, 'OPEN')))
    .limit(1);

  let activeShift: any = null;
  if (dbActiveShift) {
    const [template] = await db.select().from(schema.shiftTemplates).where(eq(schema.shiftTemplates.id, dbActiveShift.shiftTemplateId)).limit(1);
    const [openedByUser] = await db.select().from(schema.users).where(eq(schema.users.id, dbActiveShift.openedBy)).limit(1);

    const nozzleReadingRows = await db
      .select({ nr: schema.nozzleReadings, nz: schema.nozzles, prod: schema.products, tnk: schema.tanks, du: schema.dispenserUnits })
      .from(schema.nozzleReadings)
      .leftJoin(schema.nozzles, eq(schema.nozzles.id, schema.nozzleReadings.nozzleId))
      .leftJoin(schema.products, eq(schema.products.id, schema.nozzles.productId))
      .leftJoin(schema.tanks, eq(schema.tanks.id, schema.nozzles.tankId))
      .leftJoin(schema.dispenserUnits, eq(schema.dispenserUnits.id, schema.nozzles.duId))
      .where(eq(schema.nozzleReadings.shiftId, dbActiveShift.id));
    const nozzleReadings = nozzleReadingRows.map(({ nr, nz, prod, tnk, du }) => ({
      ...nr,
      nozzleName: nz?.name ?? 'Unknown',
      productId: nz?.productId ?? null,
      productName: prod?.name ?? 'Unknown',
      productCode: prod?.code ?? 'Unknown',
      tankName: tnk?.name ?? 'Unknown',
      duId: nz?.duId ?? null,
      duName: du?.name ?? 'Unknown',
      duCode: du?.code ?? 'Unknown',
    }));

    const assignmentRows = await db
      .select({ sa: schema.shiftStaffAssignments, staffUser: schema.users, du: schema.dispenserUnits })
      .from(schema.shiftStaffAssignments)
      .leftJoin(schema.users, eq(schema.users.id, schema.shiftStaffAssignments.userId))
      .leftJoin(schema.dispenserUnits, eq(schema.dispenserUnits.id, schema.shiftStaffAssignments.duId))
      .where(eq(schema.shiftStaffAssignments.shiftId, dbActiveShift.id));
    const staffAssignments = assignmentRows.map(({ sa, staffUser, du }) => ({
      ...sa,
      userName: staffUser?.fullName ?? 'Unknown',
      duName: du?.name ?? 'Unknown',
      duCode: du?.code ?? 'Unknown',
    }));

    const handovers = await db.select().from(schema.attendantHandovers).where(eq(schema.attendantHandovers.shiftId, dbActiveShift.id));

    activeShift = {
      ...dbActiveShift,
      templateName: template?.name ?? 'Custom',
      openedByName: openedByUser?.fullName ?? 'System',
      nozzleReadings,
      staffAssignments,
      handovers,
    };
  }

  // --- Last non-open shift + its summary ---
  const [dbLastShift] = await db
    .select()
    .from(schema.shifts)
    .where(and(eq(schema.shifts.stationId, stationId), ne(schema.shifts.status, 'OPEN')))
    .orderBy(desc(schema.shifts.closedAt), desc(schema.shifts.createdAt))
    .limit(1);

  let lastShift: any = null;
  let lastDssr: any = null;
  let canReopenLastShift = false;
  let gracePeriodExpiresAt: string | null = null;

  if (dbLastShift) {
    let currentStatus = dbLastShift.status;
    let lockedAt = dbLastShift.lockedAt;
    if (currentStatus === 'CLOSED' && dbLastShift.closedAt) {
      const closedTime = new Date(dbLastShift.closedAt).getTime();
      const lockExpiryTime = closedTime + lockGraceDays * 24 * 60 * 60 * 1000;
      if (now > lockExpiryTime) {
        lockedAt = new Date(lockExpiryTime);
        currentStatus = 'LOCKED';
      } else {
        const reopenExpiryTime = closedTime + graceMinutes * 60 * 1000;
        if (now <= reopenExpiryTime) gracePeriodExpiresAt = new Date(reopenExpiryTime).toISOString();
      }
    }
    const [template] = await db.select().from(schema.shiftTemplates).where(eq(schema.shiftTemplates.id, dbLastShift.shiftTemplateId)).limit(1);
    let closedByName = 'System';
    if (dbLastShift.closedBy) {
      const [closedByUser] = await db.select().from(schema.users).where(eq(schema.users.id, dbLastShift.closedBy)).limit(1);
      closedByName = closedByUser?.fullName ?? 'System';
    }
    if (currentStatus === 'CLOSED' && gracePeriodExpiresAt && canReopenShift(user.role)) canReopenLastShift = true;
    lastShift = { ...dbLastShift, status: currentStatus, lockedAt, templateName: template?.name ?? 'Custom', closedByName };
    const [summary] = await db.select().from(schema.shiftSummaries).where(eq(schema.shiftSummaries.shiftId, dbLastShift.id)).limit(1);
    lastDssr = summary ?? null;
  }

  // --- Recent closed (not lock-expired) shifts ---
  const dbClosedShifts = await db
    .select({ shift: schema.shifts, templateName: schema.shiftTemplates.name })
    .from(schema.shifts)
    .leftJoin(schema.shiftTemplates, eq(schema.shifts.shiftTemplateId, schema.shiftTemplates.id))
    .where(and(eq(schema.shifts.stationId, stationId), eq(schema.shifts.status, 'CLOSED')))
    .orderBy(desc(schema.shifts.closedAt));
  const recentClosedShifts: any[] = [];
  for (const item of dbClosedShifts) {
    const s = item.shift;
    if (s.closedAt) {
      const lockExpiryTime = new Date(s.closedAt).getTime() + lockGraceDays * 24 * 60 * 60 * 1000;
      if (now <= lockExpiryTime) recentClosedShifts.push({ ...s, templateName: item.templateName ?? 'Custom' });
    }
  }

  // v2 fields (businessDay, readings) kept alongside legacy-compatible fields.
  const base = {
    businessDay: businessDay ?? null,
    shift: dbActiveShift ?? null,
    readings: activeShift?.nozzleReadings ?? [],
    activeShift,
    lastShift,
    lastDssr,
    canReopenLastShift,
    gracePeriodExpiresAt,
    recentClosedShifts,
  };

  if (lite) {
    return c.json({ success: true, data: base });
  }

  const templates = await db
    .select()
    .from(schema.shiftTemplates)
    .where(and(eq(schema.shiftTemplates.organizationId, orgId), eq(schema.shiftTemplates.isActive, true)));
  const nozzleRows = await db
    .select({ nz: schema.nozzles, prod: schema.products, tnk: schema.tanks })
    .from(schema.nozzles)
    .leftJoin(schema.products, eq(schema.products.id, schema.nozzles.productId))
    .leftJoin(schema.tanks, eq(schema.tanks.id, schema.nozzles.tankId))
    .where(and(eq(schema.nozzles.stationId, stationId), eq(schema.nozzles.organizationId, orgId)));
  const nozzles = nozzleRows.map(({ nz, prod, tnk }) => ({ ...nz, productName: prod?.name ?? 'Unknown', productCode: prod?.code ?? 'Unknown', tankName: tnk?.name ?? 'Unknown' }));
  const staff = await db
    .select()
    .from(schema.users)
    .where(and(eq(schema.users.organizationId, orgId), eq(schema.users.status, 'ACTIVE')));
  const dispensers = await db
    .select()
    .from(schema.dispenserUnits)
    .where(and(eq(schema.dispenserUnits.stationId, stationId), eq(schema.dispenserUnits.status, 'ACTIVE')));

  return c.json({ success: true, data: { ...base, templates, nozzles, staff, dispensers } });
});

// GET /api/shifts/handovers?shiftId=...  (legacy-compatible read)
shiftsRouter.get('/handovers', async (c) => {
  const db = c.var.db;
  const shiftId = c.req.query('shiftId');
  if (!shiftId) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'shiftId is required' } }, 400);
  }
  const rows = await db
    .select({ h: schema.attendantHandovers, userName: schema.users.fullName, duName: schema.dispenserUnits.name })
    .from(schema.attendantHandovers)
    .leftJoin(schema.users, eq(schema.users.id, schema.attendantHandovers.userId))
    .leftJoin(schema.dispenserUnits, eq(schema.dispenserUnits.id, schema.attendantHandovers.duId))
    .where(eq(schema.attendantHandovers.shiftId, shiftId));
  return c.json({ success: true, data: rows.map(({ h, userName, duName }) => ({ ...h, userName: userName ?? 'Unknown', duName: duName ?? 'Unknown' })) });
});

// POST /api/shifts/handovers  (legacy-compatible attendant cash/card/UPI/credit declaration)
shiftsRouter.post('/handovers', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  const body = await c.req.json().catch(() => ({}));
  const { shiftId, userId, duId } = body ?? {};
  if (!shiftId || !userId || !duId) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'shiftId, userId and duId are required' } }, 400);
  }
  const [shift] = await db.select().from(schema.shifts).where(eq(schema.shifts.id, shiftId)).limit(1);
  if (!shift || shift.organizationId !== user.organizationId) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Shift not found' } }, 404);
  }
  if (shift.status === 'LOCKED') {
    return c.json({ success: false, error: { code: 'INVARIANT_VIOLATION', message: 'Shift is locked' } }, 409);
  }
  const values = {
    organizationId: user.organizationId,
    stationId: shift.stationId,
    shiftId,
    userId,
    duId,
    cashHandedOver: String(body.cashHandedOver ?? 0),
    cardHandedOver: String(body.cardHandedOver ?? 0),
    upiHandedOver: String(body.upiHandedOver ?? 0),
    creditHandedOver: String(body.creditHandedOver ?? 0),
    testingVolume: String(body.testingVolume ?? 0),
    expectedSales: String(body.expectedSales ?? 0),
    varianceAmount: String(body.varianceAmount ?? 0),
  };
  // One handover per (shift, user, du): replace if re-declared.
  await db
    .delete(schema.attendantHandovers)
    .where(and(eq(schema.attendantHandovers.shiftId, shiftId), eq(schema.attendantHandovers.userId, userId), eq(schema.attendantHandovers.duId, duId)));
  const [row] = await db.insert(schema.attendantHandovers).values(values).returning();
  return c.json({ success: true, data: row });
});

// POST /api/shifts/open
shiftsRouter.post('/open', async (c) => {
  const user = c.var.user;
  if (!canOpenShift(user.role)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions to open a shift' } }, 403);
  }
  const body = await c.req.json().catch(() => ({}));
  if (!isAuthorizedForStation(user, { organizationId: user.organizationId, stationId: body?.stationId })) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this station' } }, 403);
  }
  const db = c.var.db;
  const result = await runInTransaction(db, (tx, events) =>
    new OpenShift({
      shifts: new DrizzleShiftRepository(tx),
      businessDays: new DrizzleBusinessDayRepository(tx),
      nozzles: new DrizzleNozzleRepository(tx),
      nozzleReadings: new DrizzleNozzleReadingRepository(tx),
      fuelPrices: new DrizzleFuelPriceRepository(tx),
      events,
    }).execute(body, buildContext(user, { stationId: body?.stationId })),
  );
  return sendResult(c, result);
});

// PUT /api/shifts/readings
shiftsRouter.put('/readings', async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => ({}));
  const db = c.var.db;
  const result = await runInTransaction(db, (tx, events) =>
    new RecordNozzleReadings({
      shifts: new DrizzleShiftRepository(tx),
      nozzleReadings: new DrizzleNozzleReadingRepository(tx),
      events,
    }).execute(body, buildContext(user)),
  );
  return sendResult(c, result);
});

// POST /api/shifts/close
shiftsRouter.post('/close', async (c) => {
  const user = c.var.user;
  if (!canCloseShift(user.role)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions to close a shift' } }, 403);
  }
  const body = await c.req.json().catch(() => ({}));
  const command = { shiftId: body?.shiftId, ...(body?.payload ?? {}) };
  const db = c.var.db;
  const result = await runInTransaction(db, (tx, events) =>
    new CloseShift({
      shifts: new DrizzleShiftRepository(tx),
      nozzles: new DrizzleNozzleRepository(tx),
      nozzleReadings: new DrizzleNozzleReadingRepository(tx),
      reconciliation: new DrizzleShiftReconciliationReader(tx),
      stockMovements: new DrizzleStockMovementWriter(tx),
      summaries: new DrizzleShiftSummaryWriter(tx),
      events,
    }).execute(command, buildContext(user)),
  );
  return sendResult(c, result);
});

// POST /api/shifts/reopen
shiftsRouter.post('/reopen', async (c) => {
  const user = c.var.user;
  if (!canManageDay(user.role)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Only Owners/Managers can reopen a shift' } }, 403);
  }
  const body = await c.req.json().catch(() => ({}));
  const db = c.var.db;
  const result = await runInTransaction(db, (tx, events) =>
    new ReopenShift({
      shifts: new DrizzleShiftRepository(tx),
      summaries: new DrizzleShiftSummaryWriter(tx),
      events,
    }).execute(body, buildContext(user)),
  );
  return sendResult(c, result);
});

// POST /api/shifts/lock
shiftsRouter.post('/lock', async (c) => {
  const user = c.var.user;
  if (!canManageDay(user.role)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Only Owners/Managers can lock a shift' } }, 403);
  }
  const body = await c.req.json().catch(() => ({}));
  const db = c.var.db;
  const result = await runInTransaction(db, (tx, events) =>
    new LockShift({ shifts: new DrizzleShiftRepository(tx), events }).execute(body, buildContext(user)),
  );
  return sendResult(c, result);
});

// POST /api/shifts/business-day/open
shiftsRouter.post('/business-day/open', async (c) => {
  const user = c.var.user;
  if (!canManageDay(user.role)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Only Owners/Managers can open a business day' } }, 403);
  }
  const body = await c.req.json().catch(() => ({}));
  const db = c.var.db;
  const result = await runInTransaction(db, (tx, events) =>
    new OpenBusinessDay({ repository: new DrizzleBusinessDayRepository(tx), events }).execute(body, buildContext(user, { stationId: body?.stationId })),
  );
  return sendResult(c, result);
});

// POST /api/shifts/business-day/close
shiftsRouter.post('/business-day/close', async (c) => {
  const user = c.var.user;
  if (!canManageDay(user.role)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Only Owners/Managers can close a business day' } }, 403);
  }
  const body = await c.req.json().catch(() => ({}));
  const db = c.var.db;
  const result = await runInTransaction(db, (tx, events) =>
    new CloseBusinessDay({ repository: new DrizzleBusinessDayRepository(tx), events }).execute(body, buildContext(user)),
  );
  return sendResult(c, result);
});

// GET /api/shifts/shift-summaries?stationId=...
shiftsRouter.get('/shift-summaries', async (c) => {
  const user = c.var.user;
  const stationId = c.req.query('stationId');
  if (!stationId) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'stationId is required' } }, 400);
  }
  const db = c.var.db;
  const rows = await db
    .select({
      shiftId: schema.shiftSummaries.shiftId,
      snapshotData: schema.shiftSummaries.snapshotData,
      generatedAt: schema.shiftSummaries.generatedAt,
      status: schema.shifts.status,
      openedAt: schema.shifts.openedAt,
      closedAt: schema.shifts.closedAt,
      businessDayId: schema.shifts.businessDayId,
    })
    .from(schema.shiftSummaries)
    .innerJoin(schema.shifts, eq(schema.shifts.id, schema.shiftSummaries.shiftId))
    .where(and(eq(schema.shifts.stationId, stationId), eq(schema.shifts.organizationId, user.organizationId)))
    .orderBy(desc(schema.shiftSummaries.generatedAt));
  return c.json({ success: true, data: rows });
});
