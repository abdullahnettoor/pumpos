/**
 * The PumpOS status vocabulary (#518): what a state is called and which tone
 * it reads in, the one source for web, desktop and mobile. Views (pump-ds
 * `StatusChip` / `VarianceChip`, mobile `StatusBadge`) render this; they never
 * pick their own words or colours for these states.
 *
 * Tones carry meaning, not decoration: `success` the operator can move on,
 * `warning` worth a look, `danger` needs action, `neutral` information only.
 */
import { isBalancedVariance } from './shift-close-cash.js';
import type { DuStatus } from './handover-status.js';
import { TANK_TONE_LABEL, type TankLevel } from './tank-level.js';

export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

/** A variance read as a state: zero by `isBalancedVariance`, else its sign. */
export type VarianceStatusState = 'balanced' | 'surplus' | 'short';
export type HandoverStatusState = 'handover-pending' | 'handover-due' | 'handover-recorded';
export type ShiftStatusState = 'shift-live' | 'shift-past-end' | 'shift-closed';
/** A Business Day and its DSSR. */
export type DayStatusState = 'day-open' | 'day-draft' | 'day-sealed' | 'day-final';
/** A party (customer, supplier, member) or a setup record. */
export type PartyStatusState = 'active' | 'inactive';
/** A team member kept on record without a login (#538). */
export type MemberStatusState = 'no-login';
/**
 * A Station's onboarding (#538). Setup in progress is work in hand, not a
 * problem, so it reads neutral; only Ready for operations is green.
 */
export type StationStatusState = 'station-ready' | 'station-setup' | 'station-not-started';
/** A money record's state; `adjustment` marks an entry posted to correct another. */
export type MoneyStatusState = 'overdue' | 'over-limit' | 'voided' | 'adjustment';
/** A Fuel Purchase whose fuel has not yet been linked to a Decantation (ADR 0007). */
export type PurchaseStatusState = 'awaiting-decantation';
/**
 * A tank's stock state beside its gauge (#536). Critical and Low are the tank
 * level's words (`TANK_TONE_LABEL`); over capacity and a pending Decantation
 * are states of the book stock.
 */
export type TankStatusState =
  'tank-critical' | 'tank-low' | 'tank-over-capacity' | 'tank-waiting-decantation';
/** A product's on-hand stock (merchandise): none left, or sold below zero. */
export type StockStatusState = 'out-of-stock' | 'oversold';
/** A Decantation (tanker visit) and a tank line without its Fuel Purchase (ADR 0007). */
export type DecantationStatusState =
  | 'decantation-draft'
  | 'pending-measurement'
  | 'measured'
  | 'discarded'
  | 'purchase-not-linked'
  /** A tanker's received quantity against its invoice (`decantationVarianceState`). */
  | 'tanker-matches'
  | 'within-tolerance';

/**
 * A write the operator made, before the server confirms it (#606). `saving`
 * is in flight: the row shows it in place of any figure, never a predicted
 * value. The planned durable outbox (Level 2 resilience) adds its "Waiting to
 * sync" here as a sibling state, so a queued write reads the same way.
 */
export type WriteStatusState = 'saving';

export type PumpState =
  | VarianceStatusState
  | WriteStatusState
  | HandoverStatusState
  | ShiftStatusState
  | DayStatusState
  | PartyStatusState
  | MemberStatusState
  | StationStatusState
  | MoneyStatusState
  | PurchaseStatusState
  | TankStatusState
  | StockStatusState
  | DecantationStatusState;

export interface StatusPresentation {
  label: string;
  tone: StatusTone;
  /** Render the label struck through (a voided record). */
  struck?: boolean;
}

/**
 * A variance's tone by state. Narrower than `StatusTone` so a renderer that maps
 * variance tones (mobile figures) is exhaustive: a new state or tone here fails
 * its map at compile time.
 */
const VARIANCE_TONE = {
  balanced: 'success',
  surplus: 'warning',
  short: 'danger',
} as const satisfies Record<VarianceStatusState, StatusTone>;

/** The tones a variance can read in. */
export type VarianceTone = (typeof VARIANCE_TONE)[VarianceStatusState];

