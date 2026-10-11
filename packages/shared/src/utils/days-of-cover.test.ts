import { describe, expect, it } from 'vitest';
import { daysOfCoverLeft, formatDaysOfCover } from './days-of-cover.js';

describe('formatDaysOfCover', () => {
  it('uses the plural above one day', () => {
    expect(formatDaysOfCover(2.6)).toBe('2.6 days');
    expect(formatDaysOfCover(1.04)).toBe('1.0 day');
    expect(formatDaysOfCover(1.06)).toBe('1.1 days');
    expect(formatDaysOfCover(12)).toBe('12.0 days');
  });

  it('uses the singular up to and including one day', () => {
    expect(formatDaysOfCover(0.9)).toBe('0.9 day');
    expect(formatDaysOfCover(1)).toBe('1.0 day');
  });

  it('reads an empty tank as 0 days', () => {
    expect(formatDaysOfCover(0)).toBe('0 days');
    expect(formatDaysOfCover(0.04)).toBe('0 days');
  });

  it('caps long covers', () => {
    expect(formatDaysOfCover(30)).toBe('30.0 days');
    expect(formatDaysOfCover(30.1)).toBe('30+ days');
    expect(formatDaysOfCover(400)).toBe('30+ days');
  });

  it('is empty without a figure', () => {
    for (const v of [null, undefined, NaN, Infinity, -1]) expect(formatDaysOfCover(v)).toBe('');
  });
});

describe('daysOfCoverLeft', () => {
  it('words the alert copy', () => {
    expect(daysOfCoverLeft(0.9)).toBe('0.9 day of cover left');
    expect(daysOfCoverLeft(2.6)).toBe('2.6 days of cover left');
    expect(daysOfCoverLeft(null)).toBe('');
  });
});
