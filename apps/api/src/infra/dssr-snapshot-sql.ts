import { sql, type SQL } from 'drizzle-orm';

/**
 * The one place that knows where a day's sales figures live inside a stored
 * DSSR snapshot (`dssr_snapshots.snapshot_data`, written by `composeDssr`).
 * Readers that aggregate sealed days in SQL (the Reports day list, Insights)
 * build their expressions from these fragments, so a change to the snapshot
 * shape or to the volume fallback is made once.
 *
 * Each fragment is a numeric expression that is never NULL (absent paths read
 * as 0). `ref` is a trusted `alias.snapshot_column` reference, validated here.
 */

const REF = /^[a-zA-Z_][a-zA-Z0-9_]*\."?[a-zA-Z_][a-zA-Z0-9_]*"?$/;

function column(ref: string): SQL {
  if (!REF.test(ref)) {
    throw new Error(`dssr-snapshot-sql: expected an alias.column reference, got "${ref}"`);
  }
  return sql.raw(ref);
}

/** Fuel sales value of the day: `fuel.totalSalesValue`. */
export const dssrFuelSalesValue = (ref: string): SQL => {
  const data = column(ref);
  return sql`COALESCE((${data} -> 'fuel' ->> 'totalSalesValue')::numeric, 0)`;
};

/** Product (merchandise) sales value of the day: `merchandise.salesValue`. */
export const dssrProductSalesValue = (ref: string): SQL => {
  const data = column(ref);
  return sql`COALESCE((${data} -> 'merchandise' ->> 'salesValue')::numeric, 0)`;
};

/** Fuel + product sales of the day. */
export const dssrDaySales = (ref: string): SQL =>
  sql`(${dssrFuelSalesValue(ref)} + ${dssrProductSalesValue(ref)})`;

/**
 * Net fuel litres sold (testing excluded): `fuel.totalNetVolume`, else — for a
 * snapshot frozen before net volume was stored — gross minus testing, where
 * gross is `totalGrossVolume` / the legacy `totalVolume`. Always net, so a
 * sealed day and the same day rolled up from Shift Summaries agree.
 */
export const dssrNetVolume = (ref: string): SQL => {
  const data = column(ref);
  return sql`COALESCE((${data} -> 'fuel' ->> 'totalNetVolume')::numeric,
    COALESCE((${data} -> 'fuel' ->> 'totalGrossVolume')::numeric,
             (${data} -> 'fuel' ->> 'totalVolume')::numeric, 0)
      - COALESCE((${data} -> 'fuel' ->> 'totalTestingVolume')::numeric, 0))`;
};
