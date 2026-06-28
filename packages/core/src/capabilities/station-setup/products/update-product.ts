import {
  BusinessEvents,
  conflictError,
  err,
  eventFromContext,
  forbiddenError,
  notFoundError,
  ok,
} from '../../../kernel/index.js';
import type {
  EventPublisher,
  ExecutionContext,
  Result,
  UseCase,
} from '../../../kernel/index.js';
import type { UpdateProductCommand } from './command.js';
import { validateUpdateProduct } from './validator.js';
import type { Product, ProductRepository } from './ports.js';

export interface UpdateProductDeps {
  repository: ProductRepository;
  events: EventPublisher;
}

/** Update or archive (isActive=false) a catalog product. */
export class UpdateProduct implements UseCase<UpdateProductCommand, Product> {
  constructor(private readonly deps: UpdateProductDeps) {}

  async execute(
    input: UpdateProductCommand,
    ctx: ExecutionContext,
  ): Promise<Result<Product>> {
    const validated = validateUpdateProduct(input);
    if (!validated.success) return validated;
    const cmd = validated.data;

    const existing = await this.deps.repository.findById(cmd.id);
    if (!existing) return err(notFoundError('Product', cmd.id));
    if (existing.organizationId !== ctx.organizationId) {
      return err(forbiddenError('Product belongs to another organization'));
    }

    if (
      cmd.code !== undefined &&
      cmd.code !== existing.code &&
      (await this.deps.repository.existsByCode(ctx.organizationId, cmd.code, existing.id))
    ) {
      return err(conflictError(`A product with code "${cmd.code}" already exists`, { code: cmd.code }));
    }

    const changes: Record<string, unknown> = {};
    const updated: Product = { ...existing };
    for (const key of [
      'name',
      'code',
      'productType',
      'inventoryType',
      'stockTracked',
      'isTaxable',
      'unit',
      'brand',
      'category',
      'taxConfig',
      'isActive',
    ] as const) {
      const value = cmd[key];
      if (value !== undefined) {
        (updated as unknown as Record<string, unknown>)[key] = value;
        changes[key] = value;
      }
    }
    if (cmd.sellingPrice !== undefined) {
      updated.sellingPrice = cmd.sellingPrice === null ? null : String(cmd.sellingPrice);
      changes.sellingPrice = updated.sellingPrice;
    }
    updated.updatedAt = ctx.clock.now().toISOString();

    await this.deps.repository.save(updated);

    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.PRODUCT_UPDATED,
        aggregateType: 'Product',
        aggregateId: updated.id,
        payload: { productId: updated.id, changes },
      }),
    ]);

    return ok(updated);
  }
}
