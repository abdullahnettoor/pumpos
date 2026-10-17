import { describe, expect, it } from 'vitest';
import { computeRange, matchPreset } from './range.js';
import { formatDateSpan } from '../../utils/format.js';

// 14 Oct 2026, 03:00 IST: before a 06:00 Day Start the business day is still 13 Oct.
const EARLY_14_OCT = new Date('2026-10-13T21:30:00.000Z');
const IST_6AM = { timeZone: 'Asia/Kolkata', dayStartsAt: '06:00' };
const IST = { timeZone: 'Asia/Kolkata', dayStartsAt: '00:00' };

describe('computeRange', () => {
  it('anchors presets to the station date across a month boundary, not UTC (#288)', () => {
    // 2026-03-01 02:00 IST = 2026-02-28 20:30 UTC. A UTC-derived date would land on February.
    const istEarlyMarch = new Date('2026-02-28T20:30:00.000Z');
    expect(computeRange('today', IST, istEarlyMarch)).toEqual({
      from: '2026-03-01',
      to: '2026-03-01',
    });
    expect(computeRange('yesterday', IST, istEarlyMarch)).toEqual({
      from: '2026-02-28',
      to: '2026-02-28',
    });
    expect(computeRange('last-7', IST, istEarlyMarch)).toEqual({
      from: '2026-02-23',
      to: '2026-03-01',
    });
    expect(computeRange('this-month', IST, istEarlyMarch)).toEqual({
      from: '2026-03-01',
      to: '2026-03-01',
    });
  });

  it('anchors on the station business day, not the calendar day', () => {
    expect(computeRange('today', IST_6AM, EARLY_14_OCT)).toEqual({
      from: '2026-10-13',
      to: '2026-10-13',
    });
    expect(computeRange('today', IST, EARLY_14_OCT)).toEqual({
      from: '2026-10-14',
      to: '2026-10-14',
    });
  });

  it('resolves last month as the whole previous calendar month', () => {
    expect(computeRange('last-month', IST, EARLY_14_OCT)).toEqual({
      from: '2026-09-01',
      to: '2026-09-30',
    });
    const jan = new Date('2026-01-10T06:00:00.000Z');
    expect(computeRange('last-month', IST, jan)).toEqual({ from: '2025-12-01', to: '2025-12-31' });
  });

  it('matches a value back to its preset, else custom', () => {
    const presets = ['today', 'this-month', 'last-month'] as const;
    expect(matchPreset({ from: '2026-10-01', to: '2026-10-14' }, presets, IST, EARLY_14_OCT)).toBe(
      'this-month',
    );
    expect(matchPreset({ from: '2026-10-02', to: '2026-10-14' }, presets, IST, EARLY_14_OCT)).toBe(
      'custom',
    );
  });
});

describe('formatDateSpan', () => {
  it('reads like a person writes a range, never as YYYY-MM-DD', () => {
    expect(formatDateSpan('2026-10-14', '2026-10-14')).toBe('14 Oct');
    expect(formatDateSpan('2026-10-01', '2026-10-14')).toBe('1–14 Oct');
    expect(formatDateSpan('2026-09-28', '2026-10-04')).toBe('28 Sep – 4 Oct');
  });

  it('adds years when the span crosses a year or is not in the reference year', () => {
    expect(formatDateSpan('2025-12-28', '2026-01-04')).toBe('28 Dec 2025 – 4 Jan 2026');
    expect(formatDateSpan('2025-10-01', '2025-10-14', { referenceDate: '2026-10-14' })).toBe(
      '1–14 Oct 2025',
    );
    expect(formatDateSpan('2026-10-01', '2026-10-14', { referenceDate: '2026-10-14' })).toBe(
      '1–14 Oct',
    );
  });
});
