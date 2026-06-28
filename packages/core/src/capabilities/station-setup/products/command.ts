import type { ProductType, InventoryType } from '@pump/shared';

export interface ProductTaxConfig {
  gst_rate?: number;
  hsn_code?: string;
}

export interface CreateProductCommand {
  name: string;
  code: string;
  productType: ProductType;
  inventoryType?: InventoryType;
  stockTracked?: boolean;
  isTaxable?: boolean;
  unit: string;
  brand?: string | null;
  category?: string | null;
  sellingPrice?: string | number | null;
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
  unit?: string;
  brand?: string | null;
  category?: string | null;
  sellingPrice?: string | number | null;
  taxConfig?: ProductTaxConfig;
  isActive?: boolean;
}
