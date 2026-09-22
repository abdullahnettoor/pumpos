import { describe, expect, it, vi, afterEach } from 'vitest';
import { formatMoney, inr, formatBusinessDate, formatElapsedSince } from './format.js';

describe('formatMoney', () => {
  it('formats INR with Indian grouping and exactly two decimal places', () => {
    expect(inr(102078.132)).toBe('₹1,02,078.13');
    expect(inr(5000)).toBe('₹5,000.00');
  });

  it('supports money cells that provide their own currency label', () => {
    expect(formatMoney(-0.126, { symbol: false })).toBe('-0.13');
  });
});

describe('formatBusinessDate', () => {
  it('formats a YYYY-MM-DD business date as "09 Jul 2026"', () => {
    expect(formatBusinessDate('2026-07-09')).toBe('09 Jul 2026');
  });

  it('keeps the calendar day stable (UTC), never rolling back a day', () => {
    // A local-midnight Date in a negative-offset zone would show the 31st;
    // the business date must stay the 1st regardless of the runner's timezone.
    expect(formatBusinessDate('2026-08-01')).toBe('01 Aug 2026');
  });

  it('returns the input unchanged when it is not a valid date', () => {
    expect(formatBusinessDate('not-a-date')).toBe('not-a-date');
  });
});

describe('formatElapsedSince', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('formats hours and minutes since the open time as "Nh Nm"', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-22T12:12:00.000Z'));
    expect(formatElapsedSince('2026-09-22T06:00:00.000Z')).toBe('6h 12m');
  });

  it('always includes the hours segment, even under an hour', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-22T06:12:00.000Z'));
    expect(formatElapsedSince('2026-09-22T06:00:00.000Z')).toBe('0h 12m');
  });

  it('clamps a future open time to 0h 0m', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-22T06:00:00.000Z'));
    expect(formatElapsedSince('2026-09-22T07:00:00.000Z')).toBe('0h 0m');
  });

  it('returns the fallback for an unparseable input', () => {
    expect(formatElapsedSince(null)).toBe('—');
  });
});
