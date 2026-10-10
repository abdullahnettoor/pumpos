import { sql } from 'drizzle-orm';
import { dssrDaySales, dssrNetVolume, dssrProductSalesValue } from '../dssr-snapshot-sql.js';
import type { DbClient } from '@pump/db';
import { insightsRangeCtes } from './insights-range.js';
import type {
  InsightsSalesQuery,
  InsightsSalesReader,
  InsightsSalesSource,
  InsightsTemplateRow,
} from '@pump/core';

const num = (v: unknown): number => Number(v ?? 0) || 0;

/** A jsonb value that is not an array (a snapshot frozen before the field existed) reads as empty. */
const jsonArray = (expr: ReturnType<typeof sql.raw>) =>
  sql`CASE WHEN jsonb_typeof(${expr}) = 'array' THEN ${expr} ELSE '[]'::jsonb END`;

/**
 * Reads the Insights sales block's sealed-data aggregates in ONE statement.
 *
 * "Sealed" = the DSSR snapshot of a CLOSED Business Day and the Shift Summaries
 * of that day's Shifts; no live preview is ever built. The statement is a fixed
 * set of CTEs whatever the range, aggregating in Postgres (`->>` for scalars,
 * `jsonb_to_recordset` for per-product arrays) so the Worker only maps a bounded
 * result: at most `days` day rows, one row per fuel grade / Shift Template, and
 * a single top product.
 *
 * Tenancy: every table is reached through `organization_id` + `station_id`
 * predicates (Shift Summaries through their Shift). Indexes used:
 * `business_days_org_station_date_uniq`, `dssr_snapshots_org_station_date_idx`,
 * `shifts_business_day_idx`, `shift_summaries_shift_idx`.
 */
export class DrizzleInsightsSalesReader implements InsightsSalesReader {
  constructor(private readonly db: DbClient) {}

