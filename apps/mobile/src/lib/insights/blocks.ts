import type { InsightsAttendantVariance, InsightsStockLoss } from '@pump/shared';
import { STOCK_VARIANCE_TOLERANCE_PCT } from '@pump/shared';
import { plural, signedRupees } from '../format.js';
import type { Tone } from '../../ui/tones.js';
import { varianceBadge } from '../variance.js';
import { signedLitres, trim } from './format.js';

/**
 * Display derivations for the Insights part 2 blocks (#402). Every business
 * figure (net variance, short / over counts, % of sold, rupees at cost, the
 * tolerance flag) arrives computed from the API; what is here only lays them
 * out: bar geometry, wording, tone.
 */

export interface AttendantBarView {
  /** Tone and text from the one shared variance rule (`varianceBadge`): the bar, the figure and the counts agree. */
  tone: Tone;
  text: string;
  /** Balanced by `isBalancedVariance`: no bar, and the figure reads "Balanced". */
  balanced: boolean;
  /** Short (bar grows left, bad) or over (right, warning). Meaningless when balanced. */
  short: boolean;
  /** Length of the bar as 0..1 of the track's half, scaled to the largest off-balance |net| shown. */
  bar: number;
}

/** The diverging-bar row model for each Attendant, in the order given. */
export function attendantBars(
  rows: ReadonlyArray<Pick<InsightsAttendantVariance, 'netVariance'>>,
): AttendantBarView[] {
  const views = rows.map((r) => ({ r, badge: varianceBadge(r.netVariance) }));
  const max = views.reduce(
    (m, v) => (v.badge.balanced ? m : Math.max(m, Math.abs(v.r.netVariance))),
    0,
  );
  return views.map(({ r, badge }) => ({
    tone: badge.tone,
    text: badge.balanced ? signedRupees(0) : badge.text,
    balanced: badge.balanced,
    short: r.netVariance < 0,
    bar: badge.balanced || max <= 0 ? 0 : Math.abs(r.netVariance) / max,
  }));
}

/**
 * "3 of 6 shifts short", "1 of 4 shifts over", "2 short · 1 over of 6 shifts",
 * "Balanced in all 6 shifts". The counts are Shifts, not Drawers or days.
 */
export function attendantNote(
  r: Pick<InsightsAttendantVariance, 'shifts' | 'shortShifts' | 'overShifts'>,
): string {
  const { shifts, shortShifts: short, overShifts: over } = r;
  if (short === 0 && over === 0) {
    return shifts === 1 ? 'Balanced in 1 shift' : `Balanced in all ${shifts} shifts`;
  }
  if (over === 0) return `${short} of ${plural(shifts, 'shift')} short`;
  if (short === 0) return `${over} of ${plural(shifts, 'shift')} over`;
  return `${short} short · ${over} over of ${plural(shifts, 'shift')}`;
}

export interface StockLossLine {
  litres: string;
  note: string;
  /** Outside tolerance: a loss is bad, a gain a warning; within tolerance reads as plain. */
  tone: Tone;
  outside: boolean;
}

/** One tank's row: litres, "0.28% of sold · within tolerance", tone. */
export function stockLossLine(t: InsightsStockLoss): StockLossLine {
  const outside = !t.withinTolerance;
  if (t.dips === 0) {
    return {
      litres: signedLitres(0),
      note: 'no dip recorded in this range',
      tone: 'default',
      outside: false,
    };
  }
  const pct = t.pctOfSold === null ? 'nothing sold' : `${trim(Math.abs(t.pctOfSold), 2)}% of sold`;
  const verdict = outside
    ? `outside ${trim(STOCK_VARIANCE_TOLERANCE_PCT, 2)}% tolerance`
    : 'within tolerance';
  return {
    litres: signedLitres(t.varianceLitres),
    note: `${pct} · ${verdict}`,
    tone: !outside ? 'default' : t.varianceLitres < 0 ? 'bad' : 'warn',
    outside,
  };
}

/** Widths (0..100) of the two credit bars, scaled to the larger of the two so they compare. */
export function creditBars(given: number, collected: number): { given: number; collected: number } {
  const max = Math.max(given, collected, 0);
  if (max <= 0) return { given: 0, collected: 0 };
  return { given: (given / max) * 100, collected: (collected / max) * 100 };
}
