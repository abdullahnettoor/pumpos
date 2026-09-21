import { getTableColumns, sql, type SQL } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';

/**
 * SQL fragments that render rows as jsonb with EXACTLY the shape drizzle's
 * query builder + c.json() would produce, so a consolidated CTE statement can
 * replace N builder round-trips without changing a single payload byte:
 *
 * - keys are the schema's camelCase property names (not the snake_case columns)
 * - numeric/decimal columns render as strings ("1500.00"), like pg's driver
 * - timestamps render as ISO-8601 UTC with milliseconds, like Date#toJSON
 * - uuid/varchar/bool/int/jsonb pass through natively
 *
 * All identifiers come from the drizzle schema (never user input), so building
 * the fragment with sql.raw is safe.
 */

/** ISO-8601 UTC rendering for a timestamp column reference (Date#toJSON shape).
 *  Accepts only `alias.column` / `alias."column"` identifiers — this file's job
 *  is safe raw-SQL construction, so the one string-taking helper is guarded. */
export const tsIso = (columnRef: string): SQL => {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*\."?[a-zA-Z_][a-zA-Z0-9_]*"?$/.test(columnRef)) {
    throw new Error(`tsIso: expected an alias.column reference, got "${columnRef}"`);
  }
  return sql.raw(`to_char(${columnRef}, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`);
};

const jsonValueFor = (columnType: string, ref: string): string => {
  switch (columnType) {
    case 'PgNumeric':
      // drizzle returns numerics as strings; ::text preserves scale ("5000.00").
      return `${ref}::text`;
    case 'PgTimestamp':
      return `to_char(${ref}, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
    default:
      return ref;
  }
};

/**
 * jsonb_build_object(...) over every column of `table`, aliased `alias`,
 * keyed by the schema's camelCase property names.
 */
export function rowJson(table: PgTable, alias: string): SQL {
  const cols = getTableColumns(table);
  const pairs = Object.entries(cols).map(
    ([prop, col]) => `'${prop}', ${jsonValueFor(col.columnType, `${alias}."${col.name}"`)}`,
  );
  return sql.raw(`jsonb_build_object(${pairs.join(', ')})`);
}

/**
 * rowJson wrapped to yield SQL NULL when the (left-joined) row is absent —
 * matching drizzle's `nz: null` for an unmatched leftJoin instead of an
 * object full of nulls. Assumes the table has an `id` primary key.
 */
export function rowJsonNullable(table: PgTable, alias: string): SQL {
  const cols = getTableColumns(table);
  const pairs = Object.entries(cols).map(
    ([prop, col]) => `'${prop}', ${jsonValueFor(col.columnType, `${alias}."${col.name}"`)}`,
  );
  return sql.raw(
    `CASE WHEN ${alias}."id" IS NULL THEN NULL ELSE jsonb_build_object(${pairs.join(', ')}) END`,
  );
}

/**
 * Like rowJson but only the listed properties — for narrow selections that
 * must match an explicit drizzle `.select({...})` shape.
 */
export function rowJsonPick(table: PgTable, alias: string, props: string[]): SQL {
  const cols = getTableColumns(table);
  const pairs = props.map((prop) => {
    const col = cols[prop] as { name: string; columnType: string } | undefined;
    if (!col) throw new Error(`rowJsonPick: unknown column property "${prop}"`);
    return `'${prop}', ${jsonValueFor(col.columnType, `${alias}."${col.name}"`)}`;
  });
  return sql.raw(`jsonb_build_object(${pairs.join(', ')})`);
}
