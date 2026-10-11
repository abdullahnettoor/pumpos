/**
 * The one cash-variance figure every screen shows (Home tile, DSSR tile, Shift
 * Summary header): BOTH levels of ADR 0005 side by side with equal weight, never
 * added together:
 *  - ATTENDANTS: each Drawer's declared cash against its expected cash, named by
 *    Dispenser Unit;
 *  - OFFICE count: the cash counted at close against what the Drawers declared.
 * Each level is toned by the shared rule (`varianceBadge`, i.e.
 * `isBalancedVariance`); the card's tone is the worse of the two. Snapshots closed
 * under the single-level model have one level, labelled "Cash variance".
 */
import { isBalancedVariance } from '@pump/shared';
import { num, round2 } from './num.js';
import { plural, rupees } from './format.js';
import { offLabel, varianceBadge, type DrawerOff } from './variance.js';
import type { Snapshot } from './home/sales.js';
import { shiftLabel } from './home/sales.js';
import type { ShiftVariance } from './shifts/variance.js';

type VarianceTone = 'good' | 'warn' | 'bad';

export interface VarianceLevel {
  key: 'attendants' | 'office' | 'single';
  label: string;
  value: number;
  /** The figure as printed: "−₹125", "+₹50", "₹0" (exact under ₹1, where rounding would hide it). */
  text: string;
  /** Who it belongs to: "DU-1 short", "Morning over", or "Balanced". */
  note: string;
  tone: VarianceTone;
}

export interface CashVariance {
  /** One level for a single-level snapshot, two otherwise; empty before any Shift has closed. */
  levels: VarianceLevel[];
  /** The worst level's tone (bad, then warn, then good); 'good' with no levels. */
  tone: VarianceTone;
  /** Shown instead of figures when there are none ("No closed Shift yet"). */
  empty?: string;
}

const RANK: Record<VarianceTone, number> = { good: 0, warn: 1, bad: 2 };

const worst = (levels: readonly VarianceLevel[]): VarianceTone =>
  levels.reduce<VarianceTone>((w, l) => (RANK[l.tone] > RANK[w] ? l.tone : w), 'good');

const level = (
  key: VarianceLevel['key'],
  label: string,
  value: number,
  note: string,
): VarianceLevel => {
  const badge = varianceBadge(value);
  return {
    key,
    label,
    value,
    text: badge.balanced ? rupees(0) : badge.text,
    note,
    tone: badge.tone,
  };
};

const direction = (v: number) => (v < 0 ? 'Short' : 'Over');
const offNote = (v: number, who: string) => (isBalancedVariance(v) ? 'Balanced' : who);
const drawersNote = (v: number, off: readonly DrawerOff[]) =>
  offNote(v, off.length > 0 ? offLabel(off) : direction(v));

function build(levels: VarianceLevel[]): CashVariance {
  return { levels, tone: worst(levels) };
}

/** A closed Shift's cash variance, from its Shift Summary snapshot. */
export function shiftCashVariance(v: ShiftVariance): CashVariance {
  if (!v.twoLevel || v.attendant === null)
    return build([level('single', 'Counted cash', v.office, drawersNote(v.office, v.drawersOff))]);
  return build([
    level('attendants', 'Attendants', v.attendant, drawersNote(v.attendant, v.drawersOff)),
    level('office', 'Office count', v.office, offNote(v.office, direction(v.office))),
  ]);
}

/**
 * A Business Day's cash variance, from its DSSR payload: the office count of the
 * closed Shifts (named by the Shift it came from) beside the attendant level
 * (named by Dispenser Unit). A day with no attendant level (every Shift closed
 * under the single-level model) shows the office figure alone.
 */
export function dayCashVariance(snap: Snapshot): CashVariance {
  const shifts = (snap.shifts ?? []) as Snapshot[];
  if (shifts.length === 0) return { levels: [], tone: 'good', empty: 'No closed Shift yet' };

  const drawer = snap.drawer ?? {};
  const office = round2(num(drawer.totalCashVariance));
  const shiftsOff = shifts
    .map((s) => ({ name: shiftLabel(s), variance: num(s.cashVariance) }))
    .filter((s) => !isBalancedVariance(s.variance));
  const officeNote = isBalancedVariance(office)
    ? plural(shifts.length, 'closed Shift')
    : shiftsOff.length > 0
      ? offLabel(shiftsOff)
      : direction(office);
  const officeLevel = level('office', 'Office count', office, officeNote);

  const dus = ((drawer.attendants ?? []) as Snapshot[]).map((a) => ({
    name: String(a.duName ?? a.attendantName ?? 'Drawer'),
    variance: num(a.variance),
  }));
  if (dus.length === 0 && drawer.totalAttendantVariance == null)
    return build([level('single', 'Counted cash', office, officeNote)]);

  const attendant = round2(num(drawer.totalAttendantVariance));
  const dusOff = dus.filter((d) => !isBalancedVariance(d.variance));
  return build([
    level('attendants', 'Attendants', attendant, drawersNote(attendant, dusOff)),
    officeLevel,
  ]);
}
