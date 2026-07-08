import type { ProductType, InventoryType, TaxCategory } from '@pump/shared';

export interface ProductTaxConfig {
  gst_rate?: number;
  vat_rate?: number;
  hsn_code?: string;
  cess?: number;
  /** Selling price is tax-inclusive (retail MRP); tax is extracted, not added. */
  price_inclusive?: boolean;
}

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
