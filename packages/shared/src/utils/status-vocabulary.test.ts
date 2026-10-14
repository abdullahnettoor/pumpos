import { describe, expect, it } from 'vitest';
import {
  handoverState,
  partyState,
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
    // Money
    ['overdue', 'Overdue', 'warning'],
    ['over-limit', 'Over limit', 'danger'],
    ['voided', 'Voided', 'neutral'],
    ['adjustment', 'Adjustment', 'info'],
    ['awaiting-decantation', 'Awaiting decantation', 'warning'],
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

  it('treats under half a paisa (or half a centilitre) as balanced, either way', () => {
    expect(variancePresentation(0.004, 'cash').state).toBe('balanced');
    expect(variancePresentation(-0.004, 'cash').state).toBe('balanced');
    expect(variancePresentation(0.004, 'stock').state).toBe('balanced');
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
