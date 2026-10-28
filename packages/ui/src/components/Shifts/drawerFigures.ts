import { isBalancedVariance } from '@pump/shared';
import { sumRupees, toPaise } from '../../utils/ledgerWindow.js';
import {
  DRAWER_KEY,
  n,
  rupees2,
  type PreHandoverTotals,
  type ShiftInput,
} from './liveShiftInputs.js';

// ── Drawers: variance and drops ─────────────────────────────────────────────

/**
 * Variances beyond this many rupees need a look: flagged in the Live shift's
 * Before close checklist and warned about in the close review. One figure for both.
 */
export const VARIANCE_FLAG_RUPEES = 100;

export interface DrawerFigures {
  /** Drawers on the shift (one per staff assignment). */
  expected: number;
  /** Drawers that handed over. */
  recorded: number;
  /** Σ attendant variance of the recorded Drawers (declared + drops − expected). */
  variance: number;
  short: number;
  surplus: number;
  balanced: number;
  /** Groups whose variance is beyond `VARIANCE_FLAG_RUPEES`, largest first. */
  flagged: { key: string; variance: number }[];
  /** Σ Cash Drops recorded on the Handovers. */
  drops: number;
  /** Drawers with at least one Cash Drop. */
  dropDrawers: number;
}

/**
 * The Drawers' variance and drops. The server reconciliation is the source
 * (as at close); before it lists any Drawer, the Handovers' own figures.
 */
export function drawerFigures(shift: ShiftInput): DrawerFigures {
  const assignments = shift.staffAssignments ?? [];
  const handovers = shift.handovers ?? [];
  const recon = shift.reconciliation?.drawers ?? [];
  const lines: { key: string; variance: number | null; drops: number }[] =
    recon.length > 0
      ? recon.map((d) => ({
          key: DRAWER_KEY(d.attendantId, d.duId ?? ''),
          variance: d.variance == null ? null : n(d.variance),
          drops: n(d.cashDrops),
        }))
      : handovers.map((h) => ({
          key: DRAWER_KEY(h.userId, h.duId),
          variance: n(h.varianceAmount),
          drops: n(h.cashDrops),
        }));
  const recorded = lines.filter((l) => l.variance != null) as {
    key: string;
    variance: number;
    drops: number;
  }[];
  const flagged = recorded
    .filter((l) => Math.abs(l.variance) > VARIANCE_FLAG_RUPEES)
    .map((l) => ({ key: l.key, variance: l.variance }))
    .sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));
  return {
    expected: assignments.length,
    recorded: handovers.filter((h) =>
      assignments.some((a) => a.userId === h.userId && a.duId === h.duId),
    ).length,
    variance: sumRupees(recorded.map((l) => l.variance)),
    short: recorded.filter((l) => !isBalancedVariance(l.variance) && l.variance < 0).length,
    surplus: recorded.filter((l) => !isBalancedVariance(l.variance) && l.variance > 0).length,
    balanced: recorded.filter((l) => isBalancedVariance(l.variance)).length,
    flagged,
    drops: sumRupees(lines.map((l) => l.drops)),
    dropDrawers: lines.filter((l) => toPaise(l.drops) > 0).length,
  };
}

// ── Takings ─────────────────────────────────────────────────────────────────

export interface Takings {
  /** Cash sales the Drawers declared (floats excluded), from the close summary. */
  cash: number;
  card: number;
  upi: number;
  credit: number;
  /** Σ of the four. */
  total: number;
  /** Card + UPI + credit: the money that is not Drawer cash. */
  nonCash: number;
}

/**
 * What the shift has taken, by how it was paid. Card, UPI and credit are the
 * Handovers' declared figures; before any Handover, the shift's own totals (as
 * the old operational summary read them). Cash is the declared cash sales of
 * the close summary (`cashDeclared`).
 */
export function takings(
  shift: ShiftInput,
  cashDeclared: number,
  before: PreHandoverTotals,
): Takings {
  const handovers = shift.handovers ?? [];
  const has = handovers.length > 0;
  const card = has ? sumRupees(handovers.map((h) => h.cardHandedOver)) : rupees2(before.card);
  const upi = has ? sumRupees(handovers.map((h) => h.upiHandedOver)) : rupees2(before.upi);
  const credit = has ? sumRupees(handovers.map((h) => h.creditHandedOver)) : rupees2(before.credit);
  const cash = rupees2(cashDeclared);
  return {
    cash,
    card,
    upi,
    credit,
    nonCash: sumRupees([card, upi, credit]),
    total: sumRupees([cash, card, upi, credit]),
  };
}
