import { Hono } from 'hono';
import { eq, and, desc, inArray, ne } from 'drizzle-orm';
import { schema, DbClient } from '@pump/db';
import {
  shiftOpenSchema,
  shiftCloseSchema,
  attendantHandoverSchema,
  canOpenShift,
  canCloseShift,
  canReopenShift,
  Role,
} from '@pump/shared';
import { compileDssrSnapshot } from './transactions.js';
import { z } from 'zod';
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

export const shiftsRouter = new Hono<{ Variables: Variables }>();

// Helper to check if user belongs/has access to station
function hasStationAccess(user: any, stationId: string): boolean {
  if (user.role === 'Owner') return true;
  return user.assignedStationIds.includes(stationId);
}

// GET /api/shifts/status
shiftsRouter.get('/status', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  const stationId = c.req.query('stationId');
  const lite = c.req.query('lite') === 'true';

  if (!stationId) {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Missing stationId' } }, 400);
  }

  if (!hasStationAccess(user, stationId)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this station' } }, 403);
  }

  try {
    // 1. Fetch Station configuration
    const [station] = await db
      .select()
      .from(schema.stations)
      .where(and(eq(schema.stations.id, stationId), eq(schema.stations.organizationId, user.organizationId)));

    if (!station) {
      return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Station not found' } }, 404);
    }

    const graceMinutes = (station.settings as any)?.shift_grace_minutes ?? 15;

    // 2. Fetch Active Shift (status = 'OPEN')
    const [dbActiveShift] = await db
      .select()
      .from(schema.shifts)
      .where(and(eq(schema.shifts.stationId, stationId), eq(schema.shifts.status, 'OPEN')))
      .limit(1);

    let activeShift = null;
    if (dbActiveShift) {
      // Get template info
      const [template] = await db
        .select()
        .from(schema.shiftTemplates)
        .where(eq(schema.shiftTemplates.id, dbActiveShift.shiftTemplateId))
        .limit(1);

      // Get opened by user
      const [openedByUser] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, dbActiveShift.openedBy))
        .limit(1);

      // Get active nozzle readings (single JOIN)
      const nozzleReadingRows = await db
        .select({
          nr: schema.nozzleReadings,
          nz: schema.nozzles,
          prod: schema.products,
          tnk: schema.tanks,
          du: schema.dispenserUnits,
        })
        .from(schema.nozzleReadings)
        .leftJoin(schema.nozzles, eq(schema.nozzles.id, schema.nozzleReadings.nozzleId))
        .leftJoin(schema.products, eq(schema.products.id, schema.nozzles.productId))
        .leftJoin(schema.tanks, eq(schema.tanks.id, schema.nozzles.tankId))
        .leftJoin(schema.dispenserUnits, eq(schema.dispenserUnits.id, schema.nozzles.duId))
        .where(eq(schema.nozzleReadings.shiftId, dbActiveShift.id));

      const enrichedReadings = nozzleReadingRows.map(({ nr, nz, prod, tnk, du }) => ({
        ...nr,
        nozzleName: nz?.name ?? 'Unknown',
        productName: prod?.name ?? 'Unknown',
        productCode: prod?.code ?? 'Unknown',
        tankName: tnk?.name ?? 'Unknown',
        duId: nz?.duId ?? null,
        duName: du?.name ?? 'Unknown',
        duCode: du?.code ?? 'Unknown',
      }));

      // Get staff assignments (single JOIN)
      const assignmentRows = await db
        .select({
          sa: schema.shiftStaffAssignments,
          staffUser: schema.users,
          du: schema.dispenserUnits,
        })
        .from(schema.shiftStaffAssignments)
        .leftJoin(schema.users, eq(schema.users.id, schema.shiftStaffAssignments.userId))
        .leftJoin(schema.dispenserUnits, eq(schema.dispenserUnits.id, schema.shiftStaffAssignments.duId))
        .where(eq(schema.shiftStaffAssignments.shiftId, dbActiveShift.id));

      const enrichedAssignments = assignmentRows.map(({ sa, staffUser, du }) => ({
        ...sa,
        userName: staffUser?.fullName ?? 'Unknown',
        duName: du?.name ?? 'Unknown',
        duCode: du?.code ?? 'Unknown',
      }));

      // Get recorded handovers for the active shift
      const rawHandovers = await db
        .select()
        .from(schema.attendantHandovers)
        .where(eq(schema.attendantHandovers.shiftId, dbActiveShift.id));

      activeShift = {
        ...dbActiveShift,
        templateName: template?.name ?? 'Custom',
        openedByName: openedByUser?.fullName ?? 'System',
        nozzleReadings: enrichedReadings,
        staffAssignments: enrichedAssignments,
        handovers: rawHandovers,
      };
    }

    // 3. Fetch Last Closed Shift (status = 'CLOSED' or 'LOCKED')
    const [dbLastShift] = await db
      .select()
      .from(schema.shifts)
      .where(and(eq(schema.shifts.stationId, stationId), ne(schema.shifts.status, 'OPEN')))
      .orderBy(desc(schema.shifts.closedAt), desc(schema.shifts.createdAt))
      .limit(1);

    let lastShift = null;
    let lastDssr = null;
    let canReopenLastShift = false;
    let gracePeriodExpiresAt = null;

    if (dbLastShift) {
      let currentStatus = dbLastShift.status;
      let lockedAt = dbLastShift.lockedAt;

      // Self-Healing Lock Transition Check (read-only; actual write happens in POST /auto-lock)
      if (currentStatus === 'CLOSED' && dbLastShift.closedAt) {
        const closedTime = new Date(dbLastShift.closedAt).getTime();
        const lockGraceDays = (station?.settings as any)?.shift_lock_grace_days ?? 3;
        const lockExpiryTime = closedTime + lockGraceDays * 24 * 60 * 60 * 1000;
        const now = Date.now();

        if (now > lockExpiryTime) {
          lockedAt = new Date(lockExpiryTime);
          currentStatus = 'LOCKED';
        } else {
          // Reopen grace minutes check
          const reopenExpiryTime = closedTime + graceMinutes * 60 * 1000;
          if (now <= reopenExpiryTime) {
            gracePeriodExpiresAt = new Date(reopenExpiryTime).toISOString();
          }
        }
      }

      // Get template name
      const [template] = await db
        .select()
        .from(schema.shiftTemplates)
        .where(eq(schema.shiftTemplates.id, dbLastShift.shiftTemplateId))
        .limit(1);

      // Get closed by user
      let closedByName = 'System';
      if (dbLastShift.closedBy) {
        const [closedByUser] = await db
          .select()
          .from(schema.users)
          .where(eq(schema.users.id, dbLastShift.closedBy))
          .limit(1);
        closedByName = closedByUser?.fullName ?? 'System';
      }

      // Check reopen permission
      if (currentStatus === 'CLOSED' && gracePeriodExpiresAt && canReopenShift(user.role)) {
        canReopenLastShift = true;
      }

      lastShift = {
        ...dbLastShift,
        status: currentStatus,
        lockedAt,
        templateName: template?.name ?? 'Custom',
        closedByName,
      };

      // Fetch DSSR snapshot
      const [dssr] = await db
        .select()
        .from(schema.dssrSnapshots)
        .where(eq(schema.dssrSnapshots.shiftId, dbLastShift.id))
        .limit(1);
      lastDssr = dssr ?? null;
    }

    // Query recent closed shifts that are not locked
    const dbClosedShifts = await db
      .select({
        shift: schema.shifts,
        templateName: schema.shiftTemplates.name
      })
      .from(schema.shifts)
      .leftJoin(schema.shiftTemplates, eq(schema.shifts.shiftTemplateId, schema.shiftTemplates.id))
      .where(and(eq(schema.shifts.stationId, stationId), eq(schema.shifts.status, 'CLOSED')))
      .orderBy(desc(schema.shifts.closedAt));

    const lockGraceDays = (station?.settings as any)?.shift_lock_grace_days ?? 3;
    const now = Date.now();
    const recentClosedShifts = [];

    for (const item of dbClosedShifts) {
      const s = item.shift;
      if (s.closedAt) {
        const closedTime = new Date(s.closedAt).getTime();
        const lockExpiryTime = closedTime + lockGraceDays * 24 * 60 * 60 * 1000;

        // Filter out shifts whose grace expired; write happens in POST /auto-lock
        if (now <= lockExpiryTime) {
          recentClosedShifts.push({
            ...s,
            templateName: item.templateName ?? 'Custom',
          });
        }
      }
    }

    if (lite) {
      return c.json({
        success: true,
        data: {
          activeShift,
          lastShift,
          lastDssr,
          canReopenLastShift,
          gracePeriodExpiresAt,
          recentClosedShifts,
        },
      });
    }

    // 4. Fetch additional setup helpers for open/assignment
    const templates = await db
      .select()
      .from(schema.shiftTemplates)
      .where(and(eq(schema.shiftTemplates.organizationId, user.organizationId), eq(schema.shiftTemplates.isActive, true)));

    const nozzleRows = await db
      .select({
        nz: schema.nozzles,
        prod: schema.products,
        tnk: schema.tanks,
      })
      .from(schema.nozzles)
      .leftJoin(schema.products, eq(schema.products.id, schema.nozzles.productId))
      .leftJoin(schema.tanks, eq(schema.tanks.id, schema.nozzles.tankId))
      .where(and(eq(schema.nozzles.stationId, stationId), eq(schema.nozzles.organizationId, user.organizationId)));

    const nozzles = nozzleRows.map(({ nz, prod, tnk }) => ({
      ...nz,
      productName: prod?.name ?? 'Unknown',
      productCode: prod?.code ?? 'Unknown',
      tankName: tnk?.name ?? 'Unknown',
    }));

    const staff = await db
      .select()
      .from(schema.users)
      .where(and(eq(schema.users.organizationId, user.organizationId), eq(schema.users.status, 'ACTIVE')));

    const dispensers = await db
      .select()
      .from(schema.dispenserUnits)
      .where(and(eq(schema.dispenserUnits.stationId, stationId), eq(schema.dispenserUnits.status, 'ACTIVE')));

    return c.json({
      success: true,
      data: {
        activeShift,
        lastShift,
        lastDssr,
        canReopenLastShift,
        gracePeriodExpiresAt,
        recentClosedShifts,
        templates,
        nozzles,
        staff,
        dispensers,
      },
    });
  } catch (err: any) {
    return c.json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } }, 500);
  }
});