  async read(q: InsightsSalesQuery): Promise<InsightsSalesSource> {
    const org = q.organizationId;
    const st = q.stationId;
    const days = q.days;

    const rows = await this.db.execute(sql`
      WITH ${insightsRangeCtes(org, st, days)},
      sealed_days AS (
        SELECT
          ds.business_date AS date,
          (ds.business_date >= b."from") AS current_period,
          ${dssrDaySales('ds.snapshot_data')} AS sales,
          ${dssrProductSalesValue('ds.snapshot_data')} AS other_sales,
          ${dssrNetVolume('ds.snapshot_data')} AS volume,
          ${jsonArray(sql.raw(`ds.snapshot_data -> 'fuel' -> 'byProduct'`))} AS fuel_by_product,
          ${jsonArray(sql.raw(`ds.snapshot_data -> 'pnl' -> 'byProduct'`))} AS pnl_by_product
        FROM bounds b
        JOIN dssr_snapshots ds
          ON ds.organization_id = ${org} AND ds.station_id = ${st}
         AND ds.business_date BETWEEN b."previousFrom" AND b."to"
        JOIN business_days bd
          ON bd.organization_id = ds.organization_id AND bd.station_id = ds.station_id
         AND bd.business_date = ds.business_date AND bd.status = 'CLOSED'
      ),
      fuel_mix AS (
        SELECT
          COALESCE(NULLIF(f."productCode", ''), f."productName", 'Unknown') AS "productCode",
          COALESCE(NULLIF(f.unit, ''), 'L') AS unit,
          SUM(COALESCE(f."netVolume", COALESCE(f."grossVolume", 0) - COALESCE(f."testingVolume", 0))) AS quantity
        FROM sealed_days sd,
          jsonb_to_recordset(sd.fuel_by_product) AS f(
            "productCode" text, "productName" text, unit text,
            "netVolume" numeric, "grossVolume" numeric, "testingVolume" numeric)
        WHERE sd.current_period
        GROUP BY 1, 2
      ),
      top_other AS (
        -- Best seller by REVENUE: units are not comparable across products (1 L vs a 5 L can).
        SELECT p.name, SUM(p.quantity) AS quantity, SUM(p.revenue) AS revenue
        FROM sealed_days sd,
          jsonb_to_recordset(sd.pnl_by_product) AS p(
            "productId" text, name text, kind text, quantity numeric, revenue numeric)
        WHERE sd.current_period AND p.kind = 'merchandise'
        GROUP BY p."productId", p.name
        ORDER BY SUM(p.revenue) DESC, p.name
        LIMIT 1
      ),
      templates AS (
        SELECT
          s.shift_template_id AS "templateId",
          COALESCE(t.name, 'Custom') AS name,
          COUNT(*)::int AS shifts,
          SUM(COALESCE((ss.snapshot_data ->> 'totalFuelSalesValue')::numeric, 0)) AS "totalSales",
          SUM(COALESCE((ss.snapshot_data ->> 'totalNetVolume')::numeric,
                       (ss.snapshot_data ->> 'totalVolume')::numeric, 0)) AS "totalVolume",
          SUM(COALESCE((ss.snapshot_data ->> 'cashVariance')::numeric, 0)) AS "totalCashVariance",
          MIN(t.start_time) AS start_time
        FROM bounds b
        JOIN business_days bd
          ON bd.organization_id = ${org} AND bd.station_id = ${st} AND bd.status = 'CLOSED'
         AND bd.business_date BETWEEN b."from" AND b."to"
        JOIN shifts s
          ON s.business_day_id = bd.id AND s.organization_id = ${org} AND s.station_id = ${st}
        JOIN shift_summaries ss ON ss.shift_id = s.id
        LEFT JOIN shift_templates t ON t.id = s.shift_template_id
        GROUP BY s.shift_template_id, t.name
      )
      SELECT
        (SELECT row_to_json(bounds) FROM bounds) AS bounds,
        COALESCE((SELECT json_agg(json_build_object(
          'date', date, 'sales', sales, 'volume', volume) ORDER BY date)
          FROM sealed_days WHERE current_period), '[]'::json) AS days,
        COALESCE((SELECT json_build_object(
          'sales', COALESCE(SUM(sales), 0),
          'otherSales', COALESCE(SUM(other_sales), 0),
          'closedDays', COUNT(*))
          FROM sealed_days WHERE NOT current_period),
          '{"sales":0,"otherSales":0,"closedDays":0}'::json) AS previous,
        COALESCE((SELECT json_agg(fuel_mix) FROM fuel_mix), '[]'::json) AS fuel_volumes,
        COALESCE((SELECT SUM(other_sales) FROM sealed_days WHERE current_period), 0) AS other_total,
        (SELECT row_to_json(top_other) FROM top_other) AS top_other,
        COALESCE((SELECT json_agg(row_to_json(templates) ORDER BY start_time NULLS LAST, name)
          FROM templates), '[]'::json) AS templates
    `);

    const row = (rows as unknown as Record<string, any>[])[0] ?? {};
    const bounds = row.bounds as Record<string, string> | null;

    return {
      range: bounds ? { from: bounds.from, to: bounds.to } : null,
      previousRange: bounds ? { from: bounds.previousFrom, to: bounds.previousTo } : null,
      days: ((row.days ?? []) as any[]).map((d) => ({
        date: String(d.date),
        sales: num(d.sales),
        volume: num(d.volume),
      })),
      previous: {
        sales: num(row.previous?.sales),
        closedDays: num(row.previous?.closedDays),
        otherSales: num(row.previous?.otherSales),
      },
      fuelVolumes: ((row.fuel_volumes ?? []) as any[]).map((p) => ({
        productCode: String(p.productCode),
        unit: String(p.unit),
        quantity: num(p.quantity),
      })),
      other: {
        total: num(row.other_total),
        top: row.top_other
          ? {
              name: String(row.top_other.name),
              quantity: num(row.top_other.quantity),
              revenue: num(row.top_other.revenue),
            }
          : null,
      },
      templates: ((row.templates ?? []) as any[]).map((t): InsightsTemplateRow => ({
        templateId: t.templateId ?? null,
        name: String(t.name),
        shifts: num(t.shifts),
        totalSales: num(t.totalSales),
        totalVolume: num(t.totalVolume),
        totalCashVariance: num(t.totalCashVariance),
      })),
    };
  }
}
