import { sql, type SQL } from 'drizzle-orm';

/** The aliases the `shifts` row goes by in this codebase's statements. */
export type ShiftAlias = 's' | 'shifts';

/**
 * A shift's position within its business day — the `N` of the `YYYYMMDD-N`
 * label operators read (see `formatShiftLabel` in `@pump/shared`).
 *
 * Derived at read time, never stored: UUIDs stay the only identifiers. The
 * count is taken over *every* shift of the day, voided ones included, so a
 * voided shift keeps its slot and later shifts never renumber — the label on
 * yesterday's printed statement still names the same shift tomorrow.
 *
 * Ordering is `(opened_at, id)`, matching `deriveShiftSequences` in
 * `@pump/shared` exactly, so a label derived on the client from a day's shift
 * list agrees with one projected here.
 *
 * @param alias the SQL alias of the `shifts` row being projected. A closed set
 *   rather than free text: the value is interpolated raw, and nothing outside
 *   this module should be able to choose it.
 */
export function shiftSequenceSql(alias: ShiftAlias): SQL<number> {
  const a = sql.raw(alias);
  return sql<number>`(
    SELECT COUNT(*)
    FROM shifts seq
    WHERE seq.business_day_id = ${a}.business_day_id
      AND (seq.opened_at, seq.id) <= (${a}.opened_at, ${a}.id)
  )::int`;
}