// POST /api/shifts/auto-lock
// Locks any CLOSED shift whose lock-grace period has expired.
// Optional body: { stationId } to scope; otherwise scans all stations the caller can access.
shiftsRouter.post('/auto-lock', async (c) => {
  const db = c.var.db;
  const user = c.var.user;

  let body: { stationId?: string } = {};
  try { body = await c.req.json(); } catch { /* no body */ }

  const stationIds = body.stationId
    ? [body.stationId]
    : (user.role === 'Owner' ? null : user.assignedStationIds);

  if (stationIds && stationIds.length === 0) {
    return c.json({ success: true, data: { locked: 0 } });
  }

  const stationFilter = stationIds
    ? and(eq(schema.shifts.organizationId, user.organizationId), eq(schema.shifts.status, 'CLOSED'), inArray(schema.shifts.stationId, stationIds))
    : and(eq(schema.shifts.organizationId, user.organizationId), eq(schema.shifts.status, 'CLOSED'));

  const closed = await db
    .select({ shift: schema.shifts, settings: schema.stations.settings })
    .from(schema.shifts)
    .innerJoin(schema.stations, eq(schema.stations.id, schema.shifts.stationId))
    .where(stationFilter);

  const now = Date.now();
  const toLock: { id: string; lockedAt: Date }[] = [];
  for (const { shift, settings } of closed) {
    if (!shift.closedAt) continue;
    const lockGraceDays = (settings as any)?.shift_lock_grace_days ?? 3;
    const expiry = new Date(shift.closedAt).getTime() + lockGraceDays * 24 * 60 * 60 * 1000;
    if (now > expiry) {
      toLock.push({ id: shift.id, lockedAt: new Date(expiry) });
    }
  }

  for (const { id, lockedAt } of toLock) {
    await db
      .update(schema.shifts)
      .set({ status: 'LOCKED', lockedAt, updatedAt: new Date() })
      .where(eq(schema.shifts.id, id));
  }

  return c.json({ success: true, data: { locked: toLock.length } });
});