const VOCABULARY: Record<PumpState, StatusPresentation> = {
  balanced: { label: 'Balanced', tone: VARIANCE_TONE.balanced },
  surplus: { label: 'Surplus', tone: VARIANCE_TONE.surplus },
  short: { label: 'Short', tone: VARIANCE_TONE.short },

  // Neutral: a save in flight is not a problem. The pulse says it is moving.
  saving: { label: 'Saving…', tone: 'neutral' },

  'handover-pending': { label: 'Pending', tone: 'neutral' },
  'handover-due': { label: 'Handover due', tone: 'warning' },
  'handover-recorded': { label: 'Recorded', tone: 'success' },

  'shift-live': { label: 'Live', tone: 'success' },
  'shift-past-end': { label: 'Past scheduled end', tone: 'warning' },
  'shift-closed': { label: 'Closed', tone: 'neutral' },

  'day-open': { label: 'Open', tone: 'success' },
  'day-draft': { label: 'Draft', tone: 'warning' },
  'day-sealed': { label: 'Sealed', tone: 'neutral' },
  'day-final': { label: 'Final', tone: 'neutral' },

  active: { label: 'Active', tone: 'success' },
  inactive: { label: 'Inactive', tone: 'neutral' },
  'no-login': { label: 'No login', tone: 'neutral' },

  'station-ready': { label: 'Ready for operations', tone: 'success' },
  'station-setup': { label: 'Setup in progress', tone: 'neutral' },
  'station-not-started': { label: 'Setup not started', tone: 'neutral' },

  overdue: { label: 'Overdue', tone: 'warning' },
  'over-limit': { label: 'Over limit', tone: 'danger' },
  voided: { label: 'Voided', tone: 'neutral', struck: true },
  adjustment: { label: 'Adjustment', tone: 'info' },
  'awaiting-decantation': { label: 'Awaiting decantation', tone: 'neutral' },

  'tank-critical': { label: TANK_TONE_LABEL.critical!, tone: 'danger' },
  'tank-low': { label: TANK_TONE_LABEL.low!, tone: 'warning' },
  'tank-over-capacity': { label: 'Over capacity', tone: 'info' },
  'tank-waiting-decantation': { label: 'Waiting on decantation', tone: 'warning' },

  'out-of-stock': { label: 'Out of stock', tone: 'warning' },
  oversold: { label: 'Oversold', tone: 'danger' },

  // Neutral: an ordinary draft is work in hand, not a problem. "Draft" alone is
  // the amber Business-Day word, so this one names itself.
  'decantation-draft': { label: 'Saved as draft', tone: 'neutral' },
  'tanker-matches': { label: 'Matches', tone: 'success' },
  'within-tolerance': { label: 'Within tolerance', tone: 'neutral' },
  'pending-measurement': { label: 'Pending measurement', tone: 'neutral' },
  measured: { label: 'Measured', tone: 'success' },
  discarded: { label: 'Discarded', tone: 'neutral' },
  'purchase-not-linked': { label: 'Purchase not linked', tone: 'warning' },
};

/** The canonical word and tone for a state. */
export const statusPresentation = (state: PumpState): StatusPresentation => VOCABULARY[state];

/** A DU's handover status as a vocabulary state. */
export const handoverState = (status: DuStatus): HandoverStatusState => `handover-${status}`;

/** A party's active flag as a vocabulary state (never "Suspended"). */
export const partyState = (isActive: boolean): PartyStatusState =>
  isActive ? 'active' : 'inactive';

/** A Station's `onboardingStatus` as a vocabulary state; anything unknown has not started. */
export const stationState = (onboardingStatus: string | null | undefined): StationStatusState =>
  onboardingStatus === 'READY_FOR_OPERATIONS'
    ? 'station-ready'
    : onboardingStatus === 'IN_PROGRESS'
      ? 'station-setup'
      : 'station-not-started';

/**
 * A tank's states beside its gauge, most urgent first: its level (Critical /
 * Low, same thresholds as every gauge), book stock over capacity, and a
 * pending Decantation. An ordinary level has no state.
 */
export const tankStates = (
  level: Pick<TankLevel, 'tone' | 'overCapacity' | 'waitingOnDecantation'>,
): TankStatusState[] => {
  const out: TankStatusState[] = [];
  if (level.tone === 'critical') out.push('tank-critical');
  else if (level.tone === 'low') out.push('tank-low');
  if (level.overCapacity) out.push('tank-over-capacity');
  if (level.waitingOnDecantation) out.push('tank-waiting-decantation');
  return out;
};

/**
 * A Decantation's received − invoiced quantity for one product, read against
 * the station's quantity tolerance (a percent of the invoice,
 * `resolveDecantationSettings().quantityTolerance`). Zero matches; a
 * difference within tolerance is neutral (transit loss, temperature); beyond
 * it a shortage is Short (red) and an excess Surplus (amber), the variance words.
 */
export type DecantationVarianceState = 'tanker-matches' | 'within-tolerance' | 'short' | 'surplus';

export function decantationVarianceState(
  varianceQty: number,
  invoiceQty: number | null | undefined,
  tolerancePct: number,
): DecantationVarianceState {
  if (varianceQty === 0) return 'tanker-matches';
  const limit = (Math.abs(Number(invoiceQty) || 0) * tolerancePct) / 100;
  if (Math.abs(varianceQty) <= limit) return 'within-tolerance';
  return varianceQty < 0 ? 'short' : 'surplus';
}

/** Cash variances are rupees; stock variances are litres. Same words, same tones. */
export type VarianceKind = 'cash' | 'stock';

export interface VariancePresentation extends StatusPresentation {
  state: VarianceStatusState;
  tone: VarianceTone;
  /** Which side of zero, agreeing with the balanced rule: `zero` iff balanced. */
  sign: 'negative' | 'zero' | 'positive';
}

/**
 * How a variance (counted − expected) reads. Balanced by `isBalancedVariance`
 * (the only balanced rule; no `=== 0`, no percentage band); a surplus is amber,
 * a shortage red. `kind` is the unit the caller formats the figure in (see
 * `formatVariance` in `@pump/ui`); it does not change the rule.
 */
export function variancePresentation(
  amount: number | string | null | undefined,
  _kind: VarianceKind,
): VariancePresentation {
  const n = Number(amount ?? 0);
  const v = Number.isFinite(n) ? n : 0;
  const state: VarianceStatusState = isBalancedVariance(v)
    ? 'balanced'
    : v > 0
      ? 'surplus'
      : 'short';
  const sign = state === 'balanced' ? 'zero' : state === 'surplus' ? 'positive' : 'negative';
  return { state, sign, label: VOCABULARY[state].label, tone: VARIANCE_TONE[state] };
}
