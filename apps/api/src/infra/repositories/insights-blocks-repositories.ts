import { sql } from 'drizzle-orm';
import type { DbClient } from '@pump/db';
import {
  INSIGHTS_ATTENDANT_LIMIT,
  type InsightsAttendantVarianceReader,
  type InsightsAttendantVarianceRow,
  type InsightsCreditHealthReader,
  type InsightsCreditHealthSource,
  type InsightsRangeQuery,
  type InsightsStockLossReader,
  type InsightsStockLossRow,
} from '@pump/core';
import { VARIANCE_EPSILON } from '@pump/shared';
import { dssrDaySales } from '../dssr-snapshot-sql.js';
import { insightsRangeCtes } from './insights-range.js';

/**
 * The three Insights blocks of part 2 (#402). Each reader is ONE statement:
 * a fixed set of CTEs on top of the shared range window (`insightsRangeCtes`,
 * so every block covers the same period as the sales block), aggregating in
 * Postgres and handing the Worker a bounded result (at most
 * `INSIGHTS_ATTENDANT_LIMIT` Attendants, one row per tank, one summary row).
 *
 * Tenancy: every table is reached through `organization_id` + `station_id`
 * predicates (Shift Summaries and Business-Day-keyed rows through their
 * tenant-scoped Business Day / Shift).
 */

const num = (v: unknown): number => Number(v ?? 0) || 0;

/** A jsonb value that is not an array (a snapshot frozen before the field existed) reads as empty. */
const asArray = (expr: string) =>
  sql.raw(`CASE WHEN jsonb_typeof(${expr}) = 'array' THEN ${expr} ELSE '[]'::jsonb END`);

/**
 * Cash variance by Attendant, from the Drawers of closed Shift Summaries.
 *
 * Only two-level snapshots (`cashVarianceModel >= 2`) have an attendant level:
 * before #287 the single cash variance already included the attendant
 * shortage, so there is nothing to attribute and those Shifts are skipped
 * rather than guessed at. A Drawer's variance is summed per (Attendant, Shift)
 * first, and that Shift figure is classified short / over / balanced by the
 * shared balanced rule (`VARIANCE_EPSILON`, i.e. `isBalancedVariance`), so the
 * counts agree with the Drawer reconciliation. The office count variance is a
 * different level and is never read here.
 *
 * Indexes: `business_days_org_station_date_uniq`, `shifts_business_day_idx`,
 * `shift_summaries_shift_idx`, `users` primary key.
 */
export class DrizzleInsightsAttendantVarianceReader implements InsightsAttendantVarianceReader {
  constructor(private readonly db: DbClient) {}

  async read(q: InsightsRangeQuery): Promise<InsightsAttendantVarianceRow[]> {
    const org = q.organizationId;
    const st = q.stationId;

    const rows = await this.db.execute(sql`
      WITH ${insightsRangeCtes(org, st, q.days)},
      drawers AS (
        SELECT s.id AS shift_id, d."attendantId" AS attendant_id,
               d."attendantName" AS snapshot_name, d.variance
        FROM bounds b
        JOIN business_days bd
          ON bd.organization_id = ${org} AND bd.station_id = ${st} AND bd.status = 'CLOSED'
         AND bd.business_date BETWEEN b."from" AND b."to"
        JOIN shifts s
          ON s.business_day_id = bd.id AND s.organization_id = ${org} AND s.station_id = ${st}
         AND s.status IN ('CLOSED', 'LOCKED')
        JOIN shift_summaries ss ON ss.shift_id = s.id
        CROSS JOIN LATERAL jsonb_to_recordset(
          CASE WHEN COALESCE((ss.snapshot_data ->> 'cashVarianceModel')::numeric, 0) >= 2
               THEN ${asArray(`ss.snapshot_data -> 'drawers'`)}
               ELSE '[]'::jsonb END
        ) AS d("attendantId" uuid, "attendantName" text, variance numeric)
        WHERE d."attendantId" IS NOT NULL AND d.variance IS NOT NULL
      ),
      per_shift AS (
        SELECT attendant_id, shift_id, MAX(snapshot_name) AS snapshot_name,
               ROUND(SUM(variance), 2) AS variance
        FROM drawers
        GROUP BY attendant_id, shift_id
      ),
      per_attendant AS (
        SELECT attendant_id, MAX(snapshot_name) AS snapshot_name,
               COUNT(*)::int AS shifts,
               COUNT(*) FILTER (WHERE variance < 0 AND ABS(variance) >= ${VARIANCE_EPSILON})::int AS "shortShifts",
               COUNT(*) FILTER (WHERE variance > 0 AND ABS(variance) >= ${VARIANCE_EPSILON})::int AS "overShifts",
               SUM(variance) AS "netVariance"
        FROM per_shift
        GROUP BY attendant_id
      )
      SELECT pa.attendant_id AS "attendantId",
             COALESCE(NULLIF(u.full_name, ''), NULLIF(pa.snapshot_name, ''), 'Unknown') AS name,
             pa.shifts, pa."shortShifts", pa."overShifts", pa."netVariance"
      FROM per_attendant pa
      LEFT JOIN users u ON u.id = pa.attendant_id AND u.organization_id = ${org}
      ORDER BY ABS(pa."netVariance") DESC, name
      LIMIT ${INSIGHTS_ATTENDANT_LIMIT}
    `);

    return (rows as unknown as Record<string, unknown>[]).map((r) => ({
      attendantId: String(r.attendantId),
      name: String(r.name),
      shifts: num(r.shifts),
      shortShifts: num(r.shortShifts),
      overShifts: num(r.overShifts),
      netVariance: num(r.netVariance),
    }));
  }
}