// POST /api/shifts/open
shiftsRouter.post('/open', validateJson(shiftOpenSchema), async (c) => {
  const db = c.var.db;
  const user = c.var.user;

  if (!canOpenShift(user.role)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient role permissions to open shift' } }, 403);
  }

  const parsed = c.req.valid('json');

  try {
    if (!hasStationAccess(user, parsed.stationId)) {
      return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this station' } }, 403);
    }

    const [station] = await db
      .select()
      .from(schema.stations)
      .where(and(eq(schema.stations.id, parsed.stationId), eq(schema.stations.organizationId, user.organizationId)))
      .limit(1);

    if (!station) {
      return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Station not found' } }, 404);
    }

    // Check if there is an active shift
    const [existing] = await db
      .select()
      .from(schema.shifts)
      .where(and(eq(schema.shifts.stationId, parsed.stationId), eq(schema.shifts.status, 'OPEN')))
      .limit(1);

    if (existing) {
      return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'A shift is already active at this station.' } }, 400);
    }

    // Insert shift
    const [newShift] = await db
      .insert(schema.shifts)
      .values({
        organizationId: user.organizationId,
        stationId: parsed.stationId,
        shiftTemplateId: parsed.shiftTemplateId,
        status: 'OPEN',
        openedBy: user.id,
        openedAt: new Date(),
        openingCash: String(parsed.openingCash),
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    // Insert staff assignments if any (batched)
    if (parsed.staffAssignments && parsed.staffAssignments.length > 0) {
      await db.insert(schema.shiftStaffAssignments).values(
        parsed.staffAssignments.map((assign: any) => ({
          shiftId: newShift.id,
          userId: assign.userId,
          duId: assign.duId,
          assignedAt: new Date(),
        }))
      );
    }

    // Fetch all nozzles for this station
    const nozzles = await db
      .select()
      .from(schema.nozzles)
      .where(eq(schema.nozzles.stationId, parsed.stationId));

    // Pre-fetch latest readings + latest prices for all nozzles in two queries
    const nozzleIds = nozzles.map((n) => n.id);
    const productIds = Array.from(new Set(nozzles.map((n) => n.productId)));

    const allPastReadings = nozzleIds.length > 0
      ? await db
          .select()
          .from(schema.nozzleReadings)
          .where(inArray(schema.nozzleReadings.nozzleId, nozzleIds))
          .orderBy(desc(schema.nozzleReadings.createdAt))
      : [];
    const lastReadingByNozzle = new Map<string, typeof allPastReadings[number]>();
    for (const r of allPastReadings) {
      if (!lastReadingByNozzle.has(r.nozzleId)) lastReadingByNozzle.set(r.nozzleId, r);
    }

    const allPrices = productIds.length > 0
      ? await db
          .select()
          .from(schema.fuelPrices)
          .where(
            and(
              eq(schema.fuelPrices.stationId, parsed.stationId),
              inArray(schema.fuelPrices.productId, productIds)
            )
          )
          .orderBy(desc(schema.fuelPrices.effectiveFrom))
      : [];
    const latestPriceByProduct = new Map<string, typeof allPrices[number]>();
    for (const p of allPrices) {
      if (!latestPriceByProduct.has(p.productId)) latestPriceByProduct.set(p.productId, p);
    }

    // Build and batch-insert nozzle readings
    const nozzleReadingInserts = nozzles.map((nozzle) => {
      const lastReading = lastReadingByNozzle.get(nozzle.id);
      let openingVal = 0;
      if (lastReading) {
        openingVal = Number(lastReading.closingReading);
      } else {
        const initial = parsed.initialReadings?.find((ir: any) => ir.nozzleId === nozzle.id);
        openingVal = initial ? initial.openingReading : Number(nozzle.currentReading);
      }
      const priceRec = latestPriceByProduct.get(nozzle.productId);
      const unitPriceVal = priceRec ? priceRec.price : '0';
      return {
        shiftId: newShift.id,
        nozzleId: nozzle.id,
        openingReading: String(openingVal),
        closingReading: String(openingVal),
        volumeSold: '0',
        unitPrice: String(unitPriceVal),
        createdAt: new Date(),
      };
    });

    if (nozzleReadingInserts.length > 0) {
      await db.insert(schema.nozzleReadings).values(nozzleReadingInserts);
    }

    const pendingOpeningStockSeed = Array.isArray((station.settings as any)?.pending_opening_stock_seed)
      ? (station.settings as any).pending_opening_stock_seed
      : [];

    if (pendingOpeningStockSeed.length > 0) {
      await db.insert(schema.stockMovements).values(
        pendingOpeningStockSeed.map((seed: any) => ({
          shiftId: newShift.id,
          productId: seed.productId,
          tankId: seed.tankId,
          movementType: 'OpeningBalance',
          quantity: String(seed.quantity),
          referenceType: 'ONBOARDING',
          notes: 'Opening stock seeded from onboarding go-live setup',
          createdAt: new Date(),
        }))
      );

      await db
        .update(schema.stations)
        .set({
          settings: {
            ...(station.settings as Record<string, unknown>),
            pending_opening_stock_seed: [],
          },
          updatedAt: new Date(),
        })
        .where(eq(schema.stations.id, station.id));
    }

    // Log Business Event
    await db.insert(schema.businessEvents).values({
      eventId: crypto.randomUUID(),
      eventType: 'SHIFT_OPENED',
      organizationId: user.organizationId,
      stationId: parsed.stationId,
      entityType: 'SHIFT',
      entityId: newShift.id,
      payload: {
        shiftId: newShift.id,
        openedBy: user.id,
        openedAt: newShift.openedAt,
        openingCash: parsed.openingCash,
      },
      occurredAt: new Date(),
    });

    return c.json({ success: true, data: newShift });
  } catch (err: any) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: err.message } }, 400);
  }
});

