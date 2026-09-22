import { Hono } from 'hono';
import { and, desc, eq, gt, inArray, lt, ne, sql } from 'drizzle-orm';
import { schema, type DbClient } from '@pump/db';
import {
  attendantHandoverSchema,
  businessDateSettings,
  byNaturalField,
  canOpenShift,
  canCloseShift,
  canReopenShift,
  canRecordHandover,
  compareByDispenserThenNozzle,
  dispenserLabel,
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
import { loadStationClock, stationNotFound } from '../infra/station-clock.js';
import { lockStationInventory, runInTransaction } from '../infra/transaction.js';
import { rowJson, rowJsonNullable, tsIso } from '../infra/sql-json.js';
import { shiftSequenceSql } from '../infra/shift-sequence-sql.js';
import { assembleReconTotals, reconTotalsJson } from '../infra/repositories/shift-recon-sql.js';
import {
  DrizzleNozzleRepository,
  DrizzleFuelPriceRepository,
} from '../infra/repositories/setup-repositories.js';
import {
  DrizzleBusinessDayRepository,
  DrizzleBusinessDayStatusReader,
  DrizzleShiftRepository,
  DrizzleNozzleReadingRepository,
  DrizzleCloseShiftContextReader,
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
 * Deterministic nozzle order for the shift-status payload: by dispenser unit,
 * then by nozzle, both naturally — so N10 follows N2, and a drawer reopened
 * mid-shift shows the same list it showed a minute ago.
 *
 * Both the cascade and the dispenser label come from `@pump/shared` so this
 * route, the readings grid and the open-shift form cannot drift into three
 * different orders (#244). This route used to key on `duName` alone while both
 * UI surfaces keyed on `duCode || duName`, so the payload order and the
 * rendered order could disagree; `dispenserLabel` settles it.
 */
const compareNozzleRows = compareByDispenserThenNozzle<{
  duCode?: string | null;
  duName?: string | null;
  nozzleName: string;
}>(dispenserLabel, (row) => row.nozzleName);

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

  const clock = await loadStationClock(c.var.db, user.organizationId, stationId);
  if (!clock) return stationNotFound(c);
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
        ${shiftSequenceSql('s')} AS "shiftSequence",
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
        bd.business_date AS "businessDate",
        ${shiftSequenceSql('s')} AS "shiftSequence",
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
        shiftSequence: openRaw.shiftSequence ?? null,
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
      businessDate: lastRaw.businessDate ?? null,
      shiftSequence: lastRaw.shiftSequence ?? null,
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
          'shiftSequence', ${shiftSequenceSql('s')},
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
          'templateName', COALESCE(t.name, 'Custom'),
          'businessDate', bd.business_date,
          'shiftSequence', ${shiftSequenceSql('s')}
        ) AS j
        FROM shifts s
        LEFT JOIN shift_templates t ON t.id = s.shift_template_id
        LEFT JOIN business_days bd ON bd.id = s.business_day_id
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

  // --- Full mode (#230): the same payload, but every section is fetched in a
  // fixed number of consolidated statements instead of ~25 sequential
  // round-trips (serialized on the wire by the max:1 driver). Statement 1:
  // open day + active/last/recent shifts; statement 2 (only when a shift is
  // open): the active shift's operational detail; statement 3: station
  // reference data. Each section renders rows as jsonb in exactly the shape
  // the previous drizzle builders produced (sql-json helpers), so the shaping
  // below — and the payload — are unchanged.
  const graceCutoffIso = new Date(now - lockGraceDays * 24 * 60 * 60 * 1000).toISOString();
  const [shiftsRow] = (await db.execute(sql`
    SELECT
      (SELECT ${rowJson(schema.businessDays, 'd')} FROM business_days d
        WHERE d.station_id = ${stationId} AND d.status = 'OPEN'
        ORDER BY d.business_date DESC LIMIT 1) AS business_day,
      (SELECT ${rowJson(schema.shifts, 's')} || jsonb_build_object(
          'shiftSequence', ${shiftSequenceSql('s')}) FROM shifts s
        WHERE s.station_id = ${stationId} AND s.status = 'OPEN' LIMIT 1) AS active_shift,
      (SELECT jsonb_build_object(
          'shift', ${rowJson(schema.shifts, 's')} || jsonb_build_object(
            'shiftSequence', ${shiftSequenceSql('s')},
            'businessDate', (SELECT bd.business_date FROM business_days bd WHERE bd.id = s.business_day_id)),
          'templateName', t.name,
          'closedByName', u.full_name,
          'summary', (SELECT ${rowJson(schema.shiftSummaries, 'ss')} FROM shift_summaries ss
            WHERE ss.shift_id = s.id LIMIT 1),
          'parentDayStatus', (SELECT pd.status FROM business_days pd
            WHERE pd.id = s.business_day_id AND pd.organization_id = ${orgId}
              AND pd.station_id = ${stationId})
        )
        FROM shifts s
        LEFT JOIN shift_templates t ON t.id = s.shift_template_id
        LEFT JOIN users u ON u.id = s.closed_by
        WHERE s.station_id = ${stationId} AND s.status <> 'OPEN'
        ORDER BY s.closed_at DESC, s.created_at DESC
        LIMIT 1) AS last_shift,
      COALESCE((SELECT jsonb_agg(x.j ORDER BY x.closed_at DESC) FROM (
          SELECT s.closed_at, (${rowJson(schema.shifts, 's')} || jsonb_build_object(
            'templateName', COALESCE(t.name, 'Custom'),
            'businessDate', bd.business_date,
            'shiftSequence', ${shiftSequenceSql('s')})) AS j
          FROM shifts s
          LEFT JOIN shift_templates t ON t.id = s.shift_template_id
          LEFT JOIN business_days bd ON bd.id = s.business_day_id
          WHERE s.organization_id = ${orgId} AND s.station_id = ${stationId}
            AND s.status = 'CLOSED' AND s.closed_at > ${graceCutoffIso}
          ORDER BY s.closed_at DESC
          LIMIT 50
        ) x), '[]'::jsonb) AS recent_closed
  `)) as unknown as [Record<string, any>];

  const businessDay = (shiftsRow.business_day as Record<string, any> | null) ?? null;
  const dbActiveShift = (shiftsRow.active_shift as Record<string, any> | null) ?? null;
  const lastShiftRow = (shiftsRow.last_shift as Record<string, any> | null) ?? null;
  const recentClosedShifts = (shiftsRow.recent_closed as any[]) ?? [];

  let activeShift: any = null;
  if (dbActiveShift) {
    const [detail] = (await db.execute(sql`
      SELECT
        (SELECT ${rowJson(schema.shiftTemplates, 't')} FROM shift_templates t
          WHERE t.id = ${dbActiveShift.shiftTemplateId}) AS template,
        (SELECT ${rowJson(schema.users, 'u')} FROM users u
          WHERE u.id = ${dbActiveShift.openedBy}) AS opened_user,
        (SELECT bd.business_date FROM business_days bd
          WHERE bd.id = ${dbActiveShift.businessDayId} AND bd.organization_id = ${orgId}
            AND bd.station_id = ${stationId}) AS business_date,
        COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'nr', ${rowJson(schema.nozzleReadings, 'nr')},
            'nz', ${rowJsonNullable(schema.nozzles, 'nz')},
            'prod', ${rowJsonNullable(schema.products, 'prod')},
            'tnk', ${rowJsonNullable(schema.tanks, 'tnk')},
            'du', ${rowJsonNullable(schema.dispenserUnits, 'du')}
          ) ORDER BY nr.created_at, nr.id)
          FROM nozzle_readings nr
          LEFT JOIN nozzles nz ON nz.id = nr.nozzle_id
          LEFT JOIN products prod ON prod.id = nz.product_id
          LEFT JOIN tanks tnk ON tnk.id = nz.tank_id
          LEFT JOIN dispenser_units du ON du.id = nz.du_id
          WHERE nr.shift_id = ${dbActiveShift.id}), '[]'::jsonb) AS nozzle_readings,
        COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'attendantId', t.attendant_id,
            'paymentMethod', t.payment_method,
            'total', t.total::text,
            'nonCash', t.non_cash::text
          )) FROM (
            SELECT s.attendant_id, s.payment_method,
              COALESCE(SUM(s.total_amount), 0) AS total,
              COALESCE(SUM(s.non_cash_amount), 0) AS non_cash
            FROM sales s
            WHERE s.shift_id = ${dbActiveShift.id} AND s.sale_type <> 'Fuel'
            GROUP BY s.attendant_id, s.payment_method
          ) t), '[]'::jsonb) AS attributed_sales,
        COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'ct', ${rowJson(schema.customerTransactions, 'ct')},
            'customerName', cust.name,
            'customerType', cust.customer_type,
            'productName', prod.name,
            'productCode', prod.code
          ) ORDER BY ct.created_at, ct.id)
          FROM customer_transactions ct
          LEFT JOIN customers cust ON cust.id = ct.customer_id
          LEFT JOIN products prod ON prod.id = ct.product_id
          WHERE ct.shift_id = ${dbActiveShift.id}
            AND ct.transaction_type = 'Credit Sale'
            AND ct.reference_type = 'CREDIT_SALE'), '[]'::jsonb) AS credit_lines,
        COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'ct', ${rowJson(schema.customerTransactions, 'ct')},
            'customerName', cust.name,
            'customerType', cust.customer_type,
            'productName', prod.name,
            'productCode', prod.code
          ) ORDER BY ct.created_at, ct.id)
          FROM customer_transactions ct
          LEFT JOIN customers cust ON cust.id = ct.customer_id
          LEFT JOIN products prod ON prod.id = ct.product_id
          WHERE ct.shift_id = ${dbActiveShift.id}
            AND ct.transaction_type = 'OMC Sale'
            AND ct.reference_type = 'OMC_CARD_SALE'), '[]'::jsonb) AS omc_lines,
        COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'sa', ${rowJson(schema.shiftStaffAssignments, 'sa')},
            'staffUser', ${rowJsonNullable(schema.users, 'u')},
            'du', ${rowJsonNullable(schema.dispenserUnits, 'du')}
          ))
          FROM shift_staff_assignments sa
          LEFT JOIN users u ON u.id = sa.user_id
          LEFT JOIN dispenser_units du ON du.id = sa.du_id
          WHERE sa.shift_id = ${dbActiveShift.id}), '[]'::jsonb) AS assignments,
        COALESCE((SELECT jsonb_agg(${rowJson(schema.attendantHandovers, 'h')} ORDER BY h.created_at, h.id)
          FROM attendant_handovers h WHERE h.shift_id = ${dbActiveShift.id}), '[]'::jsonb) AS handovers,
        COALESCE((SELECT jsonb_agg(${rowJson(schema.handoverTerminalEntries, 'e')} ORDER BY e.created_at, e.id)
          FROM handover_terminal_entries e WHERE e.shift_id = ${dbActiveShift.id}), '[]'::jsonb) AS handover_entries,
        COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'link', ${rowJson(schema.shiftTerminalLinks, 'link')},
            'term', ${rowJsonNullable(schema.paymentTerminals, 'term')},
            'du', ${rowJsonNullable(schema.dispenserUnits, 'du')}
          ))
          FROM shift_terminal_links link
          LEFT JOIN payment_terminals term ON term.id = link.terminal_id
          LEFT JOIN dispenser_units du ON du.id = link.du_id
          WHERE link.shift_id = ${dbActiveShift.id}), '[]'::jsonb) AS terminal_links,
        COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'id', s.id,
            'attendantId', s.attendant_id,
            'attendantName', u.full_name,
            'subtotalAmount', s.subtotal_amount::text,
            'taxAmount', s.tax_amount::text,
            'totalAmount', s.total_amount::text,
            'nonCashAmount', s.non_cash_amount::text,
            'createdAt', ${tsIso('s.created_at')}
          ) ORDER BY s.created_at DESC)
          FROM sales s
          LEFT JOIN users u ON u.id = s.attendant_id
          WHERE s.shift_id = ${dbActiveShift.id}
            AND s.capture_mechanism = 'MERCH_HANDOVER'), '[]'::jsonb) AS merch_handovers,
        COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'id', s.id,
            'documentNumber', s.document_number,
            'attendantId', s.attendant_id,
            'attendantName', u.full_name,
            'customerId', s.customer_id,
            'customerName', c2.name,
            'buyerDetails', s.buyer_details,
            'paymentMethod', s.payment_method,
            'totalAmount', s.total_amount::text,
            'createdAt', ${tsIso('s.created_at')}
          ) ORDER BY s.created_at DESC)
          FROM sales s
          LEFT JOIN users u ON u.id = s.attendant_id
          LEFT JOIN customers c2 ON c2.id = s.customer_id
          WHERE s.shift_id = ${dbActiveShift.id}
            AND s.sale_type <> 'Fuel'
            AND s.capture_mechanism <> 'MERCH_HANDOVER'), '[]'::jsonb) AS merch_sales,
        COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'saleId', si.sale_id,
            'productId', si.product_id,
            'productName', p.name,
            'quantity', si.quantity::text,
            'unitPrice', si.unit_price::text,
            'lineTotal', si.line_total::text
          ))
          FROM sale_items si
          JOIN sales s ON s.id = si.sale_id
            AND s.shift_id = ${dbActiveShift.id}
            AND s.capture_mechanism = 'MERCH_HANDOVER'
          LEFT JOIN products p ON p.id = si.product_id), '[]'::jsonb) AS merch_items,
        ${reconTotalsJson(dbActiveShift.id)} AS recon
    `)) as unknown as [Record<string, any>];

    const template = (detail.template as Record<string, any> | null) ?? undefined;
    const openedByUser = (detail.opened_user as Record<string, any> | null) ?? undefined;
    const activeBusinessDay = detail.business_date
      ? { businessDate: detail.business_date as string }
      : undefined;
    const nozzleReadingRows: any[] = detail.nozzle_readings ?? [];
    const attributedSaleRows: any[] = detail.attributed_sales ?? [];
    const creditLineRows: any[] = detail.credit_lines ?? [];
    const omcLineRows: any[] = detail.omc_lines ?? [];
    const assignmentRows: any[] = detail.assignments ?? [];
    const handoverRows: any[] = detail.handovers ?? [];
    const handoverEntryRows: any[] = detail.handover_entries ?? [];
    const terminalLinkRows: any[] = detail.terminal_links ?? [];
    const merchHandoverRows: any[] = detail.merch_handovers ?? [];
    const merchandiseSales: any[] = detail.merch_sales ?? [];
    const merchItemRows: any[] = detail.merch_items ?? [];
    const reconciliation = assembleReconTotals(detail.recon ?? {});

    const nozzleReadings = nozzleReadingRows
      .map(({ nr, nz, prod, tnk, du }) => ({
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
      }))
      // Unsorted, this is raw Postgres row order — nondeterministic, so the
      // handover drawer could list the same nozzles differently on each open.
      .sort(compareNozzleRows);

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
    // Rows come from the consolidated detail statement above.
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
      reconciliation,
    };
  }

  // --- Last non-open shift + its summary (fetched in statement 1) ---
  let lastShift: any = null;
  let lastShiftSummary: any = null;
  let canReopenLastShift = false;
  let gracePeriodExpiresAt: string | null = null;

  if (lastShiftRow?.shift) {
    const dbLastShift = lastShiftRow.shift as Record<string, any>;
    const currentStatus = dbLastShift.status;
    const lockedAt = dbLastShift.lockedAt;
    if (currentStatus === 'CLOSED' && dbLastShift.closedAt) {
      const closedTime = new Date(dbLastShift.closedAt).getTime();
      const reopenExpiryTime = closedTime + graceMinutes * 60 * 1000;
      if (now <= reopenExpiryTime) gracePeriodExpiresAt = new Date(reopenExpiryTime).toISOString();
    }
    if (
      currentStatus === 'CLOSED' &&
      lastShiftRow.parentDayStatus === 'OPEN' &&
      canReopenShift(user.role) &&
      !dbActiveShift
    )
      canReopenLastShift = true;
    lastShift = {
      ...dbLastShift,
      status: currentStatus,
      lockedAt,
      templateName: lastShiftRow.templateName ?? 'Custom',
      closedByName: lastShiftRow.closedByName ?? 'System',
    };
    // The stored snapshot is kept current at write time (close + refresh), so
    // it is served as-is — no read-time re-projection.
    lastShiftSummary = lastShiftRow.summary ?? null;
  }

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

  // Statement 3: station reference data (templates / nozzles / staff /
  // dispensers / terminals), previously five fully sequential selects.
  const [refRow] = (await db.execute(sql`
    SELECT
      COALESCE((SELECT jsonb_agg(${rowJson(schema.shiftTemplates, 't')})
        FROM shift_templates t
        WHERE t.organization_id = ${orgId} AND t.is_active = true), '[]'::jsonb) AS templates,
      COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'nz', ${rowJson(schema.nozzles, 'nz')},
          'prod', ${rowJsonNullable(schema.products, 'prod')},
          'tnk', ${rowJsonNullable(schema.tanks, 'tnk')}
        ))
        FROM nozzles nz
        LEFT JOIN products prod ON prod.id = nz.product_id
        LEFT JOIN tanks tnk ON tnk.id = nz.tank_id
        WHERE nz.station_id = ${stationId} AND nz.organization_id = ${orgId}), '[]'::jsonb) AS nozzles,
      COALESCE((SELECT jsonb_agg(${rowJson(schema.users, 'u')})
        FROM users u
        WHERE u.organization_id = ${orgId} AND u.status = 'ACTIVE'), '[]'::jsonb) AS staff,
      COALESCE((SELECT jsonb_agg(${rowJson(schema.dispenserUnits, 'du')})
        FROM dispenser_units du
        WHERE du.station_id = ${stationId} AND du.status = 'ACTIVE'), '[]'::jsonb) AS dispensers,
      COALESCE((SELECT jsonb_agg(${rowJson(schema.paymentTerminals, 'pt')})
        FROM payment_terminals pt
        WHERE pt.station_id = ${stationId} AND pt.is_active = true), '[]'::jsonb) AS terminals
  `)) as unknown as [Record<string, any>];

  const templates = (refRow.templates as any[]) ?? [];
  const nozzleRows = (refRow.nozzles as any[]) ?? [];
  const nozzles = nozzleRows
    .map(({ nz, prod, tnk }) => ({
      ...nz,
      productName: prod?.name ?? 'Unknown',
      productCode: prod?.code ?? 'Unknown',
      unit: prod?.unit ?? 'L',
      tankName: tnk?.name ?? 'Unknown',
    }))
    .sort(byNaturalField((n) => n.name));
  const staff = (refRow.staff as any[]) ?? [];
  const dispensers = (refRow.dispensers as any[]) ?? [];
  const terminals = (refRow.terminals as any[]) ?? [];

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
  // Name each dispenser once, then order by it — the attendant sees DU 2 before
  // DU 10, and the comparator is not re-scanning the rows on every compare.
  const duNameById = new Map(myRows.map((r) => [r.sa.duId, r.du?.name]));
  const duIds = [...duNameById.keys()].sort(byNaturalField((duId) => duNameById.get(duId)));

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
      }))
      .sort(byNaturalField((n) => n.nozzleName));
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
    const clock = await loadStationClock(db, user.organizationId, body?.stationId);
    if (!clock) return stationNotFound(c);
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
      // The station was already resolved (org-scoped) by the auth lookup above;
      // re-selecting the shift inside the transaction was a duplicate round-trip.
      await lockStationInventory(tx, user.organizationId, target.stationId);
      const r = await new CloseShift({
        context: new DrizzleCloseShiftContextReader(tx),
        shifts: new DrizzleShiftRepository(tx),
        nozzleReadings: new DrizzleNozzleReadingRepository(tx),
        stockMovements: new DrizzleStockMovementWriter(tx),
        summaries: new DrizzleShiftSummaryWriter(tx),
        // The use case persists the FULL projected presentation snapshot in one
        // write, so every read path (summaries list/detail, shift status) serves
        // stored data without re-enrichment (#229).
        projector: new DrizzleShiftSummaryProjector(tx),
        events,
      }).execute(command, buildContext(user));
      if (r.success) {
        await new LedgerPostingService(tx).postShiftClose(
          user.organizationId,
          {
            id: r.data.shift.id,
            stationId: r.data.shift.stationId,
            businessDayId: r.data.shift.businessDayId,
          },
          // Typed on the use-case result — not dug out of the (projected)
          // snapshot, whose shape is a presentation concern.
          { cashSales: r.data.cashSales },
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
    const clock = await loadStationClock(db, user.organizationId, body?.stationId);
    if (!clock) return stationNotFound(c);
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
      shiftSequence: shiftSequenceSql('shifts'),
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
    shiftSequence: r.shiftSequence ?? null,
    templateName: r.templateName ?? null,
    generatedAt: r.generatedAt,
    snapshotData: r.snapshotData,
  }));
  return c.json({ success: true, data });
});
