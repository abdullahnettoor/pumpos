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

export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

/** A variance read as a state: zero by `isBalancedVariance`, else its sign. */
export type VarianceStatusState = 'balanced' | 'surplus' | 'short';
export type HandoverStatusState = 'handover-pending' | 'handover-due' | 'handover-recorded';
export type ShiftStatusState = 'shift-live' | 'shift-past-end' | 'shift-closed';
/** A Business Day and its DSSR. */
export type DayStatusState = 'day-open' | 'day-draft' | 'day-sealed' | 'day-final';
/** A party (customer, supplier, member) or a setup record. */
export type PartyStatusState = 'active' | 'inactive';
/** A money record's state; `adjustment` marks an entry posted to correct another. */
export type MoneyStatusState = 'overdue' | 'over-limit' | 'voided' | 'adjustment';

export type PumpState =
  | VarianceStatusState
  | HandoverStatusState
  | ShiftStatusState
  | DayStatusState
  | PartyStatusState
  | MoneyStatusState;

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

  overdue: { label: 'Overdue', tone: 'warning' },
  'over-limit': { label: 'Over limit', tone: 'danger' },
  voided: { label: 'Voided', tone: 'neutral', struck: true },
  adjustment: { label: 'Adjustment', tone: 'info' },
};

/** The canonical word and tone for a state. */
export const statusPresentation = (state: PumpState): StatusPresentation => VOCABULARY[state];

/** A DU's handover status as a vocabulary state. */
export const handoverState = (status: DuStatus): HandoverStatusState => `handover-${status}`;

/** A party's active flag as a vocabulary state (never "Suspended"). */
export const partyState = (isActive: boolean): PartyStatusState =>
  isActive ? 'active' : 'inactive';

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