// PUT /api/shifts/readings
shiftsRouter.put('/readings', async (c) => {
  const db = c.var.db;
  const user = c.var.user;

  try {
    const body = await c.req.json();
    const { shiftId, readings } = body;

    if (!shiftId || !readings || !Array.isArray(readings)) {
      return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Missing shiftId or readings array' } }, 400);
    }

    const [activeShift] = await db
      .select()
      .from(schema.shifts)
      .where(and(eq(schema.shifts.id, shiftId), eq(schema.shifts.status, 'OPEN')))
      .limit(1);

    if (!activeShift) {
      return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Shift is not active or not found' } }, 400);
    }

    if (!hasStationAccess(user, activeShift.stationId)) {
      return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this station' } }, 403);
    }

    for (const rd of readings) {
      const [nr] = await db
        .select()
        .from(schema.nozzleReadings)
        .where(and(eq(schema.nozzleReadings.shiftId, shiftId), eq(schema.nozzleReadings.nozzleId, rd.nozzleId)))
        .limit(1);

      if (nr) {
        const opening = Number(nr.openingReading);
        const closing = Number(rd.closingReading);
        const volume = Math.max(0, closing - opening);

        await db
          .update(schema.nozzleReadings)
          .set({
            closingReading: String(closing),
            volumeSold: String(volume),
          })
          .where(eq(schema.nozzleReadings.id, nr.id));
      }
    }

    return c.json({ success: true, message: 'Readings updated successfully' });
  } catch (err: any) {
    return c.json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } }, 500);
  }
});

