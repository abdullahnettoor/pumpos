import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  formatMoney,
  inr,
  formatBusinessDate,
  formatElapsedSince,
  formatSignedMoney,
  signedMoneyParts,
  formatQuantity,
  formatCompactMoney,
  formatDensity,
  formatTemperature,
} from './format.js';

describe('formatMoney', () => {
  it('formats INR with Indian grouping and exactly two decimal places', () => {
    expect(inr(102078.132)).toBe('₹1,02,078.13');
    expect(inr(5000)).toBe('₹5,000.00');
  });

  it('puts a true minus before the rupee symbol, never ₹-1,200', () => {
    expect(inr(-1200)).toBe('−₹1,200.00');
    expect(formatMoney(-1200, { decimals: 0 })).toBe('−₹1,200');
  });

  it('supports money cells that provide their own currency label, with the same sign rule', () => {
    expect(formatMoney(-0.126, { symbol: false })).toBe('−0.13');
    expect(formatMoney(-1200, { symbol: false })).toBe('−1,200.00');
    expect(formatMoney(1200, { symbol: false })).toBe('1,200.00');
    expect(formatMoney(-1200, { symbol: false })).not.toContain('-');
  });

  it('never prints a negative zero', () => {
    expect(formatMoney(-0.001, { symbol: false })).toBe('0.00');
    expect(formatMoney(-0.001)).toBe('₹0.00');
    expect(formatMoney(-0.4, { decimals: 0 })).toBe('₹0');
  });

  it('reads a missing amount as zero, a non-finite one as a dash', () => {
    expect(formatMoney(null)).toBe('₹0.00');
    expect(formatMoney(undefined, { symbol: false })).toBe('0.00');
    expect(formatMoney(Number.NaN)).toBe('—');
    expect(formatMoney('abc', { symbol: false })).toBe('—');
    expect(formatMoney(Number.POSITIVE_INFINITY)).toBe('—');
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

describe('formatSignedMoney', () => {
  it('puts a true minus sign (U+2212) before the rupee symbol', () => {
    expect(formatSignedMoney(-1200)).toBe('\u2212₹1,200.00');
    expect(formatSignedMoney('-1200.5')).toBe('−₹1,200.50');
    expect(formatSignedMoney(1200)).toBe('₹1,200.00');
  });
});

describe('signedMoneyParts', () => {
  it('reports the sign so a caller can choose a tone', () => {
    expect(signedMoneyParts(-340, { decimals: 0 })).toEqual({
      text: '−₹340',
      sign: 'negative',
      magnitude: '₹340',
    });
    expect(signedMoneyParts(120, { decimals: 0, plus: true })).toEqual({
      text: '+₹120',
      sign: 'positive',
      magnitude: '₹120',
    });
  });

  it('reads an amount that rounds to nothing as unsigned zero', () => {
    expect(signedMoneyParts(-0.004)).toEqual({ text: '₹0.00', sign: 'zero', magnitude: '₹0.00' });
    expect(formatSignedMoney(0.4, { decimals: 0, plus: true })).toBe('₹0');
  });

  it('treats a missing amount as zero and a non-finite one as a dash', () => {
    expect(formatSignedMoney(null)).toBe('₹0.00');
    expect(signedMoneyParts('abc')).toEqual({ text: '—', sign: 'zero', magnitude: '—' });
  });

  it('drops the symbol on request, keeping the true minus and the plus', () => {
    expect(formatSignedMoney(-12.5, { symbol: false, plus: true })).toBe('−12.50');
    expect(formatSignedMoney(12.5, { symbol: false, plus: true })).toBe('+12.50');
    expect(formatSignedMoney(0.001, { symbol: false, plus: true })).toBe('0.00');
  });
});

describe('formatQuantity', () => {
  it('shows litres to 2 decimals with Indian grouping, any litre spelling as L', () => {
    expect(formatQuantity(102078.5, 'L')).toBe('1,02,078.50 L');
    expect(formatQuantity(1240, 'Ltr')).toBe('1,240.00 L');
    expect(formatQuantity('22000', 'litres')).toBe('22,000.00 L');
  });

  it('shows kilolitres to 1 decimal', () => {
    expect(formatQuantity(18.46, 'KL')).toBe('18.5 KL');
  });

  it('shows density to 1 decimal', () => {
    expect(formatQuantity(832.46, 'kg/m³')).toBe('832.5 kg/m³');
    expect(formatQuantity(832.46, 'kg/m3')).toBe('832.5 kg/m³');
  });

  it('shows counted units whole', () => {
    expect(formatQuantity(1200, 'Nos')).toBe('1,200 Nos');
    expect(formatQuantity(3, 'pcs')).toBe('3 pcs');
  });

  it('signs a quantity with a true minus, and a plus when asked', () => {
    expect(formatQuantity(-42, 'L')).toBe('−42.00 L');
    expect(formatQuantity(6.5, 'L', { plus: true })).toBe('+6.50 L');
    expect(formatQuantity(-0.001, 'L', { plus: true })).toBe('0.00 L');
  });

  it('takes explicit decimals for a meter or dip reading', () => {
    expect(formatQuantity(12345.6789, 'L', { decimals: 3 })).toBe('12,345.679 L');
    expect(formatQuantity(1240, 'L', { decimals: 1 })).toBe('1,240.0 L');
  });

  it('returns a dash for a missing amount', () => {
    expect(formatQuantity(null, 'L')).toBe('—');
    expect(formatQuantity(undefined, 'L', { fallback: '' })).toBe('');
  });
});

describe('formatDensity', () => {
  it('shows a density figure to 1 decimal without the unit', () => {
    expect(formatDensity(741.24)).toBe('741.2');
    expect(formatDensity(745)).toBe('745.0');
  });

  it('signs a change with a plus or a true minus, and zero unsigned', () => {
    expect(formatDensity(0.64, { plus: true })).toBe('+0.6');
    expect(formatDensity(-5.25, { plus: true })).toBe('\u22125.3');
    expect(formatDensity(0, { plus: true })).toBe('0.0');
    expect(formatDensity(-0.04, { plus: true })).toBe('0.0');
  });

  it('returns a dash for a missing reading', () => {
    expect(formatDensity(null)).toBe('—');
  });
});

describe('formatTemperature', () => {
  it('shows degrees Celsius with at most one decimal', () => {
    expect(formatTemperature(30)).toBe('30 °C');
    expect(formatTemperature(28.54)).toBe('28.5 °C');
  });

  it('returns a dash for a missing reading', () => {
    expect(formatTemperature(null)).toBe('—');
  });
});

describe('formatCompactMoney', () => {
  it('abbreviates thousands, lakhs and crores, trimming trailing zeros', () => {
    expect(formatCompactMoney(287000)).toBe('₹2.87L');
    expect(formatCompactMoney(38500)).toBe('₹38.5k');
    expect(formatCompactMoney(48000)).toBe('₹48k');
    expect(formatCompactMoney(200000)).toBe('₹2L');
    expect(formatCompactMoney(25000000)).toBe('₹2.5Cr');
  });

  it('shows whole rupees below a thousand', () => {
    expect(formatCompactMoney(850)).toBe('₹850');
    expect(formatCompactMoney(0)).toBe('₹0');
  });

  it('carries into the next unit instead of reading 100k or 100L', () => {
    expect(formatCompactMoney(999.6)).toBe('₹1k');
    expect(formatCompactMoney(99960)).toBe('₹1L');
    expect(formatCompactMoney(9999999)).toBe('₹1Cr');
  });

  it('signs a negative with a true minus', () => {
    expect(formatCompactMoney(-250000)).toBe('−₹2.5L');
    expect(formatCompactMoney(-340)).toBe('−₹340');
  });

  it('keeps Indian grouping on a very large crore figure', () => {
    expect(formatCompactMoney(1e12)).toBe('₹1,00,000Cr');
    expect(formatCompactMoney(-12345e7)).toBe('−₹12,345Cr');
  });

  it('returns a dash for a missing or non-finite amount, as formatMoney does', () => {
    expect(formatCompactMoney(null)).toBe('—');
    expect(formatCompactMoney(Number.NaN)).toBe('—');
    expect(formatCompactMoney('abc')).toBe(formatMoney('abc'));
  });
});
