import {
  BusinessEvents,
  conflictError,
  err,
  eventFromContext,
  forbiddenError,
  notFoundError,
  ok,
} from '../../../kernel/index.js';
import type { EventPublisher, ExecutionContext, Result, UseCase } from '../../../kernel/index.js';
import { canonicalProductCategory } from '@pump/shared';
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

  async execute(input: UpdateProductCommand, ctx: ExecutionContext): Promise<Result<Product>> {
    const validated = validateUpdateProduct(input);
    if (!validated.success) return validated;
    const cmd = validated.data;

    const existing = await this.deps.repository.findById(cmd.id, ctx.organizationId);
    if (!existing) return err(notFoundError('Product', cmd.id));
    if (existing.organizationId !== ctx.organizationId) {
      return err(forbiddenError('Product belongs to another organization'));
    }

    if (
      cmd.code !== undefined &&
      cmd.code !== existing.code &&
      (await this.deps.repository.existsByCode(ctx.organizationId, cmd.code, existing.id))
    ) {
      return err(
        conflictError(`A product with code "${cmd.code}" already exists`, { code: cmd.code }),
      );
    }

    let command: UpdateProductCommand = cmd;
    if (cmd.category !== undefined) {
      const otherCategories = await this.deps.repository.listCategories(
        ctx.organizationId,
        existing.id,
      );
      const category = canonicalProductCategory(cmd.category, otherCategories);
      command = { ...cmd, category };
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
      'taxCategory',
      'unit',
      'brand',
      'category',
      'taxConfig',
      'isActive',
    ] as const) {
      const value = command[key];
      if (value !== undefined) {
        (updated as unknown as Record<string, unknown>)[key] = value;
        changes[key] = value;
      }
    }
    if (command.sellingPrice !== undefined) {
      updated.sellingPrice = command.sellingPrice === null ? null : String(command.sellingPrice);
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