const shiftCloseRequestSchema = z.object({
  shiftId: z.string().uuid('Invalid shift ID'),
  payload: shiftCloseSchema,
});

// POST /api/shifts/close
shiftsRouter.post('/close', validateJson(shiftCloseRequestSchema), async (c) => {
  const db = c.var.db;
  const user = c.var.user;

  if (!canCloseShift(user.role)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient role permissions to close shift' } }, 403);
  }

  const { shiftId, payload: parsed } = c.req.valid('json');

  try {
    const [activeShift] = await db
      .select()
      .from(schema.shifts)
      .where(and(eq(schema.shifts.id, shiftId), eq(schema.shifts.status, 'OPEN')))
      .limit(1);

    if (!activeShift) {
      return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Shift is not open or not found' } }, 400);
    }

    if (!hasStationAccess(user, activeShift.stationId)) {
      return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this station' } }, 403);
    }

    // Fetch all nozzle readings for this shift to validate completeness
    const rawNozzleReadings = await db
      .select()
      .from(schema.nozzleReadings)
      .where(eq(schema.nozzleReadings.shiftId, shiftId));

    // Ensure all active nozzles for the station are recorded in the readings list
    const activeNozzles = await db
      .select()
      .from(schema.nozzles)
      .where(eq(schema.nozzles.stationId, activeShift.stationId));

    for (const nozzle of activeNozzles) {
      const match = parsed.nozzleReadings.find((r: any) => r.nozzleId === nozzle.id);
      if (!match) {
        return c.json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: `Missing closing reading input for nozzle ${nozzle.name}`,
          },
        }, 400);
      }

      // Check opening reading in DB for this shift
      const dbNr = rawNozzleReadings.find((r) => r.nozzleId === nozzle.id);
      const opening = dbNr ? Number(dbNr.openingReading) : 0;
      if (match.closingReading < opening) {
        return c.json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: `Closing reading for nozzle ${nozzle.name} (${match.closingReading}) cannot be less than opening reading (${opening})`,
          },
        }, 400);
      }
    }

    // Pre-fetch nozzles + products for all readings in one query
    const readingNozzleIds = parsed.nozzleReadings.map((rd: any) => rd.nozzleId);
    const nzProdRows = readingNozzleIds.length > 0
      ? await db
          .select({ nz: schema.nozzles, prod: schema.products })
          .from(schema.nozzles)
          .leftJoin(schema.products, eq(schema.products.id, schema.nozzles.productId))
          .where(inArray(schema.nozzles.id, readingNozzleIds))
      : [];
    const nzMap = new Map(nzProdRows.map((r) => [r.nz.id, r]));

    // Process and update nozzle readings, calculating final volumeSold
    const enrichedReadingsSnapshot: any[] = [];
    const stockMovementInserts: typeof schema.stockMovements.$inferInsert[] = [];
    for (const rd of parsed.nozzleReadings) {
      const dbNr = rawNozzleReadings.find((r) => r.nozzleId === rd.nozzleId);
      const opening = dbNr ? Number(dbNr.openingReading) : 0;
      const closing = rd.closingReading;
      const volume = closing - opening;

      await db
        .update(schema.nozzleReadings)
        .set({
          closingReading: String(closing),
          volumeSold: String(volume),
        })
        .where(and(eq(schema.nozzleReadings.shiftId, shiftId), eq(schema.nozzleReadings.nozzleId, rd.nozzleId)));

      // Also update the core nozzles table to hold the new closing reading as the current reading
      await db
        .update(schema.nozzles)
        .set({
          currentReading: String(closing),
          updatedAt: new Date(),
        })
        .where(eq(schema.nozzles.id, rd.nozzleId));

      const entry = nzMap.get(rd.nozzleId);
      const nz = entry?.nz ?? null;
      const prod = entry?.prod ?? null;

      // Record inventory consumption (Sale) — batched insert below
      if (nz && nz.productId && volume > 0) {
        stockMovementInserts.push({
          shiftId,
          productId: nz.productId,
          tankId: nz.tankId,
          movementType: 'Sale',
          quantity: String(-volume),
          referenceType: 'NOZZLE_READING',
          referenceId: rd.nozzleId,
          notes: `Sales from nozzle ${nz.name}`,
          createdAt: new Date(),
        });
      }

      enrichedReadingsSnapshot.push({
        nozzleId: rd.nozzleId,
        nozzleName: nz?.name ?? 'Unknown',
        productName: prod?.name ?? 'Unknown',
        productCode: prod?.code ?? 'Unknown',
        openingReading: opening,
        closingReading: closing,
        volumeSold: volume,
      });
    }

    if (stockMovementInserts.length > 0) {
      await db.insert(schema.stockMovements).values(stockMovementInserts);
    }

    // Process actual physical dip readings
    if (parsed.dipReadings && parsed.dipReadings.length > 0) {
      // Fetch all tanks for this station
      const stationTanks = await db
        .select()
        .from(schema.tanks)
        .where(and(eq(schema.tanks.stationId, activeShift.stationId), eq(schema.tanks.organizationId, user.organizationId)));

      // Reconcile and calculate variance per tank
      for (const dr of parsed.dipReadings) {
        const tank = stationTanks.find((t) => t.id === dr.tankId);
        if (!tank) continue;

        // Sum of all stock movements for this specific tank in this station (including the nozzle sales just inserted)
        const movements = await db
          .select({
            quantity: schema.stockMovements.quantity,
          })
          .from(schema.stockMovements)
          .innerJoin(schema.shifts, eq(schema.stockMovements.shiftId, schema.shifts.id))
          .where(
            and(
              eq(schema.shifts.stationId, activeShift.stationId),
              eq(schema.stockMovements.tankId, tank.id)
            )
          );

        const expectedStock = movements.reduce((sum, m) => sum + Number(m.quantity), 0);
        const variance = dr.actualQuantity - expectedStock;

        // Insert stock variance
        const [insertedVariance] = await db
          .insert(schema.stockVariances)
          .values({
            shiftId,
            productId: tank.productId,
            tankId: tank.id,
            expectedQuantity: String(expectedStock),
            actualQuantity: String(dr.actualQuantity),
            varianceQuantity: String(variance),
            reason: variance !== 0 ? `Physical reconciliation variance at shift close for tank ${tank.name}` : 'No variance',
            createdAt: new Date(),
          })
          .returning();

        // Adjust ledger to match physical reading via Variance movement
        if (variance !== 0) {
          await db.insert(schema.stockMovements).values({
            shiftId,
            productId: tank.productId,
            tankId: tank.id,
            movementType: 'Variance',
            quantity: String(variance),
            referenceType: 'STOCK_VARIANCE',
            referenceId: insertedVariance.id,
            notes: `Physical reconciliation adjustment for tank ${tank.name} (expected: ${expectedStock}, actual: ${dr.actualQuantity})`,
            createdAt: new Date(),
          });
        }
      }
    }

    const closedAt = new Date();

    // Update shift status to CLOSED
    const [closedShift] = await db
      .update(schema.shifts)
      .set({
        status: 'CLOSED',
        closedBy: user.id,
        closedAt,
        closingCash: String(parsed.closingCash),
        updatedAt: closedAt,
      })
      .where(eq(schema.shifts.id, shiftId))
      .returning();

    // Compile DSSR Snapshot reactively with closing dip readings
    await compileDssrSnapshot(db, shiftId, parsed.dipReadings);

    // Retrieve the compiled snapshot data
    const [dssr] = await db
      .select()
      .from(schema.dssrSnapshots)
      .where(eq(schema.dssrSnapshots.shiftId, shiftId))
      .limit(1);

    const snapshotData = dssr?.snapshotData || {};

    // Log Business Event
    await db.insert(schema.businessEvents).values({
      eventId: crypto.randomUUID(),
      eventType: 'SHIFT_CLOSED',
      organizationId: user.organizationId,
      stationId: activeShift.stationId,
      entityType: 'SHIFT',
      entityId: shiftId,
      payload: snapshotData as any,
      occurredAt: closedAt,
    });

    return c.json({ success: true, data: closedShift });
  } catch (err: any) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: err.message } }, 400);
  }
});

