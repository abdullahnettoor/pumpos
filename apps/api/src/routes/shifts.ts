import { Hono } from 'hono';
import { and, desc, eq, gt, inArray, lt, ne, sql } from 'drizzle-orm';
import { schema, type DbClient } from '@pump/db';
import {
  attendantHandoverSchema,
  businessDateSettings,
  canOpenShift,
  canCloseShift,
  canReopenShift,
  canRecordHandover,
  isAuthorizedForStation,
  isAttendant,
  resolveBusinessDate,
  type Role,
} from '@pump/shared';
import {
  OpenShift,
  RecordNozzleReadings,
  CloseShift,
  ReopenShift,
  LockShift,
  OpenBusinessDay,
  CloseBusinessDayAndGenerateDssr,
  GetBusinessDayStatus,
  RecordHandover,
  type Result,
} from '@pump/core';
import { buildContext } from '../infra/context.js';
import type { AuthenticatedPrincipal } from '../infra/authenticated-principal.js';
import { loadStationClock } from '../infra/station-clock.js';
import { lockStationInventory, runInTransaction } from '../infra/transaction.js';
import {
  DrizzleNozzleRepository,
  DrizzleFuelPriceRepository,
} from '../infra/repositories/setup-repositories.js';
import {
  DrizzleBusinessDayRepository,
  DrizzleBusinessDayStatusReader,
  DrizzleShiftRepository,
  DrizzleNozzleReadingRepository,
  DrizzleShiftReconciliationReader,
  DrizzleCreditSalesReader,
  DrizzleStockMovementWriter,
  DrizzleShiftSummaryWriter,
  DrizzleHandoverContextReader,
  DrizzleHandoverRepository,
} from '../infra/repositories/station-ops-repositories.js';
import {
  DrizzleDssrDataReader,
  DrizzleDssrSnapshotRepository,
} from '../infra/repositories/reporting-repositories.js';
import { LedgerPostingService } from '../infra/ledger-posting.js';
import { DrizzleStockVarianceRepository } from '../infra/repositories/inventory-repositories.js';
import { DrizzleShiftSummaryProjector } from '../infra/shift-summary-projection.js';
import { sendResult } from '../infra/send-result.js';
import { writePolicyGuard } from '../infra/write-policy-guard.js';
import { validateJson } from '../utils/validator.js';
import { z } from 'zod';

type Variables = {
  db: DbClient;
  user: AuthenticatedPrincipal;
};

export const shiftsRouter = new Hono<{ Variables: Variables }>();

/**
 * Ids that arrive in the request body and are used to look a record up.
 *
 * They are validated at the edge rather than inside each handler, because an
 * absent or non-string id used to reach the driver as `undefined` and come
 * back as a bare 500 — outside the response envelope, and reported as a server
 * fault when it is a malformed request (#205).
 *
 * Both schemas pass the rest of the body through: the command payloads are
 * validated by the use-cases that own them, and duplicating those shapes here
 * would give the same rule two homes.
 */
const shiftIdBody = z
  .object({ shiftId: z.string().trim().min(1, 'shiftId is required') })
  .passthrough();

const stationIdBody = z
  .object({ stationId: z.string().trim().min(1, 'stationId is required') })
  .passthrough();

function canManageDay(role: Role): boolean {
  return role === 'Owner' || role === 'Manager';
}

// GET /api/shifts/business-days/status?stationId=...&date=YYYY-MM-DD
// A lightweight lifecycle read for desktop/console. Missing is explicit rather
// than being inferred from Shift state, and every Past Open Business Day is
// returned so Delayed Closure remains visible.
shiftsRouter.get('/business-days/status', async (c) => {
  const user = c.var.user;
  const stationId = c.req.query('stationId');
  if (!stationId) {
    return c.json(
      { success: false, error: { code: 'VALIDATION_ERROR', message: 'stationId is required' } },
      400,
    );
  }
  if (!isAuthorizedForStation(user, { organizationId: user.organizationId, stationId })) {
    return c.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'No access to this station' } },
      403,
    );
  }

  const clock = await loadStationClock(c.var.db, stationId);
  const currentBusinessDate = resolveBusinessDate({
    timeZone: clock.timeZone,
    dayStartsAt: clock.businessDayStartsAt,
  });
  const requestedBusinessDate = c.req.query('date') ?? currentBusinessDate;
  const result = await new GetBusinessDayStatus(
    new DrizzleBusinessDayStatusReader(c.var.db),
  ).execute(
    { stationId, requestedBusinessDate, currentBusinessDate },
    buildContext(user, { stationId, ...clock }),
  );
  return sendResult(c, result);
});

