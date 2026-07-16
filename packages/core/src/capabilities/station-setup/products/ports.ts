import type { ProductType, InventoryType, TaxCategory } from '@pump/shared';
import type { Repository } from '../../../kernel/index.js';
import type { ProductTaxConfig } from './command.js';

export interface Product {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  productType: ProductType;
  inventoryType: InventoryType;
  stockTracked: boolean;
  isTaxable: boolean;
  taxCategory: TaxCategory;
  unit: string;
  brand: string | null;
  category: string | null;
  sellingPrice: string | null;
  /** Rolling weighted-average landed cost per unit; drives COGS / margin. */
  costBasis: string | null;
  taxConfig: ProductTaxConfig;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductRepository extends Repository<Product> {
  existsByCode(organizationId: string, code: string, excludeId?: string): Promise<boolean>;
  listByOrganization(organizationId: string): Promise<Product[]>;
  /** Set the rolling weighted-average cost basis for a product (FB1). */
  updateCostBasis(productId: string, costBasis: string): Promise<void>;
}

/** Default inventory engine for a product type when not explicitly chosen. */
export function defaultInventoryType(productType: ProductType): InventoryType {
  if (productType === 'FUEL') return 'BULK';
  if (productType === 'SERVICE') return 'NONE';
  return 'ITEM';
}