// POST /api/shifts/reopen
shiftsRouter.post('/reopen', async (c) => {
  const db = c.var.db;
  const user = c.var.user;

  if (!canReopenShift(user.role)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Only Owners and Managers are allowed to reopen shifts.' } }, 403);
  }

  try {
    const body = await c.req.json();
    const { shiftId } = body;

    if (!shiftId) {
      return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Missing shiftId' } }, 400);
    }

    const [shift] = await db
      .select()
      .from(schema.shifts)
      .where(eq(schema.shifts.id, shiftId))
      .limit(1);

    if (!shift) {
      return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Shift not found' } }, 404);
    }

    if (!hasStationAccess(user, shift.stationId)) {
      return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this station' } }, 403);
    }

    if (shift.status !== 'CLOSED') {
      return c.json({ success: false, error: { code: 'BAD_REQUEST', message: `Cannot reopen shift with status: ${shift.status}` } }, 400);
    }

    // Verify grace period
    const [station] = await db
      .select()
      .from(schema.stations)
      .where(eq(schema.stations.id, shift.stationId))
      .limit(1);

    const graceMinutes = (station?.settings as any)?.shift_grace_minutes ?? 15;
    const closedTime = shift.closedAt ? new Date(shift.closedAt).getTime() : 0;
    const expiryTime = closedTime + graceMinutes * 60 * 1000;

    if (Date.now() > expiryTime) {
      // Grace period expired, lock it instead of reopening
      await db
        .update(schema.shifts)
        .set({
          status: 'LOCKED',
          lockedAt: new Date(expiryTime),
          updatedAt: new Date(),
        })
        .where(eq(schema.shifts.id, shiftId));

      return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Reopen grace period has expired. Shift is locked.' } }, 403);
    }

    // Transition state back to OPEN, nullify close details
    const [reopenedShift] = await db
      .update(schema.shifts)
      .set({
        status: 'OPEN',
        closedBy: null,
        closedAt: null,
        closingCash: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.shifts.id, shiftId))
      .returning();

    // Delete DSSR Snapshot (invalidating prior finality)
    await db
      .delete(schema.dssrSnapshots)
      .where(eq(schema.dssrSnapshots.shiftId, shiftId));

    // Log Business Event
    await db.insert(schema.businessEvents).values({
      eventId: crypto.randomUUID(),
      eventType: 'SHIFT_REOPENED',
      organizationId: user.organizationId,
      stationId: shift.stationId,
      entityType: 'SHIFT',
      entityId: shiftId,
      payload: {
        shiftId,
        reopenedBy: user.id,
        reopenedAt: reopenedShift.updatedAt,
      },
      occurredAt: new Date(),
    });

    return c.json({ success: true, data: reopenedShift });
  } catch (err: any) {
    return c.json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } }, 500);
  }
});

