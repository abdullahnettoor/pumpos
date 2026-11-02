import { describe, expect, it } from 'vite-plus/test';
import {
  canonicalProductCategory,
  categoryKey,
  distinctCategories,
  sameCategory,
} from './category-spelling.js';

describe('categoryKey', () => {
  it('returns null for empty, whitespace, null, undefined, or non-string', () => {
    expect(categoryKey(null)).toBeNull();
    expect(categoryKey(undefined)).toBeNull();
    expect(categoryKey('')).toBeNull();
    expect(categoryKey('   \t\n  ')).toBeNull();
    expect(categoryKey(123)).toBeNull();
  });

  it('trims, converts to NFC, and lowercases', () => {
    expect(categoryKey('  Engine Oil  ')).toBe('engine oil');
    expect(categoryKey('ENGINE OIL')).toBe('engine oil');
    // Composed vs Decomposed Unicode: Café
    expect(categoryKey('Caf\u00e9')).toBe('caf\u00e9');
    expect(categoryKey('Cafe\u0301')).toBe('caf\u00e9');
  });
});

describe('sameCategory', () => {
  it('matches regardless of leading/trailing whitespace and case', () => {
    expect(sameCategory(' Engine Oil ', 'Engine Oil')).toBe(true);
    expect(sameCategory('engine oil', 'ENGINE OIL')).toBe(true);
    expect(sameCategory('Engine Oil', 'Coolant')).toBe(false);
  });

  it('matches composed and decomposed Unicode variants', () => {
    expect(sameCategory('Caf\u00e9', 'Cafe\u0301')).toBe(true);
    expect(sameCategory('  Caf\u00e9  ', 'Cafe\u0301')).toBe(true);
  });

  it('matches distinctCategories option with stored whitespace category', () => {
    const products = [{ category: ' Engine Oil ' }];
    const options = distinctCategories(products);
    expect(options).toEqual(['Engine Oil']);
    expect(sameCategory(products[0].category, options[0])).toBe(true);
  });
});

describe('canonicalProductCategory', () => {
  it('returns null for empty, whitespace, null, undefined, or non-string', () => {
    expect(canonicalProductCategory(null, ['Engine Oil'])).toBeNull();
    expect(canonicalProductCategory(undefined, ['Engine Oil'])).toBeNull();
    expect(canonicalProductCategory('', ['Engine Oil'])).toBeNull();
    expect(canonicalProductCategory('   ', ['Engine Oil'])).toBeNull();
    expect(canonicalProductCategory(123, ['Engine Oil'])).toBeNull();
  });

  it('stores a new category trimmed, as typed', () => {
    expect(canonicalProductCategory('Coolant', ['Engine Oil'])).toBe('Coolant');
    expect(canonicalProductCategory('  Synthetic 5W-30  ', ['Engine Oil'])).toBe('Synthetic 5W-30');
  });

  it('reuses existing spelling when matching case-insensitively', () => {
    const existing = ['Engine Oil', 'Coolant'];
    expect(canonicalProductCategory('engine oil', existing)).toBe('Engine Oil');
    expect(canonicalProductCategory('ENGINE OIL', existing)).toBe('Engine Oil');
    expect(canonicalProductCategory('  engine oil  ', existing)).toBe('Engine Oil');
    expect(canonicalProductCategory('coolant', existing)).toBe('Coolant');
    expect(canonicalProductCategory('COOLANT', existing)).toBe('Coolant');
  });

  it('deterministically picks first sorted existing spelling if multiple legacy spellings exist', () => {
    const existing = ['engine oil', 'Engine Oil'];
    expect(canonicalProductCategory('ENGINE OIL', existing)).toBe('Engine Oil');
  });

  it('matches composed and decomposed Unicode variants against existing', () => {
    const existing = ['Caf\u00e9'];
    expect(canonicalProductCategory('Cafe\u0301', existing)).toBe('Caf\u00e9');
  });
});

describe('distinctCategories', () => {
  it('returns empty array when given no products or products without categories', () => {
    expect(distinctCategories([])).toEqual([]);
    expect(
      distinctCategories([{ category: null }, { category: undefined }, { category: '  ' }]),
    ).toEqual([]);
  });

  it('dedupes case-insensitively keeping the first spelling and sorts by localeCompare', () => {
    const products = [
      { category: 'Grease' },
      { category: 'engine oil' },
      { category: 'Engine Oil' },
      { category: 'Coolant' },
      { category: 'coolant' },
    ];
    expect(distinctCategories(products)).toEqual(['Coolant', 'engine oil', 'Grease']);
  });

  it('dedupes Unicode composed and decomposed variants', () => {
    const products = [{ category: 'Caf\u00e9' }, { category: 'Cafe\u0301' }];
    expect(distinctCategories(products)).toEqual(['Caf\u00e9']);
  });
});
