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
import { CASH_VARIANCE_MODEL_TWO_LEVEL, num, VARIANCE_EPSILON } from '@pump/shared';
import {
  dssrCreditTotal,
  dssrDaySales,
  dssrNetVolumeOfRecord,
  jsonbArray,
  uuidOrNull,
} from '../dssr-snapshot-sql.js';
import {
  insightsClosedDaysCte,
  insightsRangeCtes,
  insightsSealedDaysCte,
} from './insights-range.js';

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
      ${insightsClosedDaysCte(org, st)},
      drawers AS (
        SELECT s.id AS shift_id, ${uuidOrNull('d."attendantId"')} AS attendant_id,
               d."attendantName" AS snapshot_name, d.variance
        FROM closed_days cd
        JOIN shifts s
          ON s.business_day_id = cd.id AND s.organization_id = ${org} AND s.station_id = ${st}
         AND s.status IN ('CLOSED', 'LOCKED')
        JOIN shift_summaries ss ON ss.shift_id = s.id
        CROSS JOIN LATERAL jsonb_to_recordset(
          CASE WHEN COALESCE((ss.snapshot_data ->> 'cashVarianceModel')::numeric, 0) >= ${CASH_VARIANCE_MODEL_TWO_LEVEL}
               THEN ${jsonbArray(sql`ss.snapshot_data -> 'drawers'`)}
               ELSE '[]'::jsonb END
        ) AS d("attendantId" text, "attendantName" text, variance numeric)
        WHERE d.variance IS NOT NULL
      ),
      per_shift AS (
        SELECT attendant_id, shift_id, MAX(snapshot_name) AS snapshot_name,
               ROUND(SUM(variance), 2) AS variance
        FROM drawers
        WHERE attendant_id IS NOT NULL
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
 * Stock loss per tank, from the SEALED DSSR snapshots of the range's closed
 * Business Days: each snapshot's `fuelStockVariance` rows (Tank Dip actual
 * minus book, plus the tank, product and cost per litre frozen at close), beside
 * the litres each tank sold (the net volume its Nozzles metered, from the same
 * snapshots).
 *
 * Sourcing from the snapshot, not from `stock_variances`, is what makes the
 * figure the DSSR's own: the block's total equals the sum of the days' DSSR
 * stock variances (and /inventory/variances), dips taken while a Shift was open
 * included, and the rupee value cannot move after the day closed (it is
 * variance x the unit cost frozen in the snapshot, never the live
 * `products.cost_basis`). A row whose snapshot predates the frozen cost leaves
 * the tank's value null rather than guessing; one whose snapshot predates the
 * frozen tank id is matched by tank name when that name is unique at the Station.
 *
 * Every active tank is listed (zero litres and zero dips when nothing was
 * recorded), plus any inactive tank that has a dip or sales in the range.
 *
 * Indexes: `business_days_org_station_date_uniq`,
 * `dssr_snapshots_org_station_date_idx`, primary keys of nozzles / tanks /
 * products. No `stock_variances` read at all.
 */
export class DrizzleInsightsStockLossReader implements InsightsStockLossReader {
  constructor(private readonly db: DbClient) {}

  async read(q: InsightsRangeQuery): Promise<InsightsStockLossRow[]> {
    const org = q.organizationId;
    const st = q.stationId;

    const rows = await this.db.execute(sql`
      WITH ${insightsRangeCtes(org, st, q.days)},
      ${insightsClosedDaysCte(org, st)},
      tank_names AS (
        SELECT t.name, (array_agg(t.id))[1] AS id
        FROM tanks t
        WHERE t.organization_id = ${org} AND t.station_id = ${st}
        GROUP BY t.name
        HAVING COUNT(*) = 1
      ),
      dip_rows AS (
        SELECT COALESCE(${uuidOrNull('v."tankId"')}, tn.id) AS tank_id,
               v."varianceQuantity" AS variance,
               NULLIF(v."unitCost", 0) AS unit_cost
        FROM closed_days cd
        JOIN dssr_snapshots ds
          ON ds.organization_id = ${org} AND ds.station_id = ${st}
         AND ds.business_date = cd.business_date
        CROSS JOIN LATERAL jsonb_to_recordset(
          ${jsonbArray(sql`ds.snapshot_data -> 'fuelStockVariance'`)}
        ) AS v("tankId" text, "tankName" text, "varianceQuantity" numeric, "unitCost" numeric)
        LEFT JOIN tank_names tn ON tn.name = v."tankName"
        WHERE v."varianceQuantity" IS NOT NULL
      ),
      dips AS (
        SELECT tank_id,
               SUM(variance) AS variance,
               COUNT(*)::int AS dips,
               CASE WHEN COUNT(*) FILTER (WHERE variance <> 0 AND unit_cost IS NULL) > 0 THEN NULL
                    ELSE SUM(variance * COALESCE(unit_cost, 0)) END AS worth
        FROM dip_rows
        WHERE tank_id IS NOT NULL
        GROUP BY tank_id
      ),
      sold AS (
        SELECT n.tank_id, SUM(${dssrNetVolumeOfRecord('f')}) AS litres
        FROM closed_days cd
        JOIN dssr_snapshots ds
          ON ds.organization_id = ${org} AND ds.station_id = ${st}
         AND ds.business_date = cd.business_date
        CROSS JOIN LATERAL jsonb_to_recordset(
          ${jsonbArray(sql`ds.snapshot_data -> 'fuel' -> 'nozzles'`)}
        ) AS f("nozzleId" text, "netVolume" numeric, "grossVolume" numeric, "testingVolume" numeric)
        JOIN nozzles n
          ON n.id = ${uuidOrNull('f."nozzleId"')} AND n.organization_id = ${org} AND n.station_id = ${st}
        GROUP BY n.tank_id
      )
      SELECT t.id AS "tankId", t.name AS "tankName", p.code AS "productCode",
             COALESCE(dips.variance, 0) AS "varianceLitres",
             COALESCE(sold.litres, 0) AS "soldLitres",
             COALESCE(dips.dips, 0) AS dips,
             CASE WHEN dips.tank_id IS NULL THEN 0 ELSE dips.worth END AS "valueAtCost"
      FROM tanks t
      JOIN products p ON p.id = t.product_id AND p.organization_id = ${org}
      LEFT JOIN dips ON dips.tank_id = t.id
      LEFT JOIN sold ON sold.tank_id = t.id
      WHERE t.organization_id = ${org} AND t.station_id = ${st}
        AND (t.status = 'ACTIVE' OR dips.tank_id IS NOT NULL OR sold.tank_id IS NOT NULL)
      ORDER BY COALESCE(dips.variance, 0), t.name
    `);

    return (rows as unknown as Record<string, unknown>[]).map((r) => ({
      tankId: String(r.tankId),
      tankName: String(r.tankName),
      productCode: String(r.productCode),
      varianceLitres: num(r.varianceLitres),
      soldLitres: num(r.soldLitres),
      dips: num(r.dips),
      valueAtCost: r.valueAtCost === null ? null : num(r.valueAtCost),
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
      ${insightsSealedDaysCte(
        org,
        st,
        sql`${dssrCreditTotal('ds.snapshot_data')} AS credit,
               ${dssrDaySales('ds.snapshot_data')} AS sales`,
      )},
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