// GET /api/shifts/dssrs
shiftsRouter.get('/dssrs', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  const stationId = c.req.query('stationId');

  if (!stationId) {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Missing stationId' } }, 400);
  }

  if (!hasStationAccess(user, stationId)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this station' } }, 403);
  }

  try {
    const list = await db
      .select({
        id: schema.dssrSnapshots.id,
        shiftId: schema.dssrSnapshots.shiftId,
        generatedAt: schema.dssrSnapshots.generatedAt,
        snapshotData: schema.dssrSnapshots.snapshotData,
        shiftStatus: schema.shifts.status,
      })
      .from(schema.dssrSnapshots)
      .innerJoin(schema.shifts, eq(schema.dssrSnapshots.shiftId, schema.shifts.id))
      .where(eq(schema.shifts.stationId, stationId))
      .orderBy(desc(schema.dssrSnapshots.generatedAt));

    return c.json({ success: true, data: list });
  } catch (err: any) {
    return c.json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } }, 500);
  }
});

// GET /api/shifts/handovers
shiftsRouter.get('/handovers', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  const shiftId = c.req.query('shiftId');

  if (!shiftId) {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Missing shiftId' } }, 400);
  }

  try {
    const records = await db
      .select()
      .from(schema.attendantHandovers)
      .where(
        and(
          eq(schema.attendantHandovers.shiftId, shiftId),
          eq(schema.attendantHandovers.organizationId, user.organizationId)
        )
      );

    return c.json({ success: true, data: records });
  } catch (err: any) {
    return c.json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } }, 500);
  }
});

