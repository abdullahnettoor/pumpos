import { describe, expect, it } from 'vite-plus/test';
import { formatCalendarDate, formatCalendarRange, formatInstantDate } from './display-date.js';
import { formatStationDateTime } from './shift-context.js';

// #603: "05 Oct 2026" → "5 Oct 2026" everywhere, one formatter.
describe('display dates', () => {
  it('drops the leading zero and never prints "Sept"', () => {
    expect(formatCalendarDate('2026-10-05')).toBe('5 Oct 2026');
    expect(formatCalendarDate('2026-09-10')).toBe('10 Sep 2026');
    expect(formatCalendarDate('2026-10-05', { year: 'short' })).toBe('5 Oct 26');
    expect(formatCalendarDate('2026-10-05', { year: 'none' })).toBe('5 Oct');
    expect(formatCalendarDate('soon')).toBe('soon');
  });

  it('reads an instant on the station clock', () => {
    // 20:00 UTC on 4 Oct is 01:30 on 5 Oct in India.
    expect(formatInstantDate(new Date('2026-10-04T20:00:00Z'), 'Asia/Kolkata')).toBe('5 Oct 2026');
    expect(formatStationDateTime('2026-10-04T20:00:00Z', 'Asia/Kolkata')).toBe(
      '5 Oct 2026, 01:30 am',
    );
  });
});

describe('formatCalendarRange (#604)', () => {
  it('shares what both ends share', () => {
    expect(formatCalendarRange('2026-10-01', '2026-10-15')).toBe('1–15 Oct 2026');
    expect(formatCalendarRange('2026-09-28', '2026-10-15')).toBe('28 Sep – 15 Oct 2026');
    expect(formatCalendarRange('2025-12-28', '2026-01-03')).toBe('28 Dec 2025 – 3 Jan 2026');
    expect(formatCalendarRange('2026-10-05', '2026-10-05')).toBe('5 Oct 2026');
  });
});
