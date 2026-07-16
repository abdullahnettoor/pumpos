import { BusinessEvents } from '../../../kernel/index.js';
import type { DomainEvent } from '../../../kernel/index.js';

export interface ProductCreatedPayload {
  productId: string;
  code: string;
  productType: string;
  inventoryType: string;
}

export type ProductCreated = DomainEvent<
  typeof BusinessEvents.PRODUCT_CREATED,
  ProductCreatedPayload
>;

export interface ProductUpdatedPayload {
  productId: string;
  changes: Record<string, unknown>;
}

export type ProductUpdated = DomainEvent<
  typeof BusinessEvents.PRODUCT_UPDATED,
  ProductUpdatedPayload
>;
