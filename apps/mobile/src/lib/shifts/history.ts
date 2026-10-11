/**
 * Closed-Shift history for the Shifts tab: summaries grouped by the Shift's
 * Business Date (not the calendar day it opened), newest first.
 */
import { businessDateLabel, stationDay } from '../dates.js';
import { round2 } from '../num.js';
import { shiftLabel, type Snapshot } from '../home/sales.js';
import type { VarianceBadgeView } from '../variance.js';
import { shiftHeadlineBadge } from '../cashVariance.js';
import { deriveSalesTotals } from './summary.js';
import { deriveShiftVariance } from './variance.js';
import { windowLabel } from './window.js';

/** One row of `GET /shifts/shift-summaries`. */
export type ShiftSummaryRow = Snapshot & { shiftId: string };

export interface ShiftHistoryRow {
  shiftId: string;
  title: string;
  window: string;
  /** Total sales from the snapshot (fuel + Product Sales): the figure the Shift Summary page leads with. */
  sales: number;
  /** The Shift's headline variance, naming its level ("Attendants −₹125"). */
  badge: VarianceBadgeView;
  summary: ShiftSummaryRow;
}

export interface ShiftHistoryDay {
  businessDate: string;
  label: string;
  total: number;
  rows: ShiftHistoryRow[];
}

const opened = (s: Snapshot) => {
  const ms = Date.parse(String(s.openedAt));
  return Number.isFinite(ms) ? ms : 0;
};

export function deriveShiftHistory(
  summaries: readonly ShiftSummaryRow[],
  ctx: { timeZone: string; today: string },
): ShiftHistoryDay[] {
  const days = new Map<string, ShiftHistoryRow[]>();
  for (const s of [...summaries].sort((a, b) => opened(b) - opened(a))) {
    const snap = (s.snapshotData ?? {}) as Snapshot;
    // A summary read without a Business Date (an old row) is filed under the day it opened.
    const date = String(s.businessDate ?? stationDay(opened(s), ctx.timeZone));
    const row: ShiftHistoryRow = {
      shiftId: s.shiftId,
      title: shiftLabel(s),
      window: windowLabel(s.openedAt, s.closedAt, ctx.timeZone),
      sales: deriveSalesTotals(snap).total,
      badge: shiftHeadlineBadge(deriveShiftVariance(snap)),
      summary: s,
    };
    days.set(date, [...(days.get(date) ?? []), row]);
  }
  return [...days]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([businessDate, rows]) => ({
      businessDate,
      label:
        businessDate === ctx.today
          ? `Today · ${businessDateLabel(businessDate)}`
          : businessDateLabel(businessDate),
      total: round2(rows.reduce((sum, r) => sum + r.sales, 0)),
      rows,
    }));
}

/**
 * While older pages are still to load, the oldest day loaded so far may be cut
 * off part-way (its other Shifts are on the next page), so its total would be
 * wrong. It is held back until its Shifts are all in. A lone loaded day stays
 * (hiding it would leave nothing to show).
 */
export function settledDays(days: readonly ShiftHistoryDay[], hasMore: boolean): ShiftHistoryDay[] {
  return hasMore && days.length > 1 ? days.slice(0, -1) : [...days];
}
