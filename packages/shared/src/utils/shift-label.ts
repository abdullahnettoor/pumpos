/**
 * The human-readable name of a shift: `YYYYMMDD-N` — the business day it
 * belongs to, then its position within that day (`20260917-2` is the second
 * shift of 17 Sep 2026).
 *
 * Two rules make the label trustworthy, and both are the reason this lives in
 * one shared module rather than at each render site:
 *
 * 1. **Derived, never an identifier.** UUIDs remain the only identifiers
 *    (data-modeling rules) and no column stores this; the label is projected at
 *    read time from the business date plus the ordering of that day's shifts.
 *    Report snapshots freeze it the way they freeze every other figure.
 * 2. **Stable under voiding.** The sequence is taken over *every* shift the
 *    business day ever had, including voided/archived ones. A voided shift
 *    keeps its slot, so a label printed on yesterday's statement still names
 *    the same shift tomorrow. Filtering the voided rows out before sequencing
 *    would renumber every later shift of the day — never do it.
 *
 * Numbering resets with each business day.
 */

/** A shift as far as sequencing is concerned: when it opened, and which one it is. */
export interface SequencableShift {
  id: string;
  /** ISO timestamp. Ties break on `id` so the order is total and stable. */
  openedAt: string | Date | null | undefined;
}

/** `2026-09-17` + `2` → `20260917-2`. */
export function formatShiftLabel(
  businessDate: string | null | undefined,
  sequence: number | null | undefined,
): string | null {
  if (!businessDate || !sequence || sequence < 1) return null;
  const compact = businessDate.replace(/-/g, '');
  if (!/^\d{8}$/.test(compact)) return null;
  return `${compact}-${sequence}`;
}

const openedAtMs = (value: string | Date | null | undefined): number => {
  if (!value) return Number.POSITIVE_INFINITY;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms;
};

/**
 * Sequence numbers for one business day's shifts, keyed by shift id.
 *
 * This is the executable statement of the ordering rule. In production the
 * sequence is projected in SQL (`shiftSequenceSql`, apps/api) so a single
 * shift can be labelled without loading its whole day; that fragment mirrors
 * this ordering — `(opened_at, id)` ascending — and the tests here are what
 * pins it.
 *
 * Pass every shift of the day — voided ones included — or later shifts will
 * renumber (see rule 2 above).
 */
export function deriveShiftSequences(shifts: readonly SequencableShift[]): Map<string, number> {
  const ordered = [...shifts].sort((a, b) => {
    const delta = openedAtMs(a.openedAt) - openedAtMs(b.openedAt);
    if (delta !== 0) return delta;
    // Plain codepoint comparison, deliberately not `localeCompare`: Postgres
    // orders `uuid` by its 16 raw bytes, which for the canonical lowercase hex
    // form is exactly this. A collation-aware compare treats the hyphens
    // differently and would let the server and the client disagree.
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  const out = new Map<string, number>();
  ordered.forEach((shift, index) => out.set(shift.id, index + 1));
  return out;
}

/**
 * What a human-facing surface prints for a shift: the label when the read
 * carries a business date and a sequence, otherwise a UUID fragment.
 *
 * The fallback exists for snapshots frozen before #228, whose stored payload
 * has no sequence to project; it is deliberately the *last* resort, never the
 * primary label. One helper so the UI, the shift-summary PDF and the attendant
 * statement cannot print different names for the same shift.
 */
export function shiftDisplayLabel(shift: {
  businessDate?: string | null;
  shiftSequence?: number | null;
  shiftId?: string | null;
}): string {
  const label = formatShiftLabel(shift.businessDate, shift.shiftSequence);
  if (label) return label;
  return shift.shiftId ? `${String(shift.shiftId).slice(0, 8)}\u2026` : '—';
}
