import { Hono } from 'hono';
import { eq, and, desc, gte, lt } from 'drizzle-orm';
import { schema, DbClient } from '@pump/db';
import { Role } from '@pump/shared';
import { z } from 'zod';

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

// Helper to check if user belongs/has access to station
function hasStationAccess(user: any, stationId: string): boolean {
  if (user.role === 'Owner') return true;
  return user.assignedStationIds.includes(stationId);
}

// Parse business day window from settings
function getBusinessDayWindow(settings: any): { startHour: number; startMinute: number } {
  const businessDayStartsAt = (settings?.business_day_starts_at as string) || '06:00';
  const [hourStr, minStr] = businessDayStartsAt.split(':');
  return {
    startHour: parseInt(hourStr, 10) || 6,
    startMinute: parseInt(minStr, 10) || 0,
  };
}

// Calculate business day timestamp range
function getBusinessDayTimestamps(
  businessDate: string,
  settings: any,
  timezone: string = 'UTC'
): { windowStart: Date; windowEnd: Date } {
  const { startHour, startMinute } = getBusinessDayWindow(settings);
  
  // Parse businessDate (YYYY-MM-DD)
  const [year, month, day] = businessDate.split('-');
  const dateObj = new Date(`${year}-${month}-${day}T00:00:00Z`);
  
  // Window start = businessDate at startHour:startMinute
  const windowStart = new Date(dateObj);
  windowStart.setHours(startHour, startMinute, 0, 0);
  
  // Window end = next day at startHour:startMinute
  const windowEnd = new Date(windowStart);
  windowEnd.setDate(windowEnd.getDate() + 1);
  
  return { windowStart, windowEnd };
}

