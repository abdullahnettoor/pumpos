import { describe, expect, it } from 'vite-plus/test';
import { canonicalProductCategory, distinctCategories } from './category-spelling.js';

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
});

describe('distinctCategories', () => {
  it('returns empty array when given no products or products without categories', () => {
    expect(distinctCategories([])).toEqual([]);
    expect(distinctCategories([{ category: null }, { category: undefined }, { category: '  ' }])).toEqual([]);
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
});
