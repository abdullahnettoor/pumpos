import { describe, expect, it } from 'vitest';
import { formatVariance } from './variance.js';

describe('formatVariance: the variance figure as read on every screen', () => {
  it('reads zero as "Balanced", never ₹0.00', () => {
    expect(formatVariance(0, 'cash')).toMatchObject({ text: 'Balanced', tone: 'success' });
    expect(formatVariance(0.004, 'cash').text).toBe('Balanced');
    expect(formatVariance(0, 'stock').text).toBe('Balanced');
  });

  it('reads a surplus with a plus, in amber', () => {
    expect(formatVariance(1200, 'cash')).toEqual({
      text: '+₹1,200.00',
      tone: 'warning',
      state: 'surplus',
      label: 'Surplus',
      sign: 'positive',
    });
  });

  it('reads a shortage with a true minus before the symbol, in red', () => {
    expect(formatVariance(-340.5, 'cash')).toMatchObject({ text: '\u2212₹340.50', tone: 'danger' });
  });

  it('drops the ₹ on request, keeping the sign', () => {
    expect(formatVariance(1200, 'cash', { symbol: false }).text).toBe('+1,200.00');
    expect(formatVariance(-340.5, 'cash', { symbol: false }).text).toBe('\u2212340.50');
    expect(formatVariance(0, 'cash', { symbol: false }).text).toBe('Balanced');
  });

  it('drops paise on request but keeps them under ₹1 so a real variance never reads ₹0', () => {
    expect(formatVariance(-1240.4, 'cash', { decimals: 0 }).text).toBe('\u2212₹1,240');
    expect(formatVariance(0.3, 'cash', { decimals: 0 }).text).toBe('+₹0.30');
  });

  it('reads stock variance in litres', () => {
    expect(formatVariance(12.5, 'stock')).toMatchObject({ text: '+12.50 L', tone: 'warning' });
    expect(formatVariance(-3, 'stock')).toMatchObject({ text: '\u22123.00 L', tone: 'danger' });
  });
});
