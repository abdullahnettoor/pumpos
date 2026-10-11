/**
 * The one cash-variance figure every screen shows (Home tile, DSSR tile, Shift
 * Summary header): BOTH levels of ADR 0005 side by side with equal weight, never
 * added together:
 *  - ATTENDANTS: each Drawer's declared cash against its expected cash, named by
 *    Dispenser Unit;
 *  - OFFICE count: the cash counted at close against what the Drawers declared.
 * Each level's figure is toned by the shared rule (`varianceBadge`, i.e.
 * `isBalancedVariance`); the card's own tone turns bad only above
 * {@link VARIANCE_ALERT}, warn for a smaller variance. Snapshots closed under the
 * single-level model have one level, named "Counted cash" everywhere
 * (`VARIANCE_LEVEL_LABEL`), under the card's "Cash variance" title.
 */
import { isBalancedVariance } from '@pump/shared';
import { num, round2 } from './num.js';
import { plural, rupees } from './format.js';
import { offLabel, varianceBadge, type DrawerOff, type VarianceBadgeView } from './variance.js';
import type { Snapshot } from './home/sales.js';
import { shiftLabel } from './home/sales.js';
import {
  VARIANCE_LEVEL_LABEL,
  type ShiftVariance,
  type VarianceLevelKey,
} from './shifts/variance.js';

type VarianceTone = 'good' | 'warn' | 'bad';

export interface VarianceLevel {
  key: VarianceLevelKey;
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
  /** Bad above {@link VARIANCE_ALERT}, else warn if any level is off, else good (also with no levels). */
  tone: VarianceTone;
  /** Shown instead of figures when there are none ("No closed Shift yet"). */
  empty?: string;
}

/** Beyond this many rupees a cash variance reads as a problem (the card turns red). */
export const VARIANCE_ALERT = 100;

const cardTone = (levels: readonly VarianceLevel[]): VarianceTone => {
  if (levels.some((l) => Math.abs(l.value) > VARIANCE_ALERT)) return 'bad';
  return levels.some((l) => l.tone !== 'good') ? 'warn' : 'good';
};

const level = (key: VarianceLevelKey, value: number, note: string): VarianceLevel => {
  const badge = varianceBadge(value);
  return {
    key,
    label: VARIANCE_LEVEL_LABEL[key],
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
  return { levels, tone: cardTone(levels) };
}

/** A closed Shift's cash variance, from its Shift Summary snapshot. */
export function shiftCashVariance(v: ShiftVariance): CashVariance {
  if (!v.twoLevel || v.attendant === null)
    return build([level('single', v.office, drawersNote(v.office, v.drawersOff))]);
  return build([
    level('attendants', v.attendant, drawersNote(v.attendant, v.drawersOff)),
    level('office', v.office, offNote(v.office, direction(v.office))),
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
  const officeLevel = level('office', office, officeNote);

  const dus = ((drawer.attendants ?? []) as Snapshot[]).map((a) => ({
    name: String(a.duName ?? a.attendantName ?? 'Drawer'),
    variance: num(a.variance),
  }));
  if (dus.length === 0 && drawer.totalAttendantVariance == null)
    return build([level('single', office, officeNote)]);

  const attendant = round2(num(drawer.totalAttendantVariance));
  const dusOff = dus.filter((d) => !isBalancedVariance(d.variance));
  return build([level('attendants', attendant, drawersNote(attendant, dusOff)), officeLevel]);
}

/**
 * A Shift's one headline variance as a badge, naming its level ("Attendants −₹125",
 * "Office count +₹50") with the same labels as the Cash variance card; "Balanced"
 * when within tolerance. For rows and alerts that have room for one figure.
 */
export function shiftHeadlineBadge(v: ShiftVariance): VarianceBadgeView & { label: string } {
  const label = VARIANCE_LEVEL_LABEL[v.headlineLevel];
  const badge = varianceBadge(v.headline);
  return badge.balanced ? { ...badge, label } : { ...badge, label, text: `${label} ${badge.text}` };
}
