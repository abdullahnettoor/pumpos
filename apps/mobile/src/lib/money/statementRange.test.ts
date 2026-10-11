import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RANGE,
  choiceOfForm,
  customRangeIssues,
  presetOf,
  rangeFormDefaults,
  rangeLabel,
  rangePresets,
  resolveRange,
  statementRangeFormSchema,
  widenRange,
} from './statementRange.js';

describe('resolveRange', () => {
  it('defaults to the current month, its first day to today (never the future)', () => {
    expect(resolveRange(DEFAULT_RANGE, '2026-10-09')).toEqual({
      from: '2026-10-01',
      to: '2026-10-09',
    });
    expect(resolveRange(DEFAULT_RANGE, '2026-02-28')).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    });
    expect(resolveRange(DEFAULT_RANGE, '2028-02-10').to).toBe('2028-02-10');
  });

  it('counts the current month in a wider window and ends today', () => {
    expect(resolveRange({ kind: 'recent', months: 3 }, '2026-01-15')).toEqual({
      from: '2025-11-01',
      to: '2026-01-15',
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

  it('holds a custom end that is after today to today', () => {
    expect(
      resolveRange({ kind: 'custom', from: '2026-10-01', to: '2026-10-31' }, '2026-10-09'),
    ).toEqual({ from: '2026-10-01', to: '2026-10-09' });
    expect(
      resolveRange({ kind: 'custom', from: '2026-10-20', to: '2026-10-31' }, '2026-10-09'),
    ).toEqual({ from: '2026-10-09', to: '2026-10-09' });
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
  const resolved = (id: string, today = '2026-10-09') =>
    resolveRange(rangePresets(today).find((p) => p.id === id)!.choice, today);

  it('offers this month first, from the 1st to today', () => {
    expect(presets[0]).toMatchObject({ id: 'this-month', label: 'This month' });
    expect(resolved('this-month')).toEqual({ from: '2026-10-01', to: '2026-10-09' });
  });

  it('last month is the whole previous month, across a year end', () => {
    expect(resolved('last-month')).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(resolved('last-month', '2026-01-04')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
  });

  it('last 3 months counts this one and ends today', () => {
    expect(resolved('last-3-months')).toEqual({ from: '2026-08-01', to: '2026-10-09' });
  });

  it('this financial year runs from 1 April to today, never to 31 March ahead', () => {
    expect(resolved('this-fy')).toEqual({ from: '2026-04-01', to: '2026-10-09' });
    expect(resolved('this-fy', '2027-02-10')).toEqual({ from: '2026-04-01', to: '2027-02-10' });
    expect(resolved('this-fy', '2027-04-01')).toEqual({ from: '2027-04-01', to: '2027-04-01' });
  });

  it('no preset ends after today', () => {
    for (const today of ['2026-10-09', '2026-03-31', '2027-04-01']) {
      for (const p of rangePresets(today)) {
        expect(resolveRange(p.choice, today).to <= today).toBe(true);
      }
    }
  });

  it('every preset is an explicit range, so "Earlier months" never applies to one', () => {
    expect(presets.every((p) => p.choice.kind === 'custom')).toBe(true);
    expect(byId['this-month'].choice).not.toEqual(DEFAULT_RANGE);
  });
});

describe('presetOf', () => {
  it('recognises the preset a range matches, else custom', () => {
    expect(presetOf(DEFAULT_RANGE, '2026-10-09')).toBe('this-month');
    expect(presetOf({ kind: 'custom', from: '2026-08-01', to: '2026-10-09' }, '2026-10-09')).toBe(
      'last-3-months',
    );
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

describe('customRangeIssues', () => {
  const TODAY = '2026-10-09';

  it('accepts a valid range, inclusive of one day', () => {
    expect(customRangeIssues('2026-09-05', '2026-09-20', TODAY)).toEqual({});
    expect(customRangeIssues('2026-09-05', '2026-09-05', TODAY)).toEqual({});
  });

  it('asks for each date on its own field', () => {
    expect(customRangeIssues('', '2026-09-20', TODAY)).toEqual({ from: 'Pick a start date.' });
    expect(customRangeIssues('2026-09-05', '', TODAY)).toEqual({ to: 'Pick an end date.' });
  });

  it('rejects an end before the start, on the end field', () => {
    expect(customRangeIssues('2026-09-20', '2026-09-05', TODAY)).toEqual({
      to: 'The end date can’t be before the start date.',
    });
  });

  it('rejects an end after today, accepts today', () => {
    expect(customRangeIssues('2026-10-01', '2026-10-10', TODAY)).toEqual({
      to: 'The end date can’t be after today.',
    });
    expect(customRangeIssues('2026-10-01', '2026-10-09', TODAY)).toEqual({});
  });

  it('rejects a date that does not exist', () => {
    expect(customRangeIssues('2026-02-30', '2026-03-05', TODAY)).toEqual({
      from: 'Pick a start date.',
    });
  });
});

describe('statementRangeFormSchema', () => {
  const TODAY = '2026-10-09';
  const schema = statementRangeFormSchema(TODAY);
  const errorsOf = (form: object) => {
    const r = schema.safeParse(form);
    return r.success ? {} : Object.fromEntries(r.error.issues.map((i) => [i.path[0], i.message]));
  };

  it('takes a preset without looking at the dates', () => {
    expect(schema.safeParse({ preset: 'last-month', from: '', to: '' }).success).toBe(true);
  });

  it('puts each custom date problem on its own field', () => {
    expect(errorsOf({ preset: 'custom', from: '', to: '2026-10-01' })).toEqual({
      from: 'Pick a start date.',
    });
    expect(errorsOf({ preset: 'custom', from: '2026-10-01', to: '2026-10-10' })).toEqual({
      to: 'The end date can’t be after today.',
    });
  });

  it('turns a submitted form into the choice it stands for', () => {
    expect(choiceOfForm({ preset: 'this-fy', from: '', to: '' }, TODAY)).toEqual({
      kind: 'custom',
      from: '2026-04-01',
      to: '2026-10-09',
    });
    expect(choiceOfForm({ preset: 'custom', from: '2026-09-05', to: '2026-09-20' }, TODAY)).toEqual(
      { kind: 'custom', from: '2026-09-05', to: '2026-09-20' },
    );
  });

  it('opens on the range on screen', () => {
    expect(rangeFormDefaults(DEFAULT_RANGE, TODAY)).toEqual({
      preset: 'this-month',
      from: '2026-10-01',
      to: '2026-10-09',
    });
    expect(
      rangeFormDefaults({ kind: 'custom', from: '2026-09-02', to: '2026-09-30' }, TODAY).preset,
    ).toBe('custom');
  });
});