// POST /api/shifts/handovers
shiftsRouter.post('/handovers', validateJson(attendantHandoverSchema), async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  const parsed = c.req.valid('json');

  try {
    const [activeShift] = await db
      .select()
      .from(schema.shifts)
      .where(
        and(
          eq(schema.shifts.organizationId, user.organizationId),
          eq(schema.shifts.status, 'OPEN')
        )
      )
      .limit(1);

    if (!activeShift) {
      return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'No active shift found to record handover.' } }, 400);
    }

    // Update nozzle readings
    for (const nr of parsed.nozzleReadings) {
      const [dbNr] = await db
        .select()
        .from(schema.nozzleReadings)
        .where(
          and(
            eq(schema.nozzleReadings.shiftId, activeShift.id),
            eq(schema.nozzleReadings.nozzleId, nr.nozzleId)
          )
        )
        .limit(1);

      if (dbNr) {
        const opening = Number(dbNr.openingReading);
        const closing = nr.closingReading;
        const volume = Math.max(0, closing - opening);

        await db
          .update(schema.nozzleReadings)
          .set({
            closingReading: String(closing),
            volumeSold: String(volume),
          })
          .where(eq(schema.nozzleReadings.id, dbNr.id));
      }
    }

    // Check if handover record already exists
    const [existing] = await db
      .select()
      .from(schema.attendantHandovers)
      .where(
        and(
          eq(schema.attendantHandovers.shiftId, activeShift.id),
          eq(schema.attendantHandovers.userId, parsed.userId),
          eq(schema.attendantHandovers.duId, parsed.duId)
        )
      )
      .limit(1);

    let record;
    const values = {
      organizationId: user.organizationId,
      stationId: activeShift.stationId,
      shiftId: activeShift.id,
      userId: parsed.userId,
      duId: parsed.duId,
      cashHandedOver: String(parsed.cashHandedOver),
      cardHandedOver: String(parsed.cardHandedOver),
      upiHandedOver: String(parsed.upiHandedOver),
      creditHandedOver: String(parsed.creditHandedOver),
      testingVolume: String(parsed.testingVolume),
      expectedSales: String(parsed.expectedSales),
      varianceAmount: String(parsed.varianceAmount),
    };

    if (existing) {
      [record] = await db
        .update(schema.attendantHandovers)
        .set({
          ...values,
          createdAt: existing.createdAt
        })
        .where(eq(schema.attendantHandovers.id, existing.id))
        .returning();
    } else {
      [record] = await db
        .insert(schema.attendantHandovers)
        .values(values)
        .returning();
    }

    return c.json({ success: true, data: record });
  } catch (err: any) {
    return c.json({ success: false, error: { code: 'SERVER_ERROR', message: err.message } }, 500);
  }
});
