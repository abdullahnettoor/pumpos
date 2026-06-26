import type { ProductType, InventoryType } from '@pump/shared';
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
  unit: string;
  taxConfig: ProductTaxConfig;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductRepository extends Repository<Product> {
  existsByCode(organizationId: string, code: string, excludeId?: string): Promise<boolean>;
  listByOrganization(organizationId: string): Promise<Product[]>;
}

/** Default inventory engine for a product type when not explicitly chosen. */
export function defaultInventoryType(productType: ProductType): InventoryType {
  if (productType === 'FUEL') return 'BULK';
  if (productType === 'SERVICE') return 'NONE';
  return 'ITEM';
}
