import { describe, expect, it } from 'vite-plus/test';
import { DEFAULT_EXPENSE_HEADS, DEFAULT_INCOME_HEADS, headNatureOf } from './head-nature.js';

describe('default heads', () => {
  it('classify only Generator Diesel and Commission as Direct', () => {
    const direct = [...DEFAULT_EXPENSE_HEADS, ...DEFAULT_INCOME_HEADS]
      .filter((h) => h.nature === 'DIRECT')
      .map((h) => h.name);
    expect(direct).toEqual(['Generator Diesel', 'Commission']);
  });
});

describe('headNatureOf', () => {
  it('reads Direct and treats anything else as Indirect', () => {
    expect(headNatureOf('DIRECT')).toBe('DIRECT');
    expect(headNatureOf('INDIRECT')).toBe('INDIRECT');
    expect(headNatureOf(undefined)).toBe('INDIRECT');
    expect(headNatureOf(null)).toBe('INDIRECT');
    expect(headNatureOf('direct')).toBe('INDIRECT');
  });
});