/**
 * Stock loss per tank: recorded Tank Dip variances (`stock_variances`, dip
 * minus book where book is the `stock_movements` ledger at dip time) of the
 * range's closed Business Days, beside the litres each tank sold (the net
 * volume its Nozzles metered, from the days' DSSR snapshots).
 *
 * A dip recorded while a Shift was open is excluded: it was not reconciled
 * (in-flight sales were not booked yet), so its variance is not a loss.
 * Tanks with no recorded dip in the range are not listed: nothing was
 * measured, so a zero would be a claim.
 *
 * Indexes: `business_days_org_station_date_uniq`,
 * `dssr_snapshots_org_station_date_idx`, primary keys of nozzles / tanks /
 * products. `stock_variances` has no index on `business_day_id`; it is a small
 * table (a few rows per tank per dip) and is filtered by the closed-day list.
 */
export class DrizzleInsightsStockLossReader implements InsightsStockLossReader {
  constructor(private readonly db: DbClient) {}

  async read(q: InsightsRangeQuery): Promise<InsightsStockLossRow[]> {
    const org = q.organizationId;
    const st = q.stationId;

    const rows = await this.db.execute(sql`
      WITH ${insightsRangeCtes(org, st, q.days)},
      closed_days AS (
        SELECT bd.id, bd.business_date
        FROM bounds b
        JOIN business_days bd
          ON bd.organization_id = ${org} AND bd.station_id = ${st} AND bd.status = 'CLOSED'
         AND bd.business_date BETWEEN b."from" AND b."to"
      ),
      dips AS (
        SELECT sv.tank_id, SUM(sv.variance_quantity) AS variance
        FROM closed_days cd
        JOIN stock_variances sv
          ON sv.business_day_id = cd.id
         AND sv.organization_id = ${org} AND sv.station_id = ${st}
        WHERE sv.tank_id IS NOT NULL
          AND COALESCE(sv.metadata ->> 'openShiftAtRecording', 'false') <> 'true'
        GROUP BY sv.tank_id
      ),
      sold AS (
        SELECT n.tank_id,
               SUM(COALESCE(f."netVolume",
                            COALESCE(f."grossVolume", 0) - COALESCE(f."testingVolume", 0))) AS litres
        FROM closed_days cd
        JOIN dssr_snapshots ds
          ON ds.organization_id = ${org} AND ds.station_id = ${st}
         AND ds.business_date = cd.business_date
        CROSS JOIN LATERAL jsonb_to_recordset(
          ${asArray(`ds.snapshot_data -> 'fuel' -> 'nozzles'`)}
        ) AS f("nozzleId" uuid, "netVolume" numeric, "grossVolume" numeric, "testingVolume" numeric)
        JOIN nozzles n ON n.id = f."nozzleId" AND n.organization_id = ${org} AND n.station_id = ${st}
        GROUP BY n.tank_id
      )
      SELECT t.id AS "tankId", t.name AS "tankName", p.code AS "productCode",
             dips.variance AS "varianceLitres",
             COALESCE(sold.litres, 0) AS "soldLitres",
             COALESCE(p.cost_basis, 0) AS "costBasis"
      FROM dips
      JOIN tanks t ON t.id = dips.tank_id AND t.organization_id = ${org} AND t.station_id = ${st}
      JOIN products p ON p.id = t.product_id AND p.organization_id = ${org}
      LEFT JOIN sold ON sold.tank_id = t.id
      ORDER BY dips.variance, t.name
    `);

    return (rows as unknown as Record<string, unknown>[]).map((r) => ({
      tankId: String(r.tankId),
      tankName: String(r.tankName),
      productCode: String(r.productCode),
      varianceLitres: num(r.varianceLitres),
      soldLitres: num(r.soldLitres),
      costBasis: num(r.costBasis),
    }));
  }
}

