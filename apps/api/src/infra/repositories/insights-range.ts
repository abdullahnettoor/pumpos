import { sql } from 'drizzle-orm';

/**
 * The Insights date window, shared by every Insights reader (sales block now,
 * the variance / stock / credit blocks of #402 next) so they all cover the SAME
 * period.
 *
 * Two CTEs, to be placed first in a `WITH` list:
 *
 * - `last_closed(d)`: the newest CLOSED Business Day that has its sealed DSSR
 *   snapshot. Open days never move the window, so a figure never changes once
 *   its day has closed. Zero rows when the Station has none.
 * - `bounds("to", "from", "previousTo", "previousFrom")`: the current period
 *   (`days` Business Dates ending at `d`) and the equal period before it, as
 *   plain `YYYY-MM-DD` strings (compare with `business_date`, a varchar).
 *   Zero rows when `last_closed` is empty, so every join through `bounds`
 *   yields nothing for a Station with no history.
 *
 * Tenancy: `organization_id` + `station_id` predicates on `business_days` and
 * `dssr_snapshots`; later CTEs must keep scoping the tables they add.
 * Indexes: `business_days_org_station_date_uniq`, `dssr_snapshots_org_station_date_idx`.
 */
export function insightsRangeCtes(org: string, stationId: string, days: number) {
  return sql`
      last_closed AS (
        SELECT bd.business_date AS d
        FROM business_days bd
        WHERE bd.organization_id = ${org} AND bd.station_id = ${stationId} AND bd.status = 'CLOSED'
          AND EXISTS (
            SELECT 1 FROM dssr_snapshots ds
            WHERE ds.organization_id = bd.organization_id AND ds.station_id = bd.station_id
              AND ds.business_date = bd.business_date)
        ORDER BY bd.business_date DESC
        LIMIT 1
      ),
      bounds AS (
        SELECT
          d AS "to",
          to_char(d::date - (${days}::int - 1), 'YYYY-MM-DD') AS "from",
          to_char(d::date - ${days}::int, 'YYYY-MM-DD') AS "previousTo",
          to_char(d::date - (2 * ${days}::int - 1), 'YYYY-MM-DD') AS "previousFrom"
        FROM last_closed
      )`;
}
