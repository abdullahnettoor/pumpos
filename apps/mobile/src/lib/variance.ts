/**
 * How the mobile app names a cash variance (counted − expected): one tone ladder
 * and one wording, used by Shift rows, Drawer rows, the Handover recap and
 * Insights, so the same amount never reads two ways on two screens.
 */
import { formatVariance } from '@pump/ui';
import { badgeTone, type BadgeTone, type Tone } from '../ui/tones.js';

/** A cash variance within this many rupees of zero is "on the nose" (rounds to ₹0). */
export const VARIANCE_TOLERANCE = 0.5;

/**
 * Tone of a cash variance: a shortage is bad, a surplus is a warning (cash that
 * should be explained), within tolerance is good. Whole-rupee tolerance suits
 * averages (Insights); a single variance uses {@link varianceBadge}'s exact rule.
 */
export function varianceTone(amount: number, tolerance = VARIANCE_TOLERANCE): Tone {
  if (amount < -tolerance) return 'bad';
  if (amount > tolerance) return 'warn';
  return 'good';
}

export interface VarianceBadgeView {
  tone: Extract<BadgeTone, 'good' | 'warn' | 'bad'>;
  /** Balanced / +₹120 / −₹340. */
  text: string;
  /** Within the server's balance rule (`isBalancedVariance`): branch on this, not on `text`. */
  balanced: boolean;
}

/**
 * The badge for one variance, from the shared vocabulary (`formatVariance`):
 * balanced by the same rule as the office's Drawer reconciliation
 * (`isBalancedVariance`), so attendant and office never disagree; short is a
 * problem, over is worth a look.
 */
export function varianceBadge(v: number): VarianceBadgeView {
  // The shared vocabulary (#518), in whole rupees except under ₹1 where
  // rounding would read "₹0" for a real variance.
  const f = formatVariance(v, 'cash', { decimals: 0 });
  return {
    tone: badgeTone(f.tone) as VarianceBadgeView['tone'],
    text: f.text,
    balanced: f.state === 'balanced',
  };
}

export interface DrawerOff {
  name: string;
  variance: number;
}

/** Largest variance first (either direction): the one Drawer order, for labels and lists. */
export const byLargestVariance = (a: Pick<DrawerOff, 'variance'>, b: Pick<DrawerOff, 'variance'>) =>
  Math.abs(b.variance) - Math.abs(a.variance);

/** Who is off, largest first, and which way: "DU3 short", "DU3 short +1 more". */
export function offLabel(drawers: readonly DrawerOff[]): string {
  const sorted = [...drawers].sort(byLargestVariance);
  const first = sorted[0];
  const label = `${first.name} ${first.variance < 0 ? 'short' : 'over'}`;
  return sorted.length > 1 ? `${label} +${sorted.length - 1} more` : label;
}
