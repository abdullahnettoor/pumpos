import { describe, expect, it } from 'vitest';
import { formatStockVariance, formatVariance } from './variance.js';

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

  it('reads stock by the quantity rule: under half a millilitre is Balanced, 1 ml is not (#556)', () => {
    expect(formatVariance(0.0004, 'stock').text).toBe('Balanced');
    expect(formatVariance(-0.001, 'stock')).toMatchObject({
      text: '\u22120.001 L',
      state: 'short',
    });
    expect(formatVariance(0.004, 'stock')).toMatchObject({ text: '+0.004 L', state: 'surplus' });
  });
});

describe('formatStockVariance', () => {
  it("uses the unit's decimals", () => {
    expect(formatStockVariance(12.5, 'L')).toBe('+12.50 L');
    expect(formatStockVariance(-2, 'Nos')).toBe('\u22122 Nos');
    expect(formatStockVariance(0, 'L')).toBe('0.00 L');
  });

  it('shows 3 places when the unit would round a real variance to zero', () => {
    expect(formatStockVariance(-0.004, 'L')).toBe('\u22120.004 L');
    expect(formatStockVariance(0.2, 'Nos')).toBe('+0.200 Nos');
    expect(formatStockVariance(0.0004, 'L')).toBe('0.00 L');
  });
});
