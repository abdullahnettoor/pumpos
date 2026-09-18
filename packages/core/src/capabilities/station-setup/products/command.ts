import type { ProductType, InventoryType, TaxCategory, ProductTaxConfig } from '@pump/shared';

// Re-exported for existing call sites; the canonical shape lives in @pump/shared
// so the product entity, onboarding draft, and these commands share one type.
export type { ProductTaxConfig };

export interface CreateProductCommand {
  name: string;
  code: string;
  productType: ProductType;
  inventoryType?: InventoryType;
  stockTracked?: boolean;
  isTaxable?: boolean;
  taxCategory?: TaxCategory;
  unit: string;
  brand?: string | null;
  category?: string | null;
  sellingPrice?: string | number | null;
  /** Opening weighted-average cost per unit (seeds cost_basis at onboarding). */
  costBasis?: string | number | null;
  /** Opening stock quantity for merchandise (ITEM); posts an OpeningBalance movement. */
  openingStock?: string | number | null;
  /** Station to anchor the opening-stock movement's business day. */
  stationId?: string | null;
  taxConfig?: ProductTaxConfig;
}

export interface UpdateProductCommand {
  id: string;
  name?: string;
  code?: string;
  productType?: ProductType;
  inventoryType?: InventoryType;
  stockTracked?: boolean;
  isTaxable?: boolean;
  taxCategory?: TaxCategory;
  unit?: string;
  brand?: string | null;
  category?: string | null;
  sellingPrice?: string | number | null;
  taxConfig?: ProductTaxConfig;
  isActive?: boolean;
}
