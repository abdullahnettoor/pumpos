import { describe, expect, it } from 'vite-plus/test';
import {
  handoverState,
  partyState,
  stationState,
  tankStates,
  decantationVarianceState,
  statusPresentation,
  variancePresentation,
  type PumpState,
} from './status-vocabulary.js';

describe('statusPresentation: one word and one tone per state', () => {
  const cases: [PumpState, string, string][] = [
    // Variance words
    ['balanced', 'Balanced', 'success'],
    ['surplus', 'Surplus', 'warning'],
    ['short', 'Short', 'danger'],
    // Handover
    ['handover-pending', 'Pending', 'neutral'],
    ['handover-due', 'Handover due', 'warning'],
    ['handover-recorded', 'Recorded', 'success'],
    // Shift
    ['shift-live', 'Live', 'success'],
    ['shift-past-end', 'Past scheduled end', 'warning'],
    ['shift-closed', 'Closed', 'neutral'],
    // Business Day / DSSR
    ['day-open', 'Open', 'success'],
    ['day-draft', 'Draft', 'warning'],
    ['day-sealed', 'Sealed', 'neutral'],
    ['day-final', 'Final', 'neutral'],
    // Party / setup
    ['active', 'Active', 'success'],
    ['inactive', 'Inactive', 'neutral'],
    ['no-login', 'No login', 'neutral'],
    // Station onboarding (#538): setup in progress is not a problem
    ['station-ready', 'Ready for operations', 'success'],
    ['station-setup', 'Setup in progress', 'neutral'],
    ['station-not-started', 'Setup not started', 'neutral'],
    // Money
    ['overdue', 'Overdue', 'warning'],
    ['over-limit', 'Over limit', 'danger'],
    ['voided', 'Voided', 'neutral'],
    ['adjustment', 'Adjustment', 'info'],
    ['awaiting-decantation', 'Awaiting decantation', 'neutral'],
    // Tank (#536): the tank level's words
    ['tank-critical', 'Critical', 'danger'],
    ['tank-low', 'Low', 'warning'],
    ['tank-over-capacity', 'Over capacity', 'info'],
    ['tank-waiting-decantation', 'Waiting on decantation', 'warning'],
    // Product stock
    ['out-of-stock', 'Out of stock', 'warning'],
    ['oversold', 'Oversold', 'danger'],
    // Decantation
    ['decantation-draft', 'Saved as draft', 'neutral'],
    ['tanker-matches', 'Matches', 'success'],
    ['within-tolerance', 'Within tolerance', 'neutral'],
    ['pending-measurement', 'Pending measurement', 'neutral'],
    ['measured', 'Measured', 'success'],
    ['discarded', 'Discarded', 'neutral'],
    ['purchase-not-linked', 'Purchase not linked', 'warning'],
    // A write in flight (#606): not a problem, so neutral
    ['saving', 'Saving…', 'neutral'],
    // A fuel price waiting for its effective time (#619): information only
    ['price-scheduled', 'Scheduled', 'info'],
    // A fuel without a price in effect blocks a shift open (#630): action needed
    ['price-no-rate', 'No rate in effect', 'danger'],
  ];

  it.each(cases)('%s reads "%s" in %s', (state, label, tone) => {
    expect(statusPresentation(state)).toMatchObject({ label, tone });
  });

  it('strikes through only a voided record', () => {
    expect(statusPresentation('voided').struck).toBe(true);
    expect(statusPresentation('overdue').struck).toBeFalsy();
  });

  it('never calls a party "Suspended"', () => {
    for (const [state] of cases) expect(statusPresentation(state).label).not.toMatch(/suspend/i);
  });
});