/**
 * Credit health. The two halves have different anchors (ADR 0005):
 *
 * - Credit Sales are forecourt records, placed by Business Date: the day's
 *   sealed DSSR snapshot (`credit.total`) for each CLOSED day of the range, and
 *   the same days' fuel + product sales for the credit share.
 * - Collections are Office Records, placed by Entry Date: `collections` rows
 *   whose station-timezone `entry_date` is in the range, whatever Business Day
 *   (or none) was running, and whatever method or terminal took them.
 *
 * Indexes: `business_days_org_station_date_uniq`,
 * `dssr_snapshots_org_station_date_idx`, `collections_org_station_entry_date_idx`.
 */
export class DrizzleInsightsCreditHealthReader implements InsightsCreditHealthReader {
  constructor(private readonly db: DbClient) {}

  async read(q: InsightsRangeQuery): Promise<InsightsCreditHealthSource> {
    const org = q.organizationId;
    const st = q.stationId;

    const result = await this.db.execute(sql`
      WITH ${insightsRangeCtes(org, st, q.days)},
      sealed_days AS (
        SELECT (ds.business_date >= b."from") AS current_period,
               COALESCE((ds.snapshot_data -> 'credit' ->> 'total')::numeric, 0) AS credit,
               ${dssrDaySales('ds.snapshot_data')} AS sales
        FROM bounds b
        JOIN dssr_snapshots ds
          ON ds.organization_id = ${org} AND ds.station_id = ${st}
         AND ds.business_date BETWEEN b."previousFrom" AND b."to"
        JOIN business_days bd
          ON bd.organization_id = ds.organization_id AND bd.station_id = ds.station_id
         AND bd.business_date = ds.business_date AND bd.status = 'CLOSED'
      ),
      collected AS (
        SELECT COALESCE(SUM(c.amount), 0) AS total
        FROM bounds b
        JOIN collections c
          ON c.organization_id = ${org} AND c.station_id = ${st}
         AND c.entry_date BETWEEN b."from" AND b."to"
      )
      SELECT
        (SELECT row_to_json(bounds) FROM bounds) AS bounds,
        COALESCE((SELECT json_build_object(
          'creditGiven', COALESCE(SUM(credit), 0),
          'sales', COALESCE(SUM(sales), 0),
          'closedDays', COUNT(*))
          FROM sealed_days WHERE current_period),
          '{"creditGiven":0,"sales":0,"closedDays":0}'::json) AS current,
        COALESCE((SELECT json_build_object(
          'creditGiven', COALESCE(SUM(credit), 0),
          'closedDays', COUNT(*))
          FROM sealed_days WHERE NOT current_period),
          '{"creditGiven":0,"closedDays":0}'::json) AS previous,
        COALESCE((SELECT total FROM collected), 0) AS collected
    `);

    const row = (result as unknown as Record<string, any>[])[0] ?? {};
    const bounds = row.bounds as Record<string, string> | null;
    return {
      range: bounds ? { from: bounds.from, to: bounds.to } : null,
      closedDays: num(row.current?.closedDays),
      creditGiven: num(row.current?.creditGiven),
      sales: num(row.current?.sales),
      collected: num(row.collected),
      previous: {
        creditGiven: num(row.previous?.creditGiven),
        closedDays: num(row.previous?.closedDays),
      },
    };
  }
}
