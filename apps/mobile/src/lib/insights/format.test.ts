import { describe, expect, it } from 'vitest';
import { litres, percent, rangeLabel, shortDate, weekdayDate, weekdayInitial } from './format.js';

describe('litres / percent', () => {
  it('formats', () => {
    expect(litres(2180)).toBe('2,180 L');
    expect(percent(6.4)).toBe('6.4%');
    expect(percent(-20)).toBe('20%');
  });
});

describe('dates', () => {
  it('reads plain dates without locale tables (September is "Sep")', () => {
    expect(shortDate('2026-09-03')).toBe('3 Sep');
    expect(weekdayDate('2026-10-07')).toBe('Wed 7 Oct');
    expect(weekdayInitial('2026-10-07')).toBe('W');
    expect(weekdayInitial('2026-10-04')).toBe('S');
  });
  it('labels a range, compactly within a month', () => {
    expect(rangeLabel('2026-10-03', '2026-10-09')).toBe('3–9 Oct');
    expect(rangeLabel('2026-09-28', '2026-10-04')).toBe('28 Sep – 4 Oct');
  });
});
