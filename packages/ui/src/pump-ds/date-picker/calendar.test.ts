import { describe, expect, it } from 'vite-plus/test';
import { formatPickerDate, monthCaption, monthWeeks, shiftDate, shiftMonth } from './calendar.js';

describe('date picker calendar (#603)', () => {
  it('labels a day unambiguously: weekday, day, month name, year', () => {
    expect(formatPickerDate('2026-10-11')).toBe('Sun 11 Oct 2026');
    expect(formatPickerDate('2026-10-05')).toBe('Mon 5 Oct 2026');
    expect(formatPickerDate('nope')).toBe('nope');
  });

  it('steps days and months across their ends', () => {
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(monthCaption('2026-10')).toBe('October 2026');
  });

  it('lays a month out Monday first, padded to whole weeks', () => {
    const weeks = monthWeeks('2026-10'); // 1 Oct 2026 is a Thursday
    expect(weeks[0]).toEqual([
      null,
      null,
      null,
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ]);
    expect(weeks.flat().filter(Boolean)).toHaveLength(31);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });
});