// POST /api/dssr/daily/generate
dssrRouter.post('/daily/generate', async (c) => {
  const db = c.var.db;
  const user = c.var.user;

  try {
    const bodyStr = await c.req.text();
    const body = bodyStr ? JSON.parse(bodyStr) : {};
    const { stationId, businessDate } = body;

    if (!stationId || !businessDate) {
      return c.json(
        { success: false, error: { code: 'BAD_REQUEST', message: 'Missing stationId or businessDate' } },
        400
      );
    }

    if (!hasStationAccess(user, stationId)) {
      return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this station' } }, 403);
    }

    // Fetch station
    const [station] = await db
      .select()
      .from(schema.stations)
      .where(and(eq(schema.stations.id, stationId), eq(schema.stations.organizationId, user.organizationId)));

    if (!station) {
      return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Station not found' } }, 404);
    }

    // Get business day window
    const { windowStart, windowEnd } = getBusinessDayTimestamps(businessDate, station.settings);

    // Fetch all shifts in the business day window
    const shiftsInWindow = await db
      .select()
      .from(schema.shifts)
      .where(
        and(
          eq(schema.shifts.stationId, stationId),
          eq(schema.shifts.organizationId, user.organizationId),
          gte(schema.shifts.closedAt, windowStart),
          lt(schema.shifts.closedAt, windowEnd),
          eq(schema.shifts.status, 'CLOSED')
        )
      );

    // Fetch corresponding shift summaries
    const summariesData = await db
      .select()
      .from(schema.shiftSummaries)
      .where(
        and(
          eq(schema.shifts.stationId, stationId),
          eq(schema.shifts.organizationId, user.organizationId)
        )
      )
      .innerJoin(schema.shifts, eq(schema.shiftSummaries.shiftId, schema.shifts.id))
      .then((rows) =>
        rows.filter((row) => shiftsInWindow.some((s) => s.id === row.shifts.id))
      );

    // Aggregate snapshot data from all shift summaries
    const aggregated: any = {
      businessDate,
      stationId,
      organizationId: user.organizationId,
      shiftsIncluded: shiftsInWindow.length,
      totalVolumeSold: 0,
      totalCashCollections: 0,
      totalCardCollections: 0,
      totalUpiCollections: 0,
      totalCreditSales: 0,
      totalExpenses: 0,
      totalPurchases: 0,
      nozzles: {},
      warnings: [],
      shifts: [],
    };

    // Iterate through shift summaries and aggregate
    for (const row of summariesData) {
      const snapshot = row.shift_summaries.snapshotData as any;
      if (!snapshot) continue;

      aggregated.totalVolumeSold += Number(snapshot.totalVolumeSold || 0);
      aggregated.totalCashCollections += Number(snapshot.cashCollectionsSum || 0);
      aggregated.totalCardCollections += Number(snapshot.cardCollectionsSum || 0);
      aggregated.totalUpiCollections += Number(snapshot.upiCollectionsSum || 0);
      aggregated.totalCreditSales += Number(snapshot.creditSalesSum || 0);
      aggregated.totalExpenses += Number(snapshot.cashExpensesSum || 0);
      aggregated.totalPurchases += Number(snapshot.purchases?.length || 0);

      // Aggregate by nozzle
      if (snapshot.nozzleReadings) {
        for (const nr of snapshot.nozzleReadings) {
          if (!aggregated.nozzles[nr.nozzleId]) {
            aggregated.nozzles[nr.nozzleId] = {
              nozzleName: nr.nozzleName,
              productName: nr.productName,
              totalVolume: 0,
              instances: 0,
            };
          }
          aggregated.nozzles[nr.nozzleId].totalVolume += Number(nr.volumeSold || 0);
          aggregated.nozzles[nr.nozzleId].instances += 1;
        }
      }

      // Collect shift details
      aggregated.shifts.push({
        shiftId: row.shift_summaries.shiftId,
        templateName: snapshot.templateName,
        closedAt: snapshot.closedAt,
        cashVariance: snapshot.cashVariance,
      });
    }

    // Upsert into dssr_snapshots
    const [existing] = await db
      .select()
      .from(schema.dssrSnapshots)
      .where(
        and(
          eq(schema.dssrSnapshots.stationId, stationId),
          eq(schema.dssrSnapshots.businessDate, businessDate)
        )
      );

    let dssrRecord;
    if (existing) {
      // Update
      await db
        .update(schema.dssrSnapshots)
        .set({
          snapshotData: aggregated,
          generatedAt: new Date(),
        })
        .where(eq(schema.dssrSnapshots.id, existing.id));

      dssrRecord = { ...existing, snapshotData: aggregated };
    } else {
      // Insert
      const newId = crypto.randomUUID();
      await db.insert(schema.dssrSnapshots).values({
        id: newId,
        organizationId: user.organizationId,
        stationId,
        businessDate,
        snapshotData: aggregated,
        generatedAt: new Date(),
      });

      dssrRecord = {
        id: newId,
        organizationId: user.organizationId,
        stationId,
        businessDate,
        snapshotData: aggregated,
        generatedAt: new Date(),
      };
    }

    return c.json({ success: true, data: dssrRecord });
  } catch (err: any) {
    console.error('DSSR generate error:', err);
    return c.json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } }, 500);
  }
});

// GET /api/dssr/daily?stationId=&date=
dssrRouter.get('/daily', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  const stationId = c.req.query('stationId');
  const date = c.req.query('date');

  if (!stationId || !date) {
    return c.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'Missing stationId or date' } },
      400
    );
  }

  if (!hasStationAccess(user, stationId)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this station' } }, 403);
  }

  try {
    const [dssr] = await db
      .select()
      .from(schema.dssrSnapshots)
      .where(
        and(
          eq(schema.dssrSnapshots.stationId, stationId),
          eq(schema.dssrSnapshots.businessDate, date),
          eq(schema.dssrSnapshots.organizationId, user.organizationId)
        )
      );

    if (!dssr) {
      return c.json({ success: true, data: null });
    }

    return c.json({ success: true, data: dssr });
  } catch (err: any) {
    return c.json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } }, 500);
  }
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
      { success: false, error: { code: 'BAD_REQUEST', message: 'Missing stationId, from, or to' } },
      400
    );
  }

  if (!hasStationAccess(user, stationId)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this station' } }, 403);
  }

  try {
    const list = await db
      .select()
      .from(schema.dssrSnapshots)
      .where(
        and(
          eq(schema.dssrSnapshots.stationId, stationId),
          eq(schema.dssrSnapshots.organizationId, user.organizationId),
          gte(schema.dssrSnapshots.businessDate, from),
          lt(schema.dssrSnapshots.businessDate, to)
        )
      )
      .orderBy(desc(schema.dssrSnapshots.businessDate));

    return c.json({ success: true, data: list });
  } catch (err: any) {
    return c.json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } }, 500);
  }
});
