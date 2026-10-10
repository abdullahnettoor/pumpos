import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RANGE,
  customRangeProblem,
  presetOf,
  rangeLabel,
  rangePresets,
  resolveRange,
  widenRange,
} from './statementRange.js';

describe('resolveRange', () => {
  it('defaults to the current month, first to last day inclusive', () => {
    expect(resolveRange(DEFAULT_RANGE, '2026-10-09')).toEqual({
      from: '2026-10-01',
      to: '2026-10-31',
    });
    expect(resolveRange(DEFAULT_RANGE, '2026-02-28')).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    });
    expect(resolveRange(DEFAULT_RANGE, '2028-02-10').to).toBe('2028-02-29');
  });

  it('counts the current month in a wider window and ends at its last day', () => {
    expect(resolveRange({ kind: 'recent', months: 3 }, '2026-01-15')).toEqual({
      from: '2025-11-01',
      to: '2026-01-31',
    });
  });

  it('keeps a custom range as picked', () => {
    expect(
      resolveRange({ kind: 'custom', from: '2026-09-05', to: '2026-09-20' }, '2026-10-09'),
    ).toEqual({
      from: '2026-09-05',
      to: '2026-09-20',
    });
  });
});

describe('widenRange', () => {
  it('goes one more month back from a recent window', () => {
    expect(widenRange({ kind: 'recent', months: 1 })).toEqual({ kind: 'recent', months: 2 });
  });

  it('leaves a custom range alone (the filter picks another)', () => {
    const custom = { kind: 'custom', from: '2026-09-05', to: '2026-09-20' } as const;
    expect(widenRange(custom)).toBe(custom);
  });
});

describe('rangeLabel', () => {
  it('names a whole calendar month', () => {
    expect(rangeLabel({ from: '2026-10-01', to: '2026-10-31' })).toBe('October 2026');
  });

  it('names several whole months by their ends', () => {
    expect(rangeLabel({ from: '2026-08-01', to: '2026-10-31' })).toBe('1 Aug 2026 – 31 Oct 2026');
  });

  it('names a part of a month by its days', () => {
    expect(rangeLabel({ from: '2026-09-05', to: '2026-09-20' })).toBe('5 Sep 2026 – 20 Sep 2026');
  });

  it('names a single day once', () => {
    expect(rangeLabel({ from: '2026-09-05', to: '2026-09-05' })).toBe('5 Sep 2026');
  });
});

describe('rangePresets', () => {
  const presets = rangePresets('2026-10-09');
  const byId = Object.fromEntries(presets.map((p) => [p.id, p]));

  it('offers this month first', () => {
    expect(presets[0]).toMatchObject({ id: 'this-month', label: 'This month' });
    expect(resolveRange(byId['this-month'].choice, '2026-10-09')).toEqual({
      from: '2026-10-01',
      to: '2026-10-31',
    });
  });

  it('last month is the whole previous month, across a year end', () => {
    expect(resolveRange(byId['last-month'].choice, '2026-10-09')).toEqual({
      from: '2026-09-01',
      to: '2026-09-30',
    });
    const jan = rangePresets('2026-01-04').find((p) => p.id === 'last-month')!;
    expect(resolveRange(jan.choice, '2026-01-04')).toEqual({
      from: '2025-12-01',
      to: '2025-12-31',
    });
  });

  it('last 3 months counts this one', () => {
    expect(resolveRange(byId['last-3-months'].choice, '2026-10-09')).toEqual({
      from: '2026-08-01',
      to: '2026-10-31',
    });
  });

  it('this financial year runs 1 April to 31 March', () => {
    expect(resolveRange(byId['this-fy'].choice, '2026-10-09')).toEqual({
      from: '2026-04-01',
      to: '2027-03-31',
    });
    const feb = rangePresets('2027-02-10').find((p) => p.id === 'this-fy')!;
    expect(resolveRange(feb.choice, '2027-02-10')).toEqual({
      from: '2026-04-01',
      to: '2027-03-31',
    });
  });
});

describe('presetOf', () => {
  it('recognises the preset a range matches, else custom', () => {
    expect(presetOf(DEFAULT_RANGE, '2026-10-09')).toBe('this-month');
    expect(presetOf({ kind: 'recent', months: 3 }, '2026-10-09')).toBe('last-3-months');
    expect(presetOf({ kind: 'custom', from: '2026-09-01', to: '2026-09-30' }, '2026-10-09')).toBe(
      'last-month',
    );
    expect(presetOf({ kind: 'custom', from: '2026-09-02', to: '2026-09-30' }, '2026-10-09')).toBe(
      'custom',
    );
    expect(presetOf({ kind: 'recent', months: 2 }, '2026-10-09')).toBe('custom');
  });
});

describe('customRangeProblem', () => {
  const TODAY = '2026-10-09';

  it('accepts a valid range, inclusive of one day', () => {
    expect(customRangeProblem('2026-09-05', '2026-09-20', TODAY)).toBeNull();
    expect(customRangeProblem('2026-09-05', '2026-09-05', TODAY)).toBeNull();
  });

  it('asks for both dates', () => {
    expect(customRangeProblem('', '2026-09-20', TODAY)).toBe('Pick a start date.');
    expect(customRangeProblem('2026-09-05', '', TODAY)).toBe('Pick an end date.');
  });

  it('rejects an end before the start', () => {
    expect(customRangeProblem('2026-09-20', '2026-09-05', TODAY)).toBe(
      'The end date can’t be before the start date.',
    );
  });

  it('rejects an end after today, accepts today', () => {
    expect(customRangeProblem('2026-10-01', '2026-10-10', TODAY)).toBe(
      'The end date can’t be after today.',
    );
    expect(customRangeProblem('2026-10-01', '2026-10-09', TODAY)).toBeNull();
  });

  it('rejects a date that does not exist', () => {
    expect(customRangeProblem('2026-02-30', '2026-03-05', TODAY)).toBe('Pick a start date.');
  });
});
