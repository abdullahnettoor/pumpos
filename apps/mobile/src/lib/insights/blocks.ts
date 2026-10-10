import type { InsightsAttendantVariance, InsightsStockLoss } from '@pump/shared';
import { STOCK_LOSS_TOLERANCE_PCT } from '@pump/shared';
import { plural } from '../format.js';
import type { Tone } from '../../ui/StatTile.js';
import { varianceTone } from '../variance.js';

/**
 * Display derivations for the Insights part 2 blocks (#402). Every business
 * figure (net variance, short / over counts, % of sold, rupees at cost, the
 * tolerance flag) arrives computed from the API; what is here only lays them
 * out: bar geometry, wording, tone.
 */

/** Half-width of each diverging bar, 0..1 of the track's half, scaled to the largest |net| shown. */
export function divergeBars(rows: ReadonlyArray<Pick<InsightsAttendantVariance, 'netVariance'>>) {
  const max = rows.reduce((m, r) => Math.max(m, Math.abs(r.netVariance)), 0);
  return rows.map((r) => (max > 0 ? Math.abs(r.netVariance) / max : 0));
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

/** Tone of an Attendant's net: short is bad, over is worth a look, balanced is good. */
export const attendantTone = (netVariance: number): Tone => varianceTone(netVariance);

const trim = (n: number, dec: number) => String(Number(n.toFixed(dec)));

/** `−42 L`, `+6.5 L`, `0 L` (true minus sign, grouping like the rest of the app). */
export function signedLitres(n: number): string {
  const a = Math.abs(n);
  const body = `${a.toLocaleString('en-IN', { maximumFractionDigits: 1 })} L`;
  if (Number(trim(a, 1)) === 0) return '0 L';
  return n < 0 ? `−${body}` : `+${body}`;
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
  const pct = t.pctOfSold === null ? 'nothing sold' : `${trim(Math.abs(t.pctOfSold), 2)}% of sold`;
  const verdict = outside
    ? `outside ${trim(STOCK_LOSS_TOLERANCE_PCT, 2)}% tolerance`
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
