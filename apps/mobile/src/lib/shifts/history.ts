/**
 * Closed-Shift history for the Shifts tab: summaries grouped by the Shift's
 * Business Date (not the calendar day it opened), newest first.
 */
import { businessDateLabel, stationDay } from '../home/dates.js';
import { num, round2 } from '../home/num.js';
import { shiftLabel, type Snapshot } from '../home/sales.js';
import { deriveShiftVariance, varianceBadge, type VarianceBadgeView } from './variance.js';
import { windowLabel } from './window.js';

/** One row of `GET /shifts/shift-summaries`. */
export type ShiftSummaryRow = Snapshot & { shiftId: string };

export interface ShiftHistoryRow {
  shiftId: string;
  title: string;
  window: string;
  /** Fuel sales from the snapshot: Product Sales are not part of a Shift Summary snapshot. */
  fuelSales: number;
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
      fuelSales: num(snap.totalFuelSalesValue),
      badge: varianceBadge(deriveShiftVariance(snap).headline),
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
      total: round2(rows.reduce((sum, r) => sum + r.fuelSales, 0)),
      rows,
    }));
}
