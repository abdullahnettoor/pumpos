import { Hono } from 'hono';
import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { schema, type DbClient } from '@pump/db';
import { isAuthorizedForStation, canExportReports, type Role } from '@pump/shared';
import { GenerateDssr, type Result } from '@pump/core';
import { buildContext } from '../infra/context.js';
import { runInTransaction } from '../infra/transaction.js';
import {
  DrizzleDssrSnapshotRepository,
  DrizzleDssrDataReader,
} from '../infra/repositories/reporting-repositories.js';
import { DrizzleBusinessDayRepository } from '../infra/repositories/station-ops-repositories.js';

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

export const dssrRouter = new Hono<{ Variables: Variables }>();

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

// POST /api/dssr/daily/generate — { stationId, businessDate } | { businessDayId }
dssrRouter.post('/daily/generate', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  if (!canExportReports(user.role)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions to generate DSSR' } }, 403);
  }
  const body = await c.req.json().catch(() => ({}));
  let businessDayId: string | undefined = body?.businessDayId;
  const stationId: string | undefined = body?.stationId;
  const businessDate: string | undefined = body?.businessDate;

  if (!businessDayId) {
    if (!stationId || !businessDate) {
      return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Provide businessDayId, or stationId + businessDate' } }, 400);
    }
    if (!isAuthorizedForStation(user, { organizationId: user.organizationId, stationId })) {
      return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this station' } }, 403);
    }
    const [bd] = await db
      .select({ id: schema.businessDays.id })
      .from(schema.businessDays)
      .where(
        and(
          eq(schema.businessDays.organizationId, user.organizationId),
          eq(schema.businessDays.stationId, stationId),
          eq(schema.businessDays.businessDate, businessDate),
        ),
      )
      .limit(1);
    if (!bd) {
      return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'No business day found for that station and date' } }, 404);
    }
    businessDayId = bd.id;
  }

  const result = await runInTransaction(db, (tx, events) =>
    new GenerateDssr({
      businessDays: new DrizzleBusinessDayRepository(tx),
      snapshots: new DrizzleDssrSnapshotRepository(tx),
      reader: new DrizzleDssrDataReader(tx),
      events,
    }).execute({ businessDayId: businessDayId!, force: Boolean(body?.force) }, buildContext(user, { stationId, businessDayId })),
  );
  return sendResult(c, result);
});

// GET /api/dssr/daily?stationId=&date=
dssrRouter.get('/daily', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  const stationId = c.req.query('stationId');
  const date = c.req.query('date');
  if (!stationId || !date) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Missing stationId or date' } }, 400);
  }
  if (!isAuthorizedForStation(user, { organizationId: user.organizationId, stationId })) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this station' } }, 403);
  }
  const snapshot = await new DrizzleDssrSnapshotRepository(db).findByStationDate(user.organizationId, stationId, date);
  return c.json({ success: true, data: snapshot });
});

// GET /api/dssr/daily/range?stationId=&from=&to=
dssrRouter.get('/daily/range', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  const stationId = c.req.query('stationId');
  const from = c.req.query('from');
  const to = c.req.query('to');
  if (!stationId || !from || !to) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Missing stationId, from, or to' } }, 400);
  }
  if (!isAuthorizedForStation(user, { organizationId: user.organizationId, stationId })) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this station' } }, 403);
  }
  const list = await db
    .select()
    .from(schema.dssrSnapshots)
    .where(
      and(
        eq(schema.dssrSnapshots.organizationId, user.organizationId),
        eq(schema.dssrSnapshots.stationId, stationId),
        gte(schema.dssrSnapshots.businessDate, from),
        lte(schema.dssrSnapshots.businessDate, to),
      ),
    )
    .orderBy(desc(schema.dssrSnapshots.businessDate));
  return c.json({ success: true, data: list });
});
