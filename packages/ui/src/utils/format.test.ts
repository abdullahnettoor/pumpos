import { describe, expect, it } from 'vitest';
import { formatMoney, inr } from './format.js';

describe('formatMoney', () => {
  it('formats INR with Indian grouping and exactly two decimal places', () => {
    expect(inr(102078.132)).toBe('₹1,02,078.13');
    expect(inr(5000)).toBe('₹5,000.00');
  });

  it('supports money cells that provide their own currency label', () => {
    expect(formatMoney(-0.126, { symbol: false })).toBe('-0.13');
  });
});
