import { tankTone, type TankLevelSettings } from '@pump/shared';

/**
 * Stock-health classification for the alerts bell and Inventory. The
 * thresholds are the station's tank levels (`resolveTankLevelSettings`,
 * default 25/40, #520), the same ones the Dashboard and mobile gauges use, so
 * a tank never reads "low" on one screen and "ok" on another. Percentages are
 * of tank capacity.
 */
export type StockHealth = 'critical' | 'low' | 'ok' | 'over';

export const OVER_CAPACITY_EXPLANATION =
  'Open-shift dispensed fuel may not be deducted from book stock yet. It reconciles when the shift closes.';

/** Percentage full for a tank; values above 100 preserve an over-capacity book position. */
export function tankPct(volume: number, capacity: number): number {
  const cap = Number(capacity) || 0;
  if (!cap) return 0;
  return Math.max(0, ((Number(volume) || 0) / cap) * 100);
}

/** Classify a fill percentage against the station's tank levels. */
export function classifyTank(pct: number, settings: TankLevelSettings): StockHealth {
  if (pct > 100) return 'over';
  const tone = tankTone(pct, settings);
  return tone === 'unknown' ? 'ok' : tone;
}