describe('state mappers', () => {
  it('names a handover from its DU status', () => {
    expect(handoverState('pending')).toBe('handover-pending');
    expect(handoverState('due')).toBe('handover-due');
    expect(handoverState('recorded')).toBe('handover-recorded');
  });

  it('names a tank: its level, then over capacity, then a pending Decantation', () => {
    const base = { overCapacity: false, waitingOnDecantation: false };
    expect(tankStates({ ...base, tone: 'ok' })).toEqual([]);
    expect(tankStates({ ...base, tone: 'unknown' })).toEqual([]);
    expect(tankStates({ ...base, tone: 'low' })).toEqual(['tank-low']);
    expect(
      tankStates({ tone: 'critical', overCapacity: false, waitingOnDecantation: true }),
    ).toEqual(['tank-critical', 'tank-waiting-decantation']);
    expect(tankStates({ ...base, tone: 'ok', overCapacity: true })).toEqual(['tank-over-capacity']);
  });

  it('reads a decantation variance against the station tolerance (% of invoice)', () => {
    expect(decantationVarianceState(0, 12000, 0.5)).toBe('tanker-matches');
    expect(decantationVarianceState(-60, 12000, 0.5)).toBe('within-tolerance'); // limit 60 L
    expect(decantationVarianceState(60, 12000, 0.5)).toBe('within-tolerance');
    expect(decantationVarianceState(-61, 12000, 0.5)).toBe('short');
    expect(decantationVarianceState(61, 12000, 0.5)).toBe('surplus');
    expect(decantationVarianceState(-1, null, 0.5)).toBe('short'); // no invoice: no allowance
    // Balanced by isBalancedQuantity, not exact zero (#556).
    expect(decantationVarianceState(0.0004, null, 0.5)).toBe('tanker-matches');
    expect(decantationVarianceState(-0.001, null, 0.5)).toBe('short');
  });

  it('names a party from its active flag', () => {
    expect(partyState(true)).toBe('active');
    expect(partyState(false)).toBe('inactive');
  });
});

describe('variancePresentation: the one balanced rule', () => {
  it('reads zero as Balanced (success), unsigned', () => {
    expect(variancePresentation(0, 'cash')).toEqual({
      state: 'balanced',
      label: 'Balanced',
      tone: 'success',
      sign: 'zero',
    });
  });

  it('reads a surplus as amber (warning), positive', () => {
    expect(variancePresentation(120, 'cash')).toEqual({
      state: 'surplus',
      label: 'Surplus',
      tone: 'warning',
      sign: 'positive',
    });
  });

  it('reads a shortage as danger, negative', () => {
    expect(variancePresentation(-340, 'cash')).toEqual({
      state: 'short',
      label: 'Short',
      tone: 'danger',
      sign: 'negative',
    });
  });

  it('treats cash under half a paisa as balanced, either way', () => {
    expect(variancePresentation(0.004, 'cash').state).toBe('balanced');
    expect(variancePresentation(-0.004, 'cash').state).toBe('balanced');
  });

  it('treats stock under half a millilitre as balanced, and the recorded step as off (#556)', () => {
    expect(variancePresentation(0.0004, 'stock').state).toBe('balanced');
    expect(variancePresentation(-0.0004, 'stock').state).toBe('balanced');
    expect(variancePresentation(0.1 + 0.2 - 0.3, 'stock').state).toBe('balanced');
    // 4 ml is a recorded variance (3 decimals), not cash rounding noise.
    expect(variancePresentation(0.004, 'stock').state).toBe('surplus');
    expect(variancePresentation(-0.001, 'stock').state).toBe('short');
  });

  it('is off from half a paisa: no tolerance band around zero', () => {
    expect(variancePresentation(0.005, 'cash').state).toBe('surplus');
    expect(variancePresentation(-0.01, 'cash').state).toBe('short');
    // InventoryList used to call 0.5% of expected stock "balanced"; it is not.
    expect(variancePresentation(-4, 'stock').state).toBe('short');
  });

  it('reads stock variance with the same words and tones as cash', () => {
    expect(variancePresentation(12.5, 'stock')).toMatchObject({
      label: 'Surplus',
      tone: 'warning',
    });
    expect(variancePresentation(-3, 'stock')).toMatchObject({ label: 'Short', tone: 'danger' });
  });

  it('accepts a numeric string and treats a missing or invalid amount as balanced', () => {
    expect(variancePresentation('-12.40', 'cash').state).toBe('short');
    expect(variancePresentation(null, 'cash').state).toBe('balanced');
    expect(variancePresentation('abc', 'cash').state).toBe('balanced');
  });
});

describe('stationState (#538)', () => {
  it('reads the onboarding status, unknown as not started', () => {
    expect(stationState('READY_FOR_OPERATIONS')).toBe('station-ready');
    expect(stationState('IN_PROGRESS')).toBe('station-setup');
    expect(stationState('NOT_STARTED')).toBe('station-not-started');
    expect(stationState(undefined)).toBe('station-not-started');
  });
});
