import { describe, expect, it } from 'vitest';
import { offLabel, varianceBadge, varianceTone } from './variance.js';

describe('varianceTone', () => {
  it('flags a shortage as bad, a surplus as warn, zero as good', () => {
    expect(varianceTone(-210)).toBe('bad');
    expect(varianceTone(1590)).toBe('warn');
    expect(varianceTone(0)).toBe('good');
  });
  it('treats under ₹0.50 as on the nose', () => {
    expect(varianceTone(0.5)).toBe('good');
    expect(varianceTone(-0.5)).toBe('good');
    expect(varianceTone(0.51)).toBe('warn');
    expect(varianceTone(-0.51)).toBe('bad');
  });
});

describe('varianceBadge', () => {
  it('reads Balanced / +₹ / −₹, with the tone', () => {
    expect(varianceBadge(0)).toEqual({ tone: 'good', text: 'Balanced', balanced: true });
    expect(varianceBadge(120)).toEqual({ tone: 'warn', text: '+₹120', balanced: false });
    expect(varianceBadge(-340)).toEqual({ tone: 'bad', text: '−₹340', balanced: false });
  });
  it('uses the office rule: under half a paisa is balanced', () => {
    expect(varianceBadge(0.004).balanced).toBe(true);
    expect(varianceBadge(-0.004).text).toBe('Balanced');
  });
  it('keeps the paise of a variance under ₹1 instead of reading ₹0', () => {
    expect(varianceBadge(0.4).text).toBe('+₹0.40');
    expect(varianceBadge(-0.4).text).toBe('−₹0.40');
    expect(varianceBadge(-0.4).tone).toBe('bad');
  });
});

describe('offLabel', () => {
  it('names the largest, and how many more', () => {
    expect(offLabel([{ name: 'DU3', variance: -340 }])).toBe('DU3 short');
    expect(
      offLabel([
        { name: 'DU1', variance: 20 },
        { name: 'DU3', variance: -340 },
      ]),
    ).toBe('DU3 short +1 more');
    expect(offLabel([{ name: 'DU1', variance: 20 }])).toBe('DU1 over');
  });
});
