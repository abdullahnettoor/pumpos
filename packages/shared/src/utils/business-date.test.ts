import { describe, expect, it } from 'vitest';
import { resolveBusinessDate, resolveEntryDate, shiftBusinessDate } from './business-date.js';

/**
 * Business dates are calendar labels, not instants. The arithmetic must roll
 * month and year boundaries, and must not be perturbed by the host's timezone
 * or by a DST transition — which is why it runs at UTC midnight.
 */
describe('shiftBusinessDate', () => {
  it.each([
    ['2026-03-15', -13, '2026-03-02'],
    ['2026-03-05', -13, '2026-02-20'],
    ['2026-01-05', -13, '2025-12-23'],
    ['2026-03-01', -1, '2026-02-28'],
    // 2028 is a leap year: 29 February must exist.
    ['2028-03-01', -1, '2028-02-29'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2026-03-15', 0, '2026-03-15'],
  ])('%s shifted by %i days is %s', (date, delta, expected) => {
    expect(shiftBusinessDate(date, delta)).toBe(expected);
  });

  it('is unaffected by a host timezone behind UTC', () => {
    // Anchoring at T00:00:00Z is what makes this true; a bare `new Date(date)`
    // in a UTC-5 zone would land on the previous day.
    const original = process.env.TZ;
    process.env.TZ = 'America/New_York';
    try {
      expect(shiftBusinessDate('2026-03-15', -13)).toBe('2026-03-02');
    } finally {
      process.env.TZ = original;
    }
  });
});

describe('resolveEntryDate (ADR 0005)', () => {
  // 03:00 IST on the 15th = 21:30 UTC on the 14th.
  const now = new Date('2026-03-14T21:30:00Z');

  it('dates an office entry by the station calendar, ignoring Day Start', () => {
    expect(resolveEntryDate({ now, timeZone: 'Asia/Kolkata' })).toBe('2026-03-15');
  });

  it('differs from the business date before Day Start', () => {
    expect(resolveBusinessDate({ now, timeZone: 'Asia/Kolkata', dayStartsAt: '06:00' })).toBe(
      '2026-03-14',
    );
  });
});
