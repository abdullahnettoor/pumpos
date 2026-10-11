import { sql, type SQL } from 'drizzle-orm';
import { UUID_PATTERN } from '@pump/shared';

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

/** Credit Sales of the day: `credit.total`. */
export const dssrCreditTotal = (ref: string): SQL => {
  const data = column(ref);
  return sql`COALESCE((${data} -> 'credit' ->> 'total')::numeric, 0)`;
};

/**
 * Net litres of one `fuel.nozzles[]` / `fuel.byProduct[]` element read with
 * `jsonb_to_recordset(... ) AS alias("netVolume" numeric, "grossVolume" numeric,
 * "testingVolume" numeric)`: the stored net, else gross minus testing (a day
 * frozen before net volume was stored). `alias` is a trusted identifier.
 */
export const dssrNetVolumeOfRecord = (alias: string): SQL => {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(alias)) {
    throw new Error(`dssr-snapshot-sql: expected an identifier, got "${alias}"`);
  }
  const a = sql.raw(alias);
  return sql`COALESCE(${a}."netVolume", COALESCE(${a}."grossVolume", 0) - COALESCE(${a}."testingVolume", 0))`;
};

/** Net litres in a stored Shift Summary: readings, stored net, then gross less testing. */

/**
 * A jsonb path that should hold an array: anything else (absent, null, an
 * object: a snapshot frozen before the field existed) reads as empty, so
 * `jsonb_to_recordset` never fails on it. `expr` is a SQL expression, e.g.
 * `` sql`ds.snapshot_data -> 'fuel' -> 'nozzles'` ``.
 */
export const jsonbArray = (expr: SQL): SQL =>
  sql`(CASE WHEN jsonb_typeof(${expr}) = 'array' THEN ${expr} ELSE '[]'::jsonb END)`;

/**
 * A uuid read from a snapshot as TEXT (declare the recordset column as `text`),
 * NULL when it is not a well-formed uuid, so one malformed id in a frozen
 * snapshot drops that element instead of failing the whole statement.
 * `column` is a trusted `alias."column"` reference.
 */
export const uuidOrNull = (ref: string): SQL => {
  const c = column(ref);
  return sql`(CASE WHEN ${c} ~* ${UUID_PATTERN} THEN ${c}::uuid END)`;
};
