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
  taxConfig?: ProductTaxConfig;
  isActive?: boolean;
}
