import {
  BusinessEvents,
  conflictError,
  err,
  eventFromContext,
  ok,
} from '../../../kernel/index.js';
import type {
  EventPublisher,
  ExecutionContext,
  Result,
  UseCase,
} from '../../../kernel/index.js';
import type { CreateProductCommand } from './command.js';
import { validateCreateProduct } from './validator.js';
import { defaultInventoryType, type Product, type ProductRepository } from './ports.js';

export interface CreateProductDeps {
  repository: ProductRepository;
  events: EventPublisher;
}

/** Add a product to the unified catalog (fuel or merchandise). */
export class CreateProduct implements UseCase<CreateProductCommand, Product> {
  constructor(private readonly deps: CreateProductDeps) {}

  async execute(
    input: CreateProductCommand,
    ctx: ExecutionContext,
  ): Promise<Result<Product>> {
    const validated = validateCreateProduct(input);
    if (!validated.success) return validated;
    const cmd = validated.data;

    if (await this.deps.repository.existsByCode(ctx.organizationId, cmd.code)) {
      return err(conflictError(`A product with code "${cmd.code}" already exists`, { code: cmd.code }));
    }

    const inventoryType = cmd.inventoryType ?? defaultInventoryType(cmd.productType);
    const now = ctx.clock.now().toISOString();
    const product: Product = {
      id: ctx.ids.newId(),
      organizationId: ctx.organizationId,
      name: cmd.name,
      code: cmd.code,
      productType: cmd.productType,
      inventoryType,
      stockTracked: cmd.stockTracked ?? inventoryType !== 'NONE',
      isTaxable: cmd.isTaxable ?? cmd.productType !== 'FUEL',
      unit: cmd.unit,
      taxConfig: cmd.taxConfig ?? { gst_rate: 18, hsn_code: '' },
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    await this.deps.repository.save(product);

    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.PRODUCT_CREATED,
        aggregateType: 'Product',
        aggregateId: product.id,
        payload: {
          productId: product.id,
          code: product.code,
          productType: product.productType,
          inventoryType: product.inventoryType,
        },
      }),
    ]);

    return ok(product);
  }
}
