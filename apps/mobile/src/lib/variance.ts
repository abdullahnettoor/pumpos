import type { Tone } from '../ui/StatTile.js';

/** A cash variance within this many rupees of zero is "on the nose". */
export const VARIANCE_TOLERANCE = 0.5;

/**
 * Tone of a cash variance (counted − expected): a shortage is bad, a surplus is
 * a warning (cash that should be explained), within tolerance is good.
 */
export function varianceTone(amount: number, tolerance = VARIANCE_TOLERANCE): Tone {
  if (amount < -tolerance) return 'bad';
  if (amount > tolerance) return 'warn';
  return 'good';
}
