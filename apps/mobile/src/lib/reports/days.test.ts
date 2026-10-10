import { describe, expect, it } from 'vitest';
import { barWidths, dayParts, draftDates, monthLabel, shortDate, weekChange } from './days.js';

const d = (businessDate: string, totalSales: number, status = 'SEALED') =>
  ({ businessDate, totalSales, status }) as never;

describe('reports day helpers', () => {
  it('derives weekday and day from the Business Date', () => {
    expect(dayParts('2026-10-09')).toEqual({ weekday: 'Fri', day: 9 });
    expect(dayParts('2026-03-01')).toEqual({ weekday: 'Sun', day: 1 });
  });
  it('labels months and short dates', () => {
    expect(monthLabel('2026-09')).toBe('September 2026');
    expect(shortDate('2026-10-08')).toBe('8 Oct');
  });
  it('computes week change, hiding it without a prior week', () => {
    expect(weekChange(106.4, 100)).toBe(6.4);
    expect(weekChange(90, 100)).toBe(-10);
    expect(weekChange(50, 0)).toBeNull();
  });
  it('scales bars to the visible maximum', () => {
    expect(barWidths([d('a', 500), d('b', 250), d('c', 0)])).toEqual([100, 50, 0]);
    expect(barWidths([d('a', 0)])).toEqual([0]);
    expect(barWidths([])).toEqual([]);
  });
  it('lists draft dates', () => {
    expect(draftDates([d('a', 1, 'LIVE'), d('b', 1, 'DRAFT'), d('c', 1, 'SEALED')])).toEqual(['b']);
  });
});
