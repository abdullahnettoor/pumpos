import { describe, expect, it } from 'vitest';
import { PRODUCT_CATEGORY_LABEL, productCategoryOf } from './product-category.js';

describe('productCategoryOf', () => {
  it('returns a known product type as is', () => {
    expect(productCategoryOf('LUBRICANT')).toBe('LUBRICANT');
    expect(productCategoryOf('spare_part')).toBe('SPARE_PART');
  });

  it('files an unrecognised type under OTHER rather than dropping it', () => {
    expect(productCategoryOf('MERCHANDISE')).toBe('OTHER');
  });

  it('is null when the line carries no type (a snapshot frozen before categories)', () => {
    expect(productCategoryOf(undefined)).toBeNull();
    expect(productCategoryOf(null)).toBeNull();
    expect(productCategoryOf('  ')).toBeNull();
  });

  it('names every category', () => {
    expect(PRODUCT_CATEGORY_LABEL.SPARE_PART).toBe('Spare parts');
    expect(PRODUCT_CATEGORY_LABEL.ACCESSORY).toBe('Accessories');
  });
});
