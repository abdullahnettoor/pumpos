import { Hono } from 'hono';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { schema, type DbClient } from '@pump/db';
import { isAuthorizedForStation, canExportReports } from '@pump/shared';
import { GenerateDssr, composeDssr, type Result } from '@pump/core';
import { buildContext } from '../infra/context.js';
import type { AuthenticatedPrincipal } from '../infra/authenticated-principal.js';
import { runInTransaction } from '../infra/transaction.js';
import {
  DrizzleDssrSnapshotRepository,
  DrizzleDssrDataReader,
} from '../infra/repositories/reporting-repositories.js';
import { DrizzleBusinessDayRepository } from '../infra/repositories/station-ops-repositories.js';
import { sendResult } from '../infra/send-result.js';

type Variables = {
  db: DbClient;
  user: AuthenticatedPrincipal;
};

export const dssrRouter = new Hono<{ Variables: Variables }>();

async function buildLiveDssrPreview(
  db: DbClient,
  user: AuthenticatedPrincipal,
  businessDay: { id: string; stationId: string; businessDate: string; status: string },
) {
  const generatedAt = new Date().toISOString();
  const source = await new DrizzleDssrDataReader(db).readBusinessDay(businessDay.id);
  const snapshotData = {
    generatedAt,
    businessDayId: businessDay.id,
    businessDate: businessDay.businessDate,
    stationId: businessDay.stationId,
    organizationId: user.organizationId,
    status: businessDay.status,
    live: true,
    ...composeDssr(source),
  };
  return { businessDate: businessDay.businessDate, generatedAt, live: true, snapshotData };
}

async function loadPersistedDssr(
  db: DbClient,
  organizationId: string,
  stationId: string,
  date: string,
) {
  const [businessDay] = await db
    .select({ status: schema.businessDays.status })
    .from(schema.businessDays)
    .where(
      and(
        eq(schema.businessDays.organizationId, organizationId),
        eq(schema.businessDays.stationId, stationId),
        eq(schema.businessDays.businessDate, date),
      ),
    )
    .limit(1);
  if (businessDay?.status !== 'CLOSED') return null;
  const snapshot = await new DrizzleDssrSnapshotRepository(db).findByStationDate(
    organizationId,
    stationId,
    date,
  );
  if (!snapshot) return null;
  const [lateEntries] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.events)
    .innerJoin(schema.businessDays, eq(schema.events.businessDayId, schema.businessDays.id))
    .where(
      and(
        eq(schema.businessDays.organizationId, organizationId),
        eq(schema.businessDays.stationId, stationId),
        eq(schema.businessDays.businessDate, date),
        sql`${schema.events.metadata} ->> 'lateEntryPrimary' = 'true'`,
      ),
    );
  return { ...snapshot, lateEntryCount: Number(lateEntries?.count ?? 0) };
}

// POST /api/dssr/daily/generate — { stationId, businessDate } | { businessDayId }
dssrRouter.post('/daily/generate', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  if (!canExportReports(user.role)) {
    return c.json(
      {
        success: false,
        error: { code: 'FORBIDDEN', message: 'Insufficient permissions to generate DSSR' },
      },
      403,
    );
  }
  const body = await c.req.json().catch(() => ({}));
  let businessDayId: string | undefined = body?.businessDayId;
  let stationId: string | undefined = body?.stationId;
  const businessDate: string | undefined = body?.businessDate;
  let businessDay: { id: string; stationId: string; businessDate: string; status: string };

  if (!businessDayId) {
    if (!stationId || !businessDate) {
      return c.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Provide businessDayId, or stationId + businessDate',
          },
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
    const [bd] = await db
      .select({
        id: schema.businessDays.id,
        stationId: schema.businessDays.stationId,
        businessDate: schema.businessDays.businessDate,
        status: schema.businessDays.status,
      })
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
      return c.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'No business day found for that station and date' },
        },
        404,
      );
    }
    businessDayId = bd.id;
    businessDay = bd;
  } else {
    const [bd] = await db
      .select({
        id: schema.businessDays.id,
        stationId: schema.businessDays.stationId,
        businessDate: schema.businessDays.businessDate,
        status: schema.businessDays.status,
      })
      .from(schema.businessDays)
      .where(
        and(
          eq(schema.businessDays.id, businessDayId),
          eq(schema.businessDays.organizationId, user.organizationId),
        ),
      )
      .limit(1);
    if (!bd) {
      return c.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Business day not found' } },
        404,
      );
    }
    stationId = bd.stationId;
    if (!isAuthorizedForStation(user, { organizationId: user.organizationId, stationId })) {
      return c.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'No access to this station' } },
        403,
      );
    }
    businessDay = bd;
  }

  if (businessDay.status === 'OPEN') {
    return c.json({ success: true, data: await buildLiveDssrPreview(db, user, businessDay) });
  }

  const result = await runInTransaction(db, (tx, events) =>
    new GenerateDssr({
      businessDays: new DrizzleBusinessDayRepository(tx),
      snapshots: new DrizzleDssrSnapshotRepository(tx),
      reader: new DrizzleDssrDataReader(tx),
      events,
    }).execute(
      { businessDayId: businessDayId, force: Boolean(body?.force) },
      buildContext(user, { stationId, businessDayId }),
    ),
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
    return c.json(
      { success: false, error: { code: 'VALIDATION_ERROR', message: 'Missing stationId or date' } },
      400,
    );
  }
  if (!isAuthorizedForStation(user, { organizationId: user.organizationId, stationId })) {
    return c.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'No access to this station' } },
      403,
    );
  }
  return c.json({
    success: true,
    data: await loadPersistedDssr(db, user.organizationId, stationId, date),
  });
});

// GET /api/dssr/daily/preview?stationId=&date= returns live data for an OPEN
// day and the immutable persisted snapshot for a CLOSED day.
dssrRouter.get('/daily/preview', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  const stationId = c.req.query('stationId');
  const date = c.req.query('date');
  if (!stationId || !date) {
    return c.json(
      { success: false, error: { code: 'VALIDATION_ERROR', message: 'Missing stationId or date' } },
      400,
    );
  }
  if (!isAuthorizedForStation(user, { organizationId: user.organizationId, stationId })) {
    return c.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'No access to this station' } },
      403,
    );
  }
  const [bd] = await db
    .select({
      id: schema.businessDays.id,
      stationId: schema.businessDays.stationId,
      businessDate: schema.businessDays.businessDate,
      status: schema.businessDays.status,
    })
    .from(schema.businessDays)
    .where(
      and(
        eq(schema.businessDays.organizationId, user.organizationId),
        eq(schema.businessDays.stationId, stationId),
        eq(schema.businessDays.businessDate, date),
      ),
    )
    .limit(1);
  // No business day yet (no activity) → return null; the UI shows an empty state.
  if (!bd) return c.json({ success: true, data: null });
  if (bd.status === 'CLOSED') {
    const snapshot = await loadPersistedDssr(db, user.organizationId, stationId, date);
    if (!snapshot) {
      return c.json(
        {
          success: false,
          error: {
            code: 'CONFLICT',
            message: 'Closed business day has no persisted DSSR snapshot',
          },
        },
        409,
      );
    }
    return c.json({ success: true, data: snapshot });
  }
  return c.json({ success: true, data: await buildLiveDssrPreview(db, user, bd) });
});

// GET /api/dssr/daily/range?stationId=&from=&to=
dssrRouter.get('/daily/range', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  const stationId = c.req.query('stationId');
  const from = c.req.query('from');
  const to = c.req.query('to');
  if (!stationId || !from || !to) {
    return c.json(
      {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Missing stationId, from, or to' },
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