// GET /api/shifts/dashboard-summary?stationId=...
// The dashboard's single shift read (#147 / #113): open-shift identity,
// last-shift identity + a few stored-snapshot scalars, reopen/grace state, and
// the current business day's rollup aggregated in SQL over stored snapshots.
// Returns only what the dashboard renders — never full enrichment. Bounded
// query count regardless of shift history size.
shiftsRouter.get('/dashboard-summary', async (c) => {
  const user = c.var.user;
  const stationId = c.req.query('stationId');
  if (!stationId) {
    return c.json(
      { success: false, error: { code: 'VALIDATION_ERROR', message: 'stationId is required' } },
      400,
    );
  }
  if (!isAuthorizedForStation(user, { organizationId: user.organizationId, stationId })) {
    return c.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'No access to this station' } },
      403,
    );
  }
  const db = c.var.db;
  const orgId = user.organizationId;

  const [station] = await db
    .select()
    .from(schema.stations)
    .where(and(eq(schema.stations.id, stationId), eq(schema.stations.organizationId, orgId)))
    .limit(1);
  if (!station) {
    return c.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Station not found' } },
      404,
    );
  }
  const settings = (station.settings as any) ?? {};
  const graceMinutes = settings.shift_grace_minutes ?? 15;
  // Same timezone/day-start resolution as the rest of the API (loadStationClock
  // defaults), so the rollup's business date can never disagree with use-cases.
  const clockDefaults = businessDateSettings(station.settings ?? null);
  const todayBusinessDate = resolveBusinessDate({
    timeZone: clockDefaults.timeZone,
    dayStartsAt: clockDefaults.dayStartsAt,
  });
  const now = Date.now();

  // ONE round-trip for everything (#155): each query costs ~2-3 ms of Worker
  // CPU in driver serialize/parse alone, so the open-shift identity, the
  // last-shift card, and today's rollup are fetched as three CTEs in a single
  // statement. Timestamps are rendered as ISO-8601 UTC (matching what the
  // driver's Date serialization produced before) and columns are aliased to
  // the camelCase contract.
  const isoTs = (col: string) => `to_char(${col}, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
  const [row] = await db.execute(sql`
    WITH open_shift AS (
      SELECT
        s.id,
        s.business_day_id AS "businessDayId",
        COALESCE(t.name, 'Custom') AS "templateName",
        bd.business_date AS "businessDate",
        COALESCE(u.full_name, 'System') AS "openedByName",
        ${sql.raw(isoTs('s.opened_at'))} AS "openedAt",
        s.opening_cash AS "openingCash"
      FROM shifts s
      LEFT JOIN shift_templates t ON t.id = s.shift_template_id
      LEFT JOIN users u ON u.id = s.opened_by AND u.organization_id = s.organization_id
      LEFT JOIN business_days bd ON bd.id = s.business_day_id
      WHERE s.organization_id = ${orgId} AND s.station_id = ${stationId} AND s.status = 'OPEN'
      LIMIT 1
    ),
    last_shift AS (
      SELECT
        s.id,
        s.status,
        COALESCE(t.name, 'Custom') AS "templateName",
        ${sql.raw(isoTs('s.closed_at'))} AS "closedAt",
        bd.status AS "dayStatus",
        (ss.shift_id IS NOT NULL) AS "hasSummary",
        COALESCE((ss.snapshot_data ->> 'totalVolumeSold')::numeric,
                 (ss.snapshot_data ->> 'totalVolume')::numeric, 0) AS "totalVolumeSold",
        COALESCE((ss.snapshot_data ->> 'closingCash')::numeric, 0) AS "closingCash",
        COALESCE(ss.snapshot_data -> 'fuelByProduct', '[]'::jsonb) AS "fuelByProduct"
      FROM shifts s
      LEFT JOIN shift_templates t ON t.id = s.shift_template_id
      LEFT JOIN business_days bd ON bd.id = s.business_day_id
      LEFT JOIN shift_summaries ss ON ss.shift_id = s.id
      WHERE s.organization_id = ${orgId} AND s.station_id = ${stationId} AND s.status <> 'OPEN'
      ORDER BY s.closed_at DESC, s.created_at DESC
      LIMIT 1
    ),
    today AS (
      SELECT
        COUNT(*)::int AS "shiftsClosed",
        COALESCE(SUM((ss.snapshot_data ->> 'totalFuelSalesValue')::numeric), 0) AS "fuelSalesValue",
        COALESCE(SUM((ss.snapshot_data ->> 'totalVolume')::numeric), 0) AS "volume",
        COALESCE(SUM((ss.snapshot_data ->> 'cashVariance')::numeric), 0) AS "cashVariance"
      FROM shift_summaries ss
      JOIN shifts s ON s.id = ss.shift_id
      JOIN business_days bd ON bd.id = s.business_day_id
      WHERE s.organization_id = ${orgId} AND s.station_id = ${stationId}
        AND bd.business_date = ${todayBusinessDate}
    )
    SELECT
      (SELECT row_to_json(open_shift) FROM open_shift) AS open_shift,
      (SELECT row_to_json(last_shift) FROM last_shift) AS last_shift,
      (SELECT row_to_json(today) FROM today) AS today
  `);

  const openRaw = (row as any)?.open_shift as Record<string, any> | null;
  const lastRaw = (row as any)?.last_shift as Record<string, any> | null;
  const todayRaw = (row as any)?.today as Record<string, any> | null;

  const activeShift = openRaw
    ? {
        id: openRaw.id,
        businessDayId: openRaw.businessDayId,
        templateName: openRaw.templateName,
        businessDate: openRaw.businessDate ?? null,
        openedByName: openRaw.openedByName,
        openedAt: openRaw.openedAt,
        openingCash: openRaw.openingCash,
      }
    : null;

  let lastShift: any = null;
  let lastShiftSummary: any = null;
  let canReopenLastShift = false;
  let gracePeriodExpiresAt: string | null = null;
  if (lastRaw) {
    if (lastRaw.status === 'CLOSED' && lastRaw.closedAt) {
      const reopenExpiry = new Date(lastRaw.closedAt).getTime() + graceMinutes * 60 * 1000;
      if (now <= reopenExpiry) gracePeriodExpiresAt = new Date(reopenExpiry).toISOString();
    }
    if (
      lastRaw.status === 'CLOSED' &&
      lastRaw.dayStatus === 'OPEN' &&
      canReopenShift(user.role) &&
      !openRaw
    )
      canReopenLastShift = true;
    lastShift = {
      id: lastRaw.id,
      status: lastRaw.status,
      templateName: lastRaw.templateName,
      closedAt: lastRaw.closedAt,
    };
    lastShiftSummary = lastRaw.hasSummary
      ? {
          totalVolumeSold: Number(lastRaw.totalVolumeSold),
          closingCash: Number(lastRaw.closingCash),
          fuelUnits: Array.from(
            new Set(
              ((lastRaw.fuelByProduct as any[]) ?? []).map((p: any) => String(p?.unit ?? 'L')),
            ),
          ),
        }
      : null;
  }

  return c.json({
    success: true,
    data: {
      activeShift,
      lastShift,
      lastShiftSummary,
      canReopenLastShift,
      gracePeriodExpiresAt,
      today: {
        businessDate: todayBusinessDate,
        shiftsClosed: Number(todayRaw?.shiftsClosed ?? 0),
        fuelSalesValue: Number(todayRaw?.fuelSalesValue ?? 0),
        volume: Number(todayRaw?.volume ?? 0),
        cashVariance: Number(todayRaw?.cashVariance ?? 0),
      },
    },
  });
});

// GET /api/shifts/status?stationId=...
shiftsRouter.get('/status', async (c) => {
  const user = c.var.user;
  const stationId = c.req.query('stationId');
  const lite = c.req.query('lite') === 'true';
  if (!stationId) {
    return c.json(
      { success: false, error: { code: 'VALIDATION_ERROR', message: 'stationId is required' } },
      400,
    );
  }
  if (!isAuthorizedForStation(user, { organizationId: user.organizationId, stationId })) {
    return c.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'No access to this station' } },
      403,
    );
  }
  const db = c.var.db;
  const orgId = user.organizationId;

  const [station] = await db
    .select()
    .from(schema.stations)
    .where(and(eq(schema.stations.id, stationId), eq(schema.stations.organizationId, orgId)))
    .limit(1);
  if (!station) {
    return c.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Station not found' } },
      404,
    );
  }
  const settings = (station.settings as any) ?? {};
  const graceMinutes = settings.shift_grace_minutes ?? 15;
  const lockGraceDays = settings.shift_lock_grace_days ?? 3;
  const now = Date.now();

  // --- Lite mode: attribution context only, in ONE round-trip (#155) ---
  // Consumers (expense / collection / purchase entry, business-day tab, P&L)
  // need just the open shift's identity plus the grace-window closed shifts.
  // Each query costs ~2-3 ms of Worker CPU in driver work alone, so the open
  // business day, the enriched open shift, and the recent closed shifts are
  // fetched as CTEs in a single statement, shaped to the legacy camelCase
  // contract in SQL (timestamps as ISO-8601 UTC, matching Date serialization).
  if (lite) {
    // ISO string, not Date: raw-SQL params bypass drizzle's column mappers and
    // a JS Date would stringify to a format Postgres cannot parse.
    const graceCutoff = new Date(now - lockGraceDays * 24 * 60 * 60 * 1000).toISOString();
    const ts = (col: string) => sql.raw(`to_char(${col}, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`);
    const shiftJson = sql`jsonb_build_object(
      'id', s.id,
      'organizationId', s.organization_id,
      'stationId', s.station_id,
      'businessDayId', s.business_day_id,
      'shiftTemplateId', s.shift_template_id,
      'status', s.status,
      'openedBy', s.opened_by,
      'openedAt', ${ts('s.opened_at')},
      'closedBy', s.closed_by,
      'closedAt', ${ts('s.closed_at')},
      'lockedAt', ${ts('s.locked_at')},
      'openingCash', s.opening_cash,
      'closingCash', s.closing_cash,
      'createdAt', ${ts('s.created_at')},
      'updatedAt', ${ts('s.updated_at')}
    )`;
    const [row] = await db.execute(sql`
      WITH open_day AS (
        SELECT jsonb_build_object(
          'id', d.id,
          'organizationId', d.organization_id,
          'stationId', d.station_id,
          'businessDate', d.business_date,
          'status', d.status,
          'openedBy', d.opened_by,
          'openedAt', ${ts('d.opened_at')},
          'closedBy', d.closed_by,
          'closedAt', ${ts('d.closed_at')},
          'createdAt', ${ts('d.created_at')},
          'updatedAt', ${ts('d.updated_at')}
        ) AS j
        FROM business_days d
        WHERE d.station_id = ${stationId} AND d.status = 'OPEN'
        ORDER BY d.business_date DESC
        LIMIT 1
      ),
      open_shift AS (
        SELECT ${shiftJson} || jsonb_build_object(
          'templateName', COALESCE(t.name, 'Custom'),
          'businessDate', bd.business_date,
          'scheduledStartTime', t.start_time,
          'scheduledEndTime', t.end_time,
          'openedByName', COALESCE(u.full_name, 'System')
        ) AS j
        FROM shifts s
        LEFT JOIN shift_templates t ON t.id = s.shift_template_id
        LEFT JOIN users u ON u.id = s.opened_by AND u.organization_id = s.organization_id
        LEFT JOIN business_days bd ON bd.id = s.business_day_id
        WHERE s.organization_id = ${orgId} AND s.station_id = ${stationId} AND s.status = 'OPEN'
        LIMIT 1
      ),
      recent AS (
        SELECT ${shiftJson} || jsonb_build_object(
          'templateName', COALESCE(t.name, 'Custom')
        ) AS j
        FROM shifts s
        LEFT JOIN shift_templates t ON t.id = s.shift_template_id
        WHERE s.organization_id = ${orgId} AND s.station_id = ${stationId}
          AND s.status = 'CLOSED' AND s.closed_at > ${graceCutoff}
        ORDER BY s.closed_at DESC
        LIMIT 50
      )
      SELECT
        (SELECT j FROM open_day) AS business_day,
        (SELECT j FROM open_shift) AS active_shift,
        COALESCE((SELECT jsonb_agg(j) FROM recent), '[]'::jsonb) AS recent_closed
    `);

    const activeShiftJson = ((row as any)?.active_shift as Record<string, any> | null) ?? null;
    return c.json({
      success: true,
      data: {
        businessDay: ((row as any)?.business_day as Record<string, any> | null) ?? null,
        shift: activeShiftJson,
        readings: [],
        activeShift: activeShiftJson,
        lastShift: null,
        lastShiftSummary: null,
        canReopenLastShift: false,
        gracePeriodExpiresAt: null,
        recentClosedShifts: ((row as any)?.recent_closed as any[]) ?? [],
      },
    });
  }

  // Business day + active shift are independent — fetch together.
  const [businessDayRows, activeShiftRows] = await Promise.all([
    db
      .select()
      .from(schema.businessDays)
      .where(
        and(eq(schema.businessDays.stationId, stationId), eq(schema.businessDays.status, 'OPEN')),
      )
      .orderBy(desc(schema.businessDays.businessDate))
      .limit(1),
    db
      .select()
      .from(schema.shifts)
      .where(and(eq(schema.shifts.stationId, stationId), eq(schema.shifts.status, 'OPEN')))
      .limit(1),
  ]);
  const businessDay = businessDayRows[0];
  const dbActiveShift = activeShiftRows[0];

  // Recent closed shifts still inside the attribution grace window (SQL-filtered
  // and bounded — never scan the station's full shift history).
  const loadRecentClosedShifts = async () => {
    const graceCutoff = new Date(now - lockGraceDays * 24 * 60 * 60 * 1000);
    const rows = await db
      .select({ shift: schema.shifts, templateName: schema.shiftTemplates.name })
      .from(schema.shifts)
      .leftJoin(schema.shiftTemplates, eq(schema.shifts.shiftTemplateId, schema.shiftTemplates.id))
      .where(
        and(
          eq(schema.shifts.organizationId, orgId),
          eq(schema.shifts.stationId, stationId),
          eq(schema.shifts.status, 'CLOSED'),
          gt(schema.shifts.closedAt, graceCutoff),
        ),
      )
      .orderBy(desc(schema.shifts.closedAt))
      .limit(50);
    return rows.map((item) => ({ ...item.shift, templateName: item.templateName ?? 'Custom' }));
  };

  let activeShift: any = null;
  if (dbActiveShift) {
    const [templateRows2, openedByRows2, activeBusinessDayRows, nozzleReadingRows] =
      await Promise.all([
        db
          .select()
          .from(schema.shiftTemplates)
          .where(eq(schema.shiftTemplates.id, dbActiveShift.shiftTemplateId))
          .limit(1),
        db.select().from(schema.users).where(eq(schema.users.id, dbActiveShift.openedBy)).limit(1),
        db
          .select({ businessDate: schema.businessDays.businessDate })
          .from(schema.businessDays)
          .where(
            and(
              eq(schema.businessDays.id, dbActiveShift.businessDayId),
              eq(schema.businessDays.organizationId, orgId),
              eq(schema.businessDays.stationId, stationId),
            ),
          )
          .limit(1),
        db
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
          .where(eq(schema.nozzleReadings.shiftId, dbActiveShift.id)),
      ]);
    const template = templateRows2[0];
    const openedByUser = openedByRows2[0];
    const activeBusinessDay = activeBusinessDayRows[0];

    const nozzleReadings = nozzleReadingRows.map(({ nr, nz, prod, tnk, du }) => ({
      ...nr,
      nozzleName: nz?.name ?? 'Unknown',
      productId: nz?.productId ?? null,
      productName: prod?.name ?? 'Unknown',
      productCode: prod?.code ?? 'Unknown',
      unit: prod?.unit ?? 'L',
      tankName: tnk?.name ?? 'Unknown',
      duId: nz?.duId ?? null,
      duName: du?.name ?? 'Unknown',
      duCode: du?.code ?? 'Unknown',
    }));

    // --- Per-attendant attributed sales (for handover reconciliation) ---
    // Non-fuel merchandise sales (any payment method) and pure fleet fuel-on-credit
    // (referenceType CREDIT_SALE, i.e. not the ledger debit of a merchandise credit
    // sale) recorded by each attendant during this shift. These fold into the
    // attendant's expectedSales so their handover variance covers total
    // accountability, not just metered fuel.
    const [
      attributedSaleRows,
      creditLineRows,
      omcLineRows,
      assignmentRows,
      handoverRows,
      handoverEntryRows,
      terminalLinkRows,
    ] = await Promise.all([
      db
        .select({
          attendantId: schema.sales.attendantId,
          paymentMethod: schema.sales.paymentMethod,
          total: sql<string>`COALESCE(SUM(${schema.sales.totalAmount}), 0)`,
          nonCash: sql<string>`COALESCE(SUM(${schema.sales.nonCashAmount}), 0)`,
        })
        .from(schema.sales)
        .where(and(eq(schema.sales.shiftId, dbActiveShift.id), ne(schema.sales.saleType, 'Fuel')))
        .groupBy(schema.sales.attendantId, schema.sales.paymentMethod),
      db
        .select({
          ct: schema.customerTransactions,
          customerName: schema.customers.name,
          customerType: schema.customers.customerType,
          productName: schema.products.name,
          productCode: schema.products.code,
        })
        .from(schema.customerTransactions)
        .leftJoin(schema.customers, eq(schema.customers.id, schema.customerTransactions.customerId))
        .leftJoin(schema.products, eq(schema.products.id, schema.customerTransactions.productId))
        .where(
          and(
            eq(schema.customerTransactions.shiftId, dbActiveShift.id),
            eq(schema.customerTransactions.transactionType, 'Credit Sale'),
            eq(schema.customerTransactions.referenceType, 'CREDIT_SALE'),
          ),
        ),
      db
        .select({
          ct: schema.customerTransactions,
          customerName: schema.customers.name,
          customerType: schema.customers.customerType,
          productName: schema.products.name,
          productCode: schema.products.code,
        })
        .from(schema.customerTransactions)
        .leftJoin(schema.customers, eq(schema.customers.id, schema.customerTransactions.customerId))
        .leftJoin(schema.products, eq(schema.products.id, schema.customerTransactions.productId))
        .where(
          and(
            eq(schema.customerTransactions.shiftId, dbActiveShift.id),
            eq(schema.customerTransactions.transactionType, 'OMC Sale'),
            eq(schema.customerTransactions.referenceType, 'OMC_CARD_SALE'),
          ),
        ),
      db
        .select({
          sa: schema.shiftStaffAssignments,
          staffUser: schema.users,
          du: schema.dispenserUnits,
        })
        .from(schema.shiftStaffAssignments)
        .leftJoin(schema.users, eq(schema.users.id, schema.shiftStaffAssignments.userId))
        .leftJoin(
          schema.dispenserUnits,
          eq(schema.dispenserUnits.id, schema.shiftStaffAssignments.duId),
        )
        .where(eq(schema.shiftStaffAssignments.shiftId, dbActiveShift.id)),
      db
        .select()
        .from(schema.attendantHandovers)
        .where(eq(schema.attendantHandovers.shiftId, dbActiveShift.id)),
      db
        .select()
        .from(schema.handoverTerminalEntries)
        .where(eq(schema.handoverTerminalEntries.shiftId, dbActiveShift.id)),
      db
        .select({
          link: schema.shiftTerminalLinks,
          term: schema.paymentTerminals,
          du: schema.dispenserUnits,
        })
        .from(schema.shiftTerminalLinks)
        .leftJoin(
          schema.paymentTerminals,
          eq(schema.paymentTerminals.id, schema.shiftTerminalLinks.terminalId),
        )
        .leftJoin(
          schema.dispenserUnits,
          eq(schema.dispenserUnits.id, schema.shiftTerminalLinks.duId),
        )
        .where(eq(schema.shiftTerminalLinks.shiftId, dbActiveShift.id)),
    ]);

    // Per-(attendant, DU) fuel-on-credit LINE ITEMS declared in the DU handover.
    // These are the credit chits; each handover derives its credit total from
    // its own lines (and the receivable is already metered via the nozzle, so
    // it is NOT added to expectedSales — it sits on the declared side).
    const creditByUserDu = new Map<string, any[]>();
    for (const r of creditLineRows) {
      const key = `${r.ct.attendantId ?? ''}::${r.ct.duId ?? ''}`;
      const list = creditByUserDu.get(key) ?? [];
      list.push({
        id: r.ct.id,
        customerId: r.ct.customerId,
        customerName: r.customerName ?? 'Customer',
        customerType: r.customerType ?? null,
        vehicleId: r.ct.vehicleId,
        productId: r.ct.productId,
        productName: r.productName ?? null,
        productCode: r.productCode ?? null,
        quantity: r.ct.quantity != null ? Number(r.ct.quantity) : null,
        unitPrice: r.ct.unitPrice != null ? Number(r.ct.unitPrice) : null,
        amount: Number(r.ct.amount),
        notes: r.ct.notes ?? null,
      });
      creditByUserDu.set(key, list);
    }
    const creditSalesFor = (userId: string | null | undefined, duId: string | null | undefined) =>
      creditByUserDu.get(`${userId ?? ''}::${duId ?? ''}`) ?? [];

    // Per-(attendant, DU) OMC fleet-card sale LINE ITEMS declared in the DU
    // handover. Like credit, the fuel is metered via the nozzle so it is NOT
    // added to expectedSales — it sits on the declared side as a non-drawer
    // channel (the Oil Company settles it to the station's CMS account).
    const omcByUserDu = new Map<string, any[]>();
    for (const r of omcLineRows) {
      const key = `${r.ct.attendantId ?? ''}::${r.ct.duId ?? ''}`;
      const list = omcByUserDu.get(key) ?? [];
      list.push({
        id: r.ct.id,
        customerId: r.ct.customerId,
        customerName: r.customerName ?? null,
        customerType: r.customerType ?? null,
        vehicleId: r.ct.vehicleId,
        productId: r.ct.productId,
        productName: r.productName ?? null,
        productCode: r.productCode ?? null,
        quantity: r.ct.quantity != null ? Number(r.ct.quantity) : null,
        unitPrice: r.ct.unitPrice != null ? Number(r.ct.unitPrice) : null,
        amount: Number(r.ct.amount),
        notes: r.ct.notes ?? null,
      });
      omcByUserDu.set(key, list);
    }
    const omcSalesFor = (userId: string | null | undefined, duId: string | null | undefined) =>
      omcByUserDu.get(`${userId ?? ''}::${duId ?? ''}`) ?? [];

    // Merchandise (standalone) attribution per attendant. Merchandise reconciles
    // at shift close (drawer), NOT in the DU handover, so expectedExtra carries
    // merchandise only — fuel credit is handled via the credit lines above.
    const attributedMap = new Map<
      string,
      {
        merchandiseCash: number;
        merchandiseCard: number;
        merchandiseUpi: number;
        merchandiseCredit: number;
        merchandiseTotal: number;
        expectedExtra: number;
      }
    >();
    const ensureAttr = (id: string | null) => {
      if (!id) return null;
      let a = attributedMap.get(id);
      if (!a) {
        a = {
          merchandiseCash: 0,
          merchandiseCard: 0,
          merchandiseUpi: 0,
          merchandiseCredit: 0,
          merchandiseTotal: 0,
          expectedExtra: 0,
        };
        attributedMap.set(id, a);
      }
      return a;
    };
    for (const r of attributedSaleRows) {
      const a = ensureAttr(r.attendantId);
      if (!a) continue;
      const amt = Number(r.total) || 0;
      const nonCash = Number(r.nonCash) || 0;
      a.merchandiseTotal += amt;
      if (r.paymentMethod === 'Cash') {
        // Option B: a cash-recorded merch sale may have a non-cash (card/UPI)
        // portion that went to the terminal — only the cash remainder hits the drawer.
        a.merchandiseCash += amt - nonCash;
        a.merchandiseCard += nonCash;
      } else if (r.paymentMethod === 'Card') a.merchandiseCard += amt;
      else if (r.paymentMethod === 'UPI') a.merchandiseUpi += amt;
      else if (r.paymentMethod === 'Credit') a.merchandiseCredit += amt;
    }
    // Only the cash the attendant actually holds folds into their handover expected.
    for (const a of attributedMap.values()) a.expectedExtra = a.merchandiseCash;
    const emptyAttr = {
      merchandiseCash: 0,
      merchandiseCard: 0,
      merchandiseUpi: 0,
      merchandiseCredit: 0,
      merchandiseTotal: 0,
      expectedExtra: 0,
    };
    const attributedFor = (userId: string | null | undefined) =>
      (userId && attributedMap.get(userId)) || emptyAttr;

    const staffAssignments = assignmentRows.map(({ sa, staffUser, du }) => {
      const creditSales = creditSalesFor(sa.userId, sa.duId);
      const omcSales = omcSalesFor(sa.userId, sa.duId);
      return {
        ...sa,
        userName: staffUser?.fullName ?? 'Unknown',
        duName: du?.name ?? 'Unknown',
        duCode: du?.code ?? 'Unknown',
        attributed: attributedFor(sa.userId),
        creditSales,
        creditTotal: creditSales.reduce((s: number, l: any) => s + Number(l.amount), 0),
        omcSales,
        omcTotal: omcSales.reduce((s: number, l: any) => s + Number(l.amount), 0),
      };
    });

    const handovers = handoverRows.map((h) => ({
      ...h,
      attendantName:
        assignmentRows.find((a) => a.sa.userId === h.userId)?.staffUser?.fullName ?? 'Attendant',
      duName: assignmentRows.find((a) => a.du?.id === h.duId)?.du?.name ?? null,
      terminalEntries: handoverEntryRows.filter((e) => e.handoverId === h.id),
      attributed: attributedFor(h.userId),
      creditSales: creditSalesFor(h.userId, h.duId),
      creditTotal: creditSalesFor(h.userId, h.duId).reduce(
        (s: number, l: any) => s + Number(l.amount),
        0,
      ),
      omcSales: omcSalesFor(h.userId, h.duId),
      omcTotal: omcSalesFor(h.userId, h.duId).reduce(
        (s: number, l: any) => s + Number(l.amount),
        0,
      ),
    }));

    const terminalLinks = terminalLinkRows.map(({ link, term, du }) => ({
      id: link.id,
      terminalId: link.terminalId,
      duId: link.duId,
      label: term?.label ?? 'Unknown',
      provider: term?.provider ?? null,
      terminalCode: term?.terminalCode ?? null,
      supportsCard: term?.supportsCard ?? true,
      supportsUpi: term?.supportsUpi ?? true,
      duName: du?.name ?? null,
      duCode: du?.code ?? null,
    }));

    // Merchandise tracker data folded into the status payload so the panel
    // renders without a second round-trip (mirrors the /merchandise-handovers
    // and /merchandise-sales endpoints; the panel seeds its queries from these).
    const [merchHandoverRows, merchandiseSales] = await Promise.all([
      db
        .select({
          id: schema.sales.id,
          attendantId: schema.sales.attendantId,
          attendantName: schema.users.fullName,
          subtotalAmount: schema.sales.subtotalAmount,
          taxAmount: schema.sales.taxAmount,
          totalAmount: schema.sales.totalAmount,
          nonCashAmount: schema.sales.nonCashAmount,
          createdAt: schema.sales.createdAt,
        })
        .from(schema.sales)
        .leftJoin(schema.users, eq(schema.users.id, schema.sales.attendantId))
        .where(
          and(
            eq(schema.sales.shiftId, dbActiveShift.id),
            eq(schema.sales.captureMechanism, 'MERCH_HANDOVER'),
          ),
        )
        .orderBy(desc(schema.sales.createdAt)),
      db
        .select({
          id: schema.sales.id,
          documentNumber: schema.sales.documentNumber,
          attendantId: schema.sales.attendantId,
          attendantName: schema.users.fullName,
          customerId: schema.sales.customerId,
          customerName: schema.customers.name,
          buyerDetails: schema.sales.buyerDetails,
          paymentMethod: schema.sales.paymentMethod,
          totalAmount: schema.sales.totalAmount,
          createdAt: schema.sales.createdAt,
        })
        .from(schema.sales)
        .leftJoin(schema.users, eq(schema.users.id, schema.sales.attendantId))
        .leftJoin(schema.customers, eq(schema.customers.id, schema.sales.customerId))
        .where(
          and(
            eq(schema.sales.shiftId, dbActiveShift.id),
            ne(schema.sales.saleType, 'Fuel'),
            ne(schema.sales.captureMechanism, 'MERCH_HANDOVER'),
          ),
        )
        .orderBy(desc(schema.sales.createdAt)),
    ]);
    const merchSaleIds = merchHandoverRows.map((h) => h.id);
    const merchItemRows = merchSaleIds.length
      ? await db
          .select({
            saleId: schema.saleItems.saleId,
            productId: schema.saleItems.productId,
            productName: schema.products.name,
            quantity: schema.saleItems.quantity,
            unitPrice: schema.saleItems.unitPrice,
            lineTotal: schema.saleItems.lineTotal,
          })
          .from(schema.saleItems)
          .leftJoin(schema.products, eq(schema.products.id, schema.saleItems.productId))
          .where(inArray(schema.saleItems.saleId, merchSaleIds))
      : [];
    const merchItemsBySale = merchItemRows.reduce((acc: Record<string, any[]>, it) => {
      (acc[it.saleId] ||= []).push(it);
      return acc;
    }, {});
    const merchandiseHandovers = merchHandoverRows.map((h) => ({
      ...h,
      items: merchItemsBySale[h.id] ?? [],
    }));

    activeShift = {
      ...dbActiveShift,
      templateName: template?.name ?? 'Custom',
      businessDate: activeBusinessDay?.businessDate ?? null,
      scheduledStartTime: template?.startTime ?? null,
      scheduledEndTime: template?.endTime ?? null,
      openedByName: openedByUser?.fullName ?? 'System',
      nozzleReadings,
      staffAssignments,
      handovers,
      terminalLinks,
      merchandiseHandovers,
      merchandiseSales,
      // Authoritative cash reconciliation (same figures CloseShift will use), so
      // the closing wizard's expected drawer includes non-attendant merch cash
      // and reads the true station-level short/surplus.
      reconciliation: await new DrizzleShiftReconciliationReader(db).totalsForShift(
        dbActiveShift.id,
      ),
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
  let lastShiftSummary: any = null;
  let canReopenLastShift = false;
  let gracePeriodExpiresAt: string | null = null;

  if (dbLastShift) {
    const currentStatus = dbLastShift.status;
    const lockedAt = dbLastShift.lockedAt;
    if (currentStatus === 'CLOSED' && dbLastShift.closedAt) {
      const closedTime = new Date(dbLastShift.closedAt).getTime();
      const reopenExpiryTime = closedTime + graceMinutes * 60 * 1000;
      if (now <= reopenExpiryTime) gracePeriodExpiresAt = new Date(reopenExpiryTime).toISOString();
    }
    const [lastTemplateRows, lastClosedByRows, lastSummaryRows, parentDayRows] = await Promise.all([
      db
        .select()
        .from(schema.shiftTemplates)
        .where(eq(schema.shiftTemplates.id, dbLastShift.shiftTemplateId))
        .limit(1),
      dbLastShift.closedBy
        ? db.select().from(schema.users).where(eq(schema.users.id, dbLastShift.closedBy)).limit(1)
        : Promise.resolve([] as any[]),
      db
        .select()
        .from(schema.shiftSummaries)
        .where(eq(schema.shiftSummaries.shiftId, dbLastShift.id))
        .limit(1),
      db
        .select({ status: schema.businessDays.status })
        .from(schema.businessDays)
        .where(
          and(
            eq(schema.businessDays.id, dbLastShift.businessDayId),
            eq(schema.businessDays.organizationId, orgId),
            eq(schema.businessDays.stationId, stationId),
          ),
        )
        .limit(1),
    ]);
    const template = lastTemplateRows[0];
    const closedByName = lastClosedByRows[0]?.fullName ?? 'System';
    const summary = lastSummaryRows[0];
    if (
      currentStatus === 'CLOSED' &&
      parentDayRows[0]?.status === 'OPEN' &&
      canReopenShift(user.role) &&
      !dbActiveShift
    )
      canReopenLastShift = true;
    lastShift = {
      ...dbLastShift,
      status: currentStatus,
      lockedAt,
      templateName: template?.name ?? 'Custom',
      closedByName,
    };
    // The stored snapshot is kept current at write time (close + refresh), so
    // it is served as-is — no read-time re-projection.
    lastShiftSummary = summary ?? null;
  }

  const recentClosedShifts = await loadRecentClosedShifts();

  // v2 fields (businessDay, readings) kept alongside legacy-compatible fields.
  const base = {
    businessDay: businessDay ?? null,
    shift: dbActiveShift ?? null,
    readings: activeShift?.nozzleReadings ?? [],
    activeShift,
    lastShift,
    lastShiftSummary,
    canReopenLastShift,
    gracePeriodExpiresAt,
    recentClosedShifts,
  };

  const templates = await db
    .select()
    .from(schema.shiftTemplates)
    .where(
      and(
        eq(schema.shiftTemplates.organizationId, orgId),
        eq(schema.shiftTemplates.isActive, true),
      ),
    );
  const nozzleRows = await db
    .select({ nz: schema.nozzles, prod: schema.products, tnk: schema.tanks })
    .from(schema.nozzles)
    .leftJoin(schema.products, eq(schema.products.id, schema.nozzles.productId))
    .leftJoin(schema.tanks, eq(schema.tanks.id, schema.nozzles.tankId))
    .where(and(eq(schema.nozzles.stationId, stationId), eq(schema.nozzles.organizationId, orgId)));
  const nozzles = nozzleRows.map(({ nz, prod, tnk }) => ({
    ...nz,
    productName: prod?.name ?? 'Unknown',
    productCode: prod?.code ?? 'Unknown',
    unit: prod?.unit ?? 'L',
    tankName: tnk?.name ?? 'Unknown',
  }));
  const staff = await db
    .select()
    .from(schema.users)
    .where(and(eq(schema.users.organizationId, orgId), eq(schema.users.status, 'ACTIVE')));
  const dispensers = await db
    .select()
    .from(schema.dispenserUnits)
    .where(
      and(
        eq(schema.dispenserUnits.stationId, stationId),
        eq(schema.dispenserUnits.status, 'ACTIVE'),
      ),
    );

  const terminals = await db
    .select()
    .from(schema.paymentTerminals)
    .where(
      and(
        eq(schema.paymentTerminals.stationId, stationId),
        eq(schema.paymentTerminals.isActive, true),
      ),
    );

  return c.json({
    success: true,
    data: { ...base, templates, nozzles, staff, dispensers, terminals },
  });
});

// GET /api/shifts/my-assignment — the caller's own active shift assignment(s):
// assigned dispenser unit(s), their nozzles (opening readings) + linked
// terminals, and any existing draft handover. Self-scoped: only the caller's
// data is ever returned, so it is safe for the restricted Attendant role.
shiftsRouter.get('/my-assignment', async (c) => {
  const db = c.var.db;
  const user = c.var.user;

  // Active (OPEN) shifts where this user is assigned to at least one DU.
  const assignmentRows = await db
    .select({ sa: schema.shiftStaffAssignments, shift: schema.shifts, du: schema.dispenserUnits })
    .from(schema.shiftStaffAssignments)
    .innerJoin(schema.shifts, eq(schema.shifts.id, schema.shiftStaffAssignments.shiftId))
    .leftJoin(
      schema.dispenserUnits,
      eq(schema.dispenserUnits.id, schema.shiftStaffAssignments.duId),
    )
    .where(
      and(
        eq(schema.shiftStaffAssignments.userId, user.id),
        eq(schema.shifts.organizationId, user.organizationId),
        eq(schema.shifts.status, 'OPEN'),
      ),
    );

  if (assignmentRows.length === 0) {
    return c.json({ success: true, data: null });
  }

  // An attendant works one active shift at a time; anchor on the first.
  const shift = assignmentRows[0].shift;
  const myRows = assignmentRows.filter((r) => r.sa.shiftId === shift.id && r.sa.duId);
  const duIds = [...new Set(myRows.map((r) => r.sa.duId))];

  const [
    templateRows,
    stationRows,
    nozzleRows,
    terminalRows,
    myHandovers,
    myEntries,
    creditSaleRows,
    omcSaleRows,
  ] = await Promise.all([
    db
      .select()
      .from(schema.shiftTemplates)
      .where(eq(schema.shiftTemplates.id, shift.shiftTemplateId))
      .limit(1),
    db.select().from(schema.stations).where(eq(schema.stations.id, shift.stationId)).limit(1),
    duIds.length
      ? db
          .select({
            nr: schema.nozzleReadings,
            nz: schema.nozzles,
            prod: schema.products,
            tnk: schema.tanks,
          })
          .from(schema.nozzleReadings)
          .innerJoin(schema.nozzles, eq(schema.nozzles.id, schema.nozzleReadings.nozzleId))
          .leftJoin(schema.products, eq(schema.products.id, schema.nozzles.productId))
          .leftJoin(schema.tanks, eq(schema.tanks.id, schema.nozzles.tankId))
          .where(
            and(eq(schema.nozzleReadings.shiftId, shift.id), inArray(schema.nozzles.duId, duIds)),
          )
      : Promise.resolve([] as any[]),
    db
      .select({ link: schema.shiftTerminalLinks, term: schema.paymentTerminals })
      .from(schema.shiftTerminalLinks)
      .leftJoin(
        schema.paymentTerminals,
        eq(schema.paymentTerminals.id, schema.shiftTerminalLinks.terminalId),
      )
      .where(eq(schema.shiftTerminalLinks.shiftId, shift.id)),
    db
      .select()
      .from(schema.attendantHandovers)
      .where(
        and(
          eq(schema.attendantHandovers.shiftId, shift.id),
          eq(schema.attendantHandovers.userId, user.id),
        ),
      ),
    db
      .select()
      .from(schema.handoverTerminalEntries)
      .where(eq(schema.handoverTerminalEntries.shiftId, shift.id)),
    db
      .select({
        ct: schema.customerTransactions,
        customerName: schema.customers.name,
        productName: schema.products.name,
      })
      .from(schema.customerTransactions)
      .leftJoin(schema.customers, eq(schema.customers.id, schema.customerTransactions.customerId))
      .leftJoin(schema.products, eq(schema.products.id, schema.customerTransactions.productId))
      .where(
        and(
          eq(schema.customerTransactions.shiftId, shift.id),
          eq(schema.customerTransactions.attendantId, user.id),
          eq(schema.customerTransactions.transactionType, 'Credit Sale'),
          eq(schema.customerTransactions.referenceType, 'CREDIT_SALE'),
        ),
      ),
    db
      .select({
        ct: schema.customerTransactions,
        customerName: schema.customers.name,
        productName: schema.products.name,
      })
      .from(schema.customerTransactions)
      .leftJoin(schema.customers, eq(schema.customers.id, schema.customerTransactions.customerId))
      .leftJoin(schema.products, eq(schema.products.id, schema.customerTransactions.productId))
      .where(
        and(
          eq(schema.customerTransactions.shiftId, shift.id),
          eq(schema.customerTransactions.attendantId, user.id),
          eq(schema.customerTransactions.transactionType, 'OMC Sale'),
          eq(schema.customerTransactions.referenceType, 'OMC_CARD_SALE'),
        ),
      ),
  ]);

  const dispenserUnits = duIds.map((duId) => {
    const du = myRows.find((r) => r.sa.duId === duId)?.du;
    const nozzles = nozzleRows
      .filter((r) => r.nz.duId === duId)
      .map(({ nr, nz, prod, tnk }) => ({
        nozzleId: nz.id,
        nozzleName: nz.name,
        productId: nz.productId,
        productName: prod?.name ?? 'Unknown',
        productCode: prod?.code ?? null,
        unit: prod?.unit ?? 'L',
        tankName: tnk?.name ?? null,
        openingReading: Number(nr.openingReading),
        closingReading: nr.closingReading != null ? Number(nr.closingReading) : null,
        testingVolume: nr.testingVolume != null ? Number(nr.testingVolume) : null,
        unitPrice: nr.unitPrice != null ? Number(nr.unitPrice) : null,
      }));
    // Only terminals bound to THIS dispenser unit — shift-wide / other-DU
    // machines are not shown to the attendant (mirrors the desktop drawer).
    const terminals = terminalRows
      .filter((r) => r.link.duId === duId || r.link.duId == null)
      .map(({ link, term }) => ({
        terminalId: link.terminalId,
        label: term?.label ?? 'Terminal',
        supportsCard: term?.supportsCard ?? true,
        supportsUpi: term?.supportsUpi ?? true,
      }));
    const handover = myHandovers.find((h) => h.duId === duId) ?? null;
    const terminalEntries = handover ? myEntries.filter((e) => e.handoverId === handover.id) : [];
    const creditSales = (creditSaleRows as any[])
      .filter((r) => r.ct.duId === duId)
      .map(({ ct, customerName, productName }) => ({
        id: ct.id,
        customerId: ct.customerId,
        customerName: customerName ?? 'Customer',
        vehicleId: ct.vehicleId,
        productId: ct.productId,
        productName: productName ?? null,
        quantity: ct.quantity != null ? Number(ct.quantity) : null,
        unitPrice: ct.unitPrice != null ? Number(ct.unitPrice) : null,
        amount: Number(ct.amount),
        notes: ct.notes ?? null,
      }));
    const omcSales = (omcSaleRows as any[])
      .filter((r) => r.ct.duId === duId)
      .map(({ ct, customerName, productName }) => ({
        id: ct.id,
        customerId: ct.customerId,
        customerName: customerName ?? null,
        vehicleId: ct.vehicleId,
        productId: ct.productId,
        productName: productName ?? null,
        quantity: ct.quantity != null ? Number(ct.quantity) : null,
        unitPrice: ct.unitPrice != null ? Number(ct.unitPrice) : null,
        amount: Number(ct.amount),
        notes: ct.notes ?? null,
      }));
    return {
      duId,
      duName: du?.name ?? 'Unknown',
      duCode: du?.code ?? null,
      nozzles,
      terminals,
      handover,
      terminalEntries,
      creditSales,
      omcSales,
    };
  });

  const [configuredTerminal] = await db
    .select({ id: schema.paymentTerminals.id })
    .from(schema.paymentTerminals)
    .where(
      and(
        eq(schema.paymentTerminals.organizationId, user.organizationId),
        eq(schema.paymentTerminals.stationId, shift.stationId),
        eq(schema.paymentTerminals.isActive, true),
      ),
    )
    .limit(1);

  return c.json({
    success: true,
    data: {
      userId: user.id,
      shift: {
        id: shift.id,
        status: shift.status,
        openedAt: shift.openedAt,
        stationId: shift.stationId,
        templateName: templateRows[0]?.name ?? null,
      },
      station: stationRows[0]
        ? { id: stationRows[0].id, name: stationRows[0].name, code: stationRows[0].code }
        : null,
      stationHasConfiguredTerminals: Boolean(configuredTerminal),
      dispenserUnits,
    },
  });
});

// GET /api/shifts/handovers?shiftId=...  (legacy-compatible read)
shiftsRouter.get('/handovers', async (c) => {
  const db = c.var.db;
  const user = c.var.user;
  const shiftId = c.req.query('shiftId');
  if (!shiftId) {
    return c.json(
      { success: false, error: { code: 'VALIDATION_ERROR', message: 'shiftId is required' } },
      400,
    );
  }
  const [shift] = await db
    .select({ stationId: schema.shifts.stationId })
    .from(schema.shifts)
    .where(
      and(eq(schema.shifts.id, shiftId), eq(schema.shifts.organizationId, user.organizationId)),
    )
    .limit(1);
  if (!shift) {
    return c.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Shift not found' } },
      404,
    );
  }
  if (
    !isAuthorizedForStation(user, {
      organizationId: user.organizationId,
      stationId: shift.stationId,
    })
  ) {
    return c.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'No access to this station' } },
      403,
    );
  }
  const rows = await db
    .select({
      h: schema.attendantHandovers,
      userName: schema.users.fullName,
      duName: schema.dispenserUnits.name,
    })
    .from(schema.attendantHandovers)
    .leftJoin(schema.users, eq(schema.users.id, schema.attendantHandovers.userId))
    .leftJoin(schema.dispenserUnits, eq(schema.dispenserUnits.id, schema.attendantHandovers.duId))
    .where(
      and(
        eq(schema.attendantHandovers.organizationId, user.organizationId),
        eq(schema.attendantHandovers.stationId, shift.stationId),
        eq(schema.attendantHandovers.shiftId, shiftId),
        ...(isAttendant(user.role) ? [eq(schema.attendantHandovers.userId, user.id)] : []),
      ),
    );
  const entryRows = await db
    .select()
    .from(schema.handoverTerminalEntries)
    .where(
      and(
        eq(schema.handoverTerminalEntries.organizationId, user.organizationId),
        eq(schema.handoverTerminalEntries.stationId, shift.stationId),
        eq(schema.handoverTerminalEntries.shiftId, shiftId),
      ),
    );
  return c.json({
    success: true,
    data: rows.map(({ h, userName, duName }) => ({
      ...h,
      userName: userName ?? 'Unknown',
      duName: duName ?? 'Unknown',
      terminalEntries: entryRows.filter((e) => e.handoverId === h.id),
    })),
  });
});

// POST /api/shifts/handovers
shiftsRouter.post(
  '/handovers',
  writePolicyGuard('POST /shifts/handovers'),
  validateJson(shiftIdBody),
  async (c) => {
    const db = c.var.db;
    const user = c.var.user;
    if (!canRecordHandover(user.role)) {
      return c.json(
        {
          success: false,
          error: { code: 'FORBIDDEN', message: 'Insufficient permissions to record a handover' },
        },
        403,
      );
    }
    const body = await c.req.json().catch(() => ({}));
    const parsed = attendantHandoverSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid Handover request' },
        },
        400,
      );
    }
    const {
      shiftId,
      userId,
      duId,
      cashHandedOver,
      cardHandedOver,
      upiHandedOver,
      nozzleReadings,
      terminalEntries,
    } = parsed.data;
    const attendantId = isAttendant(user.role) ? user.id : userId;
    // Attendants derive userId from their own session, so only shiftId + duId are
    // required from them; operational roles must name the attendant (userId).
    if (!attendantId) {
      return c.json(
        {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'shiftId, userId and duId are required' },
        },
        400,
      );
    }
    const [shift] = await db
      .select()
      .from(schema.shifts)
      .where(
        and(eq(schema.shifts.id, shiftId), eq(schema.shifts.organizationId, user.organizationId)),
      )
      .limit(1);
    if (!shift) {
      return c.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Shift not found' } },
        404,
      );
    }
    if (
      !isAuthorizedForStation(user, {
        organizationId: user.organizationId,
        stationId: shift.stationId,
      })
    ) {
      return c.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'No access to this station' } },
        403,
      );
    }
    const result = await runInTransaction(db, async (tx, events) => {
      await lockStationInventory(tx, user.organizationId, shift.stationId);
      return new RecordHandover({
        shifts: new DrizzleShiftRepository(tx),
        businessDays: new DrizzleBusinessDayRepository(tx),
        context: new DrizzleHandoverContextReader(tx),
        handovers: new DrizzleHandoverRepository(tx),
        events,
      }).execute(
        {
          shiftId,
          attendantId,
          duId,
          cashHandedOver,
          cardHandedOver,
          upiHandedOver,
          nozzleReadings,
          terminalEntries,
        },
        buildContext(user, { stationId: shift.stationId, businessDayId: shift.businessDayId }),
      );
    });
    return sendResult(c, result);
  },
);

// POST /api/shifts/open
shiftsRouter.post(
  '/open',
  writePolicyGuard('POST /shifts/open'),
  validateJson(stationIdBody),
  async (c) => {
    const user = c.var.user;
    if (!canOpenShift(user.role)) {
      return c.json(
        {
          success: false,
          error: { code: 'FORBIDDEN', message: 'Insufficient permissions to open a shift' },
        },
        403,
      );
    }
    const body = await c.req.json().catch(() => ({}));
    if (
      !isAuthorizedForStation(user, {
        organizationId: user.organizationId,
        stationId: body?.stationId,
      })
    ) {
      return c.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'No access to this station' } },
        403,
      );
    }
    const db = c.var.db;
    const clock = await loadStationClock(db, body?.stationId);
    const result = await runInTransaction(db, async (tx, events) => {
      await lockStationInventory(tx, user.organizationId, body?.stationId);
      return new OpenShift({
        shifts: new DrizzleShiftRepository(tx),
        businessDays: new DrizzleBusinessDayRepository(tx),
        nozzles: new DrizzleNozzleRepository(tx),
        nozzleReadings: new DrizzleNozzleReadingRepository(tx),
        fuelPrices: new DrizzleFuelPriceRepository(tx),
        events,
      }).execute(body, buildContext(user, { stationId: body?.stationId, ...clock }));
    });
    return sendResult(c, result);
  },
);

// PUT /api/shifts/readings
shiftsRouter.put(
  '/readings',
  writePolicyGuard('PUT /shifts/readings'),
  validateJson(shiftIdBody),
  async (c) => {
    const user = c.var.user;
    const body = await c.req.json().catch(() => ({}));
    const db = c.var.db;
    if (typeof body?.shiftId !== 'string' || body.shiftId.length === 0) {
      return c.json(
        {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid RecordNozzleReadings command' },
        },
        400,
      );
    }
    const [shift] = await db
      .select({ stationId: schema.shifts.stationId, businessDayId: schema.shifts.businessDayId })
      .from(schema.shifts)
      .where(
        and(
          eq(schema.shifts.id, body.shiftId),
          eq(schema.shifts.organizationId, user.organizationId),
        ),
      )
      .limit(1);
    if (!shift) {
      return c.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Shift not found' } },
        404,
      );
    }
    if (
      !isAuthorizedForStation(user, {
        organizationId: user.organizationId,
        stationId: shift.stationId,
      })
    ) {
      return c.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'No access to this station' } },
        403,
      );
    }
    const result = await runInTransaction(db, async (tx, events) => {
      await lockStationInventory(tx, user.organizationId, shift.stationId);
      return new RecordNozzleReadings({
        shifts: new DrizzleShiftRepository(tx),
        businessDays: new DrizzleBusinessDayRepository(tx),
        nozzleReadings: new DrizzleNozzleReadingRepository(tx),
        events,
      }).execute(
        body,
        buildContext(user, { stationId: shift.stationId, businessDayId: shift.businessDayId }),
      );
    });
    return sendResult(c, result);
  },
);

// POST /api/shifts/close
shiftsRouter.post(
  '/close',
  writePolicyGuard('POST /shifts/close'),
  validateJson(shiftIdBody),
  async (c) => {
    const user = c.var.user;
    if (!canCloseShift(user.role)) {
      return c.json(
        {
          success: false,
          error: { code: 'FORBIDDEN', message: 'Insufficient permissions to close a shift' },
        },
        403,
      );
    }
    const body = await c.req.json().catch(() => ({}));
    const command = { ...(body?.payload ?? {}), shiftId: body?.shiftId };
    const db = c.var.db;
    // Authorize the shift's stored station (matches open/readings/reopen): a
    // Manager assigned to Station A must not close Station B's shift.
    const [target] = await db
      .select({ stationId: schema.shifts.stationId })
      .from(schema.shifts)
      .where(
        and(
          eq(schema.shifts.id, body?.shiftId),
          eq(schema.shifts.organizationId, user.organizationId),
        ),
      )
      .limit(1);
    if (!target) {
      return c.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Shift not found' } },
        404,
      );
    }
    if (
      !isAuthorizedForStation(user, {
        organizationId: user.organizationId,
        stationId: target.stationId,
      })
    ) {
      return c.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'No access to this station' } },
        403,
      );
    }
    const result = await runInTransaction(db, async (tx, events) => {
      const [shift] = await tx
        .select({ stationId: schema.shifts.stationId })
        .from(schema.shifts)
        .where(
          and(
            eq(schema.shifts.id, body?.shiftId),
            eq(schema.shifts.organizationId, user.organizationId),
          ),
        )
        .limit(1);
      if (shift) await lockStationInventory(tx, user.organizationId, shift.stationId);
      const r = await new CloseShift({
        shifts: new DrizzleShiftRepository(tx),
        nozzles: new DrizzleNozzleRepository(tx),
        nozzleReadings: new DrizzleNozzleReadingRepository(tx),
        reconciliation: new DrizzleShiftReconciliationReader(tx),
        creditSales: new DrizzleCreditSalesReader(tx),
        stockMovements: new DrizzleStockMovementWriter(tx),
        summaries: new DrizzleShiftSummaryWriter(tx),
        events,
      }).execute(command, buildContext(user));
      if (r.success) {
        const snap = r.data.snapshot as any;
        // Persist the FULL projected presentation snapshot so every read path
        // (summaries list/detail, shift status) serves stored data without
        // re-enrichment. projectShiftSummary is idempotent over its own output.
        const projected = await new DrizzleShiftSummaryProjector(tx).project(
          r.data.shift,
          r.data.snapshot,
        );
        await new DrizzleShiftSummaryWriter(tx).save(r.data.shift.id, projected);
        await new LedgerPostingService(tx).postShiftClose(
          user.organizationId,
          {
            id: r.data.shift.id,
            stationId: r.data.shift.stationId,
            businessDayId: r.data.shift.businessDayId,
          },
          { cashSales: Number(snap?.reconciliation?.cashSales ?? 0) },
        );
      }
      return r;
    });
    return sendResult(c, result);
  },
);

// POST /api/shifts/reopen
shiftsRouter.post(
  '/reopen',
  writePolicyGuard('POST /shifts/reopen'),
  validateJson(shiftIdBody),
  async (c) => {
    const user = c.var.user;
    if (!canReopenShift(user.role)) {
      return c.json(
        {
          success: false,
          error: { code: 'FORBIDDEN', message: 'Only Owners/Managers can reopen a shift' },
        },
        403,
      );
    }
    const body = await c.req.json().catch(() => ({}));
    const db = c.var.db;
    const [shift] = await db
      .select({ stationId: schema.shifts.stationId, businessDayId: schema.shifts.businessDayId })
      .from(schema.shifts)
      .where(
        and(
          eq(schema.shifts.id, body?.shiftId),
          eq(schema.shifts.organizationId, user.organizationId),
        ),
      )
      .limit(1);
    if (
      shift &&
      !isAuthorizedForStation(user, {
        organizationId: user.organizationId,
        stationId: shift.stationId,
      })
    ) {
      return c.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'No access to this station' } },
        403,
      );
    }
    const result = await runInTransaction(db, async (tx, events) => {
      if (shift) await lockStationInventory(tx, user.organizationId, shift.stationId);
      const businessDays = new DrizzleBusinessDayRepository(tx);
      const r = await new ReopenShift({
        shifts: new DrizzleShiftRepository(tx),
        businessDays,
        summaries: new DrizzleShiftSummaryWriter(tx),
        stockVariances: new DrizzleStockVarianceRepository(tx),
        events,
      }).execute(
        body,
        buildContext(
          user,
          shift ? { stationId: shift.stationId, businessDayId: shift.businessDayId } : undefined,
        ),
      );
      // Roll back the shift-close money postings; they will be re-posted on re-close.
      if (r.success && body?.shiftId)
        await new LedgerPostingService(tx).reverseShiftClose(body.shiftId);
      return r;
    });
    return sendResult(c, result);
  },
);

// POST /api/shifts/lock
shiftsRouter.post(
  '/lock',
  writePolicyGuard('POST /shifts/lock'),
  validateJson(shiftIdBody),
  async (c) => {
    const user = c.var.user;
    if (!canManageDay(user.role)) {
      return c.json(
        {
          success: false,
          error: { code: 'FORBIDDEN', message: 'Only Owners/Managers can lock a shift' },
        },
        403,
      );
    }
    const body = await c.req.json().catch(() => ({}));
    const db = c.var.db;
    const [shift] = await db
      .select({ stationId: schema.shifts.stationId, businessDayId: schema.shifts.businessDayId })
      .from(schema.shifts)
      .where(
        and(
          eq(schema.shifts.id, body?.shiftId),
          eq(schema.shifts.organizationId, user.organizationId),
        ),
      )
      .limit(1);
    if (!shift) {
      return c.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Shift not found' } },
        404,
      );
    }
    if (
      !isAuthorizedForStation(user, {
        organizationId: user.organizationId,
        stationId: shift.stationId,
      })
    ) {
      return c.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'No access to this station' } },
        403,
      );
    }
    const result = await runInTransaction(db, (tx, events) =>
      new LockShift({
        shifts: new DrizzleShiftRepository(tx),
        businessDays: new DrizzleBusinessDayRepository(tx),
        events,
      }).execute(body, buildContext(user, shift)),
    );
    return sendResult(c, result);
  },
);

// POST /api/shifts/business-day/open
shiftsRouter.post(
  '/business-day/open',
  writePolicyGuard('POST /shifts/business-day/open'),
  validateJson(stationIdBody),
  async (c) => {
    const user = c.var.user;
    if (!canManageDay(user.role)) {
      return c.json(
        {
          success: false,
          error: { code: 'FORBIDDEN', message: 'Only Owners/Managers can open a business day' },
        },
        403,
      );
    }
    const body = await c.req.json().catch(() => ({}));
    const db = c.var.db;
    if (
      !body?.stationId ||
      !isAuthorizedForStation(user, {
        organizationId: user.organizationId,
        stationId: body.stationId,
      })
    ) {
      return c.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'No access to this Station' } },
        403,
      );
    }
    const clock = await loadStationClock(db, body?.stationId);
    const result = await runInTransaction(db, (tx, events) =>
      new OpenBusinessDay({ repository: new DrizzleBusinessDayRepository(tx), events }).execute(
        body,
        buildContext(user, { stationId: body?.stationId, ...clock }),
      ),
    );
    return sendResult(c, result);
  },
);

// POST /api/shifts/business-day/close
shiftsRouter.post(
  '/business-day/close',
  writePolicyGuard('POST /shifts/business-day/close'),
  validateJson(stationIdBody),
  async (c) => {
    const user = c.var.user;
    if (!canManageDay(user.role)) {
      return c.json(
        {
          success: false,
          error: { code: 'FORBIDDEN', message: 'Only Owners/Managers can close a business day' },
        },
        403,
      );
    }
    const body = await c.req.json().catch(() => ({}));
    const db = c.var.db;
    if (
      !body?.stationId ||
      !isAuthorizedForStation(user, {
        organizationId: user.organizationId,
        stationId: body.stationId,
      })
    ) {
      return c.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'No access to this Station' } },
        403,
      );
    }
    const result = await runInTransaction(db, async (tx, events) => {
      const businessDays = new DrizzleBusinessDayRepository(tx);
      return new CloseBusinessDayAndGenerateDssr({
        businessDays,
        openShifts: new DrizzleShiftRepository(tx),
        snapshots: new DrizzleDssrSnapshotRepository(tx),
        dssrData: new DrizzleDssrDataReader(tx),
        events,
      }).execute(
        body,
        buildContext(user, { stationId: body.stationId, businessDayId: body.businessDayId }),
      );
    });
    return sendResult(c, result);
  },
);

// GET /api/shifts/shift-summaries?stationId=...&limit=...&before=...
// Serves the STORED snapshot per summary — the snapshot is kept current at
// write time (shift close + late-attribution refresh), so no read-time
// re-projection happens here. Cursor pagination: `before` is the previous
// page's oldest generatedAt (ISO); pages are newest-first.
shiftsRouter.get('/shift-summaries', async (c) => {
  const user = c.var.user;
  const stationId = c.req.query('stationId');
  if (!stationId) {
    return c.json(
      { success: false, error: { code: 'VALIDATION_ERROR', message: 'stationId is required' } },
      400,
    );
  }
  if (!isAuthorizedForStation(user, { organizationId: user.organizationId, stationId })) {
    return c.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'No access to this station' } },
      403,
    );
  }
  const limitRaw = Number(c.req.query('limit'));
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 200) : 50;
  const beforeRaw = c.req.query('before');
  const before = beforeRaw ? new Date(beforeRaw) : null;
  if (before && Number.isNaN(before.getTime())) {
    return c.json(
      {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'before must be an ISO timestamp' },
      },
      400,
    );
  }
  const db = c.var.db;
  const rows = await db
    .select({
      shift: schema.shifts,
      snapshotData: schema.shiftSummaries.snapshotData,
      generatedAt: schema.shiftSummaries.generatedAt,
      businessDate: schema.businessDays.businessDate,
      templateName: schema.shiftTemplates.name,
    })
    .from(schema.shiftSummaries)
    .innerJoin(schema.shifts, eq(schema.shifts.id, schema.shiftSummaries.shiftId))
    .leftJoin(schema.businessDays, eq(schema.businessDays.id, schema.shifts.businessDayId))
    .leftJoin(schema.shiftTemplates, eq(schema.shiftTemplates.id, schema.shifts.shiftTemplateId))
    .where(
      and(
        eq(schema.shifts.stationId, stationId),
        eq(schema.shifts.organizationId, user.organizationId),
        ...(before ? [lt(schema.shiftSummaries.generatedAt, before)] : []),
      ),
    )
    .orderBy(desc(schema.shiftSummaries.generatedAt))
    .limit(limit);

  const data = rows.map((r) => ({
    shiftId: r.shift.id,
    status: r.shift.status,
    openedAt: r.shift.openedAt,
    closedAt: r.shift.closedAt,
    businessDayId: r.shift.businessDayId,
    businessDate: r.businessDate,
    templateName: r.templateName ?? null,
    generatedAt: r.generatedAt,
    snapshotData: r.snapshotData,
  }));
  return c.json({ success: true, data });
});
