import { describe, expect, it } from 'vitest';
import { compactRupees, plural, rupees, signedRupees } from './format.js';

describe('rupees', () => {
  it('groups in lakhs and drops paise', () => {
    expect(rupees(218880)).toBe('₹2,18,880');
  });
});

describe('signedRupees', () => {
  it('signs a negative with a true minus and groups digits', () => {
    expect(signedRupees(-210)).toBe('−₹210');
    expect(signedRupees(1590)).toBe('₹1,590');
  });
  it('shows a plus on a positive only when asked', () => {
    expect(signedRupees(1590, { plus: true })).toBe('+₹1,590');
    expect(signedRupees(-1590, { plus: true })).toBe('−₹1,590');
  });
  it('reads an amount that rounds to nothing as plain zero', () => {
    expect(signedRupees(0, { plus: true })).toBe('₹0');
    expect(signedRupees(0.2, { plus: true })).toBe('₹0');
    expect(signedRupees(-0.2)).toBe('₹0');
  });
});

describe('compactRupees', () => {
  it('abbreviates from a lakh, whole rupees below', () => {
    expect(compactRupees(3227000)).toBe('₹32.27L');
    expect(compactRupees(682000)).toBe('₹6.82L');
    expect(compactRupees(25000000)).toBe('₹2.5Cr');
    expect(compactRupees(48200)).toBe('₹48,200');
    expect(compactRupees(850)).toBe('₹850');
    expect(compactRupees(0)).toBe('₹0');
    expect(compactRupees(-340)).toBe('−₹340');
    expect(compactRupees(-250000)).toBe('−₹2.5L');
  });
});

describe('plural', () => {
  it('chooses by count', () => {
    expect(plural(1, 'shift')).toBe('1 shift');
    expect(plural(2, 'shift')).toBe('2 shifts');
  });
});
