/**
 * Cash variance of a closed Shift, read from its immutable Shift Summary
 * snapshot (never recomputed). Two levels (ADR 0005, #287):
 *  - ATTENDANT variance: each Drawer's declared cash against its expected cash,
 *    named by Dispenser Unit;
 *  - OFFICE count variance: the cash counted at close against what the Drawers
 *    declared.
 * Snapshots closed before #287 carry one `cashVariance` that already includes
 * the attendant shortage; they have no second level.
 */
import { isBalancedVariance, isTwoLevelVarianceSnapshot } from '@pump/shared';
import { formatMoney } from '@pump/ui';
import { signedRupees } from '../home/format.js';
import { num, round2 } from '../home/num.js';
import type { Snapshot } from '../home/sales.js';
import type { BadgeTone } from '../../ui/StatusBadge.js';

export interface DrawerOff {
  name: string;
  variance: number;
}

export interface ShiftVariance {
  twoLevel: boolean;
  /** Σ Drawer variance; null for a snapshot closed under the single-level model. */
  attendant: number | null;
  /** Counted cash against declared cash (single-level: the one cash variance). */
  office: number;
  /** The figure a row or headline shows: attendant when off, else office. */
  headline: number;
  /** Who it belongs to: "DU3 short", "DU1 over +1 more", "Office count". */
  headlineNote: string;
  /** Drawers that are off, largest first. */
  drawersOff: DrawerOff[];
}

const off = (v: number) => !isBalancedVariance(v);

/** "DU3 short", or "DU3 short +1 more": largest first. */
export function offLabel(drawers: readonly DrawerOff[]): string {
  const sorted = [...drawers].sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));
  const first = sorted[0];
  const label = `${first.name} ${first.variance < 0 ? 'short' : 'over'}`;
  return sorted.length > 1 ? `${label} +${sorted.length - 1} more` : label;
}

export function drawerName(d: Snapshot): string {
  return String(d.duName ?? d.attendantName ?? 'Drawer');
}

export function deriveShiftVariance(snap: Snapshot): ShiftVariance {
  const twoLevel = isTwoLevelVarianceSnapshot(snap);
  const attendant = twoLevel ? round2(num(snap.attendantVariance)) : null;
  const office = round2(
    twoLevel ? num(snap.officeCountVariance ?? snap.cashVariance) : num(snap.cashVariance),
  );
  const drawersOff = ((Array.isArray(snap.drawers) ? snap.drawers : []) as Snapshot[])
    .filter((d) => d.variance != null && off(num(d.variance)))
    .map((d) => ({ name: drawerName(d), variance: num(d.variance) }))
    .sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));

  const attendantOff = attendant !== null && off(attendant);
  const headline = attendantOff ? (attendant as number) : office;
  let headlineNote = 'Balanced';
  if (off(headline)) {
    headlineNote =
      attendantOff || !twoLevel
        ? drawersOff.length > 0
          ? offLabel(drawersOff)
          : headline < 0
            ? 'Short'
            : 'Over'
        : 'Office count';
  }
  return { twoLevel, attendant, office, headline, headlineNote, drawersOff };
}

export interface VarianceBadgeView {
  tone: BadgeTone;
  text: string;
}

/** Balanced / +₹120 / −₹340, as the Shift row and Drawer badges show it. */
export function varianceBadge(v: number): VarianceBadgeView {
  if (!off(v)) return { tone: 'good', text: 'Balanced' };
  // Whole rupees, except under ₹1 where rounding would read "₹0" for a real variance.
  const amount =
    Math.abs(v) < 1 ? `${v < 0 ? '−' : ''}${formatMoney(Math.abs(v))}` : signedRupees(v);
  return { tone: v < 0 ? 'bad' : 'warn', text: `${v > 0 ? '+' : ''}${amount}` };
}
