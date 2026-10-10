import { describe, expect, it } from 'vitest';
import {
  compactRupees,
  litres,
  percent,
  rangeLabel,
  shortDate,
  signedRupees,
  weekdayDate,
  weekdayInitial,
} from './format.js';

describe('compactRupees', () => {
  it('abbreviates by Indian magnitude', () => {
    expect(compactRupees(3227000)).toBe('₹32.27L');
    expect(compactRupees(48200)).toBe('₹48.2k');
    expect(compactRupees(48000)).toBe('₹48k');
    expect(compactRupees(850)).toBe('₹850');
    expect(compactRupees(25000000)).toBe('₹2.50Cr');
    expect(compactRupees(0)).toBe('₹0');
  });
});

describe('signedRupees', () => {
  it('signs a variance with a true minus and groups digits', () => {
    expect(signedRupees(-210)).toBe('−₹210');
    expect(signedRupees(1590)).toBe('+₹1,590');
    expect(signedRupees(0)).toBe('₹0');
    expect(signedRupees(0.2)).toBe('₹0');
  });
});

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
