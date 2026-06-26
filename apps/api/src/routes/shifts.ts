import { Hono } from 'hono';
import { and, desc, eq } from 'drizzle-orm';
import { schema, type DbClient } from '@pump/db';
import { canOpenShift, canCloseShift, isAuthorizedForStation, type Role } from '@pump/shared';
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
  if (!stationId) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'stationId is required' } }, 400);
  }
  if (!isAuthorizedForStation(user, { organizationId: user.organizationId, stationId })) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this station' } }, 403);
  }
  const db = c.var.db;
  const shifts = new DrizzleShiftRepository(db);
  const businessDays = new DrizzleBusinessDayRepository(db);
  const [shift, businessDay] = await Promise.all([
    shifts.findOpenByStation(user.organizationId, stationId),
    businessDays.findOpenByStation(user.organizationId, stationId),
  ]);
  const readings = shift ? await new DrizzleNozzleReadingRepository(db).listByShift(shift.id) : [];
  return c.json({ success: true, data: { businessDay, shift, readings } });
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
