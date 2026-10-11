import type { ProductType } from '../types/core.js';

/**
 * The product category a non-fuel sale is grouped under is the product's own
 * `productType` (no second field). This is the one wording for it, so the
 * mobile Sales by product block and any future reader name categories alike.
 */
export const PRODUCT_CATEGORY_LABEL: Record<ProductType, string> = {
  FUEL: 'Fuel',
  LUBRICANT: 'Lubricants',
  ADDITIVE: 'Additives',
  ACCESSORY: 'Accessories',
  CONSUMABLE: 'Consumables',
  SPARE_PART: 'Spare parts',
  SERVICE: 'Service',
  OTHER: 'Other',
};

/**
 * The category of a sale line: its `productType` when it is a known one, an
 * unrecognised value as OTHER (never dropped), and null when the line carries
 * none at all (a snapshot frozen before categories existed).
 */
export function productCategoryOf(productType: unknown): ProductType | null {
  if (typeof productType !== 'string' || productType.trim() === '') return null;
  const t = productType.trim().toUpperCase();
  return t in PRODUCT_CATEGORY_LABEL ? (t as ProductType) : 'OTHER';
}
