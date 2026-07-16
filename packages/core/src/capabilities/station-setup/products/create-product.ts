import {
  BusinessEvents,
  conflictError,
  err,
  eventFromContext,
  ok,
} from '../../../kernel/index.js';
import type {
  DomainEvent,
  EventPublisher,
  ExecutionContext,
  Result,
  UseCase,
} from '../../../kernel/index.js';
import { resolveBusinessDate } from '@pump/shared';
import type { CreateProductCommand } from './command.js';
import { validateCreateProduct } from './validator.js';
import { defaultInventoryType, type Product, type ProductRepository } from './ports.js';
import type { StockMovement, StockMovementRepository } from '../../inventory/index.js';
import { ensureBusinessDayForDate, type BusinessDayRepository } from '../../station-ops/business-days/index.js';

export interface CreateProductDeps {
  repository: ProductRepository;
  events: EventPublisher;
  /** Optional: enables opening-stock seeding for merchandise (ITEM) products. */
  stock?: StockMovementRepository;
  businessDays?: BusinessDayRepository;
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
    const taxCategory = cmd.taxCategory ?? (cmd.productType === 'FUEL' ? 'FUEL_VAT' : 'GST');
    const now = ctx.clock.now().toISOString();
    const product: Product = {
      id: ctx.ids.newId(),
      organizationId: ctx.organizationId,
      name: cmd.name,
      code: cmd.code,
      productType: cmd.productType,
      inventoryType,
      stockTracked: cmd.stockTracked ?? inventoryType !== 'NONE',
      // is_taxable is the legacy "GST applies" flag, now derived from category.
      isTaxable: cmd.isTaxable ?? taxCategory === 'GST',
      taxCategory,
      unit: cmd.unit,
      brand: cmd.brand ?? null,
      category: cmd.category ?? null,
      sellingPrice: cmd.sellingPrice != null ? String(cmd.sellingPrice) : null,
      costBasis: cmd.costBasis != null ? String(cmd.costBasis) : '0',
      taxConfig: cmd.taxConfig ?? (taxCategory === 'FUEL_VAT' ? { vat_rate: 0, hsn_code: '' } : { gst_rate: 18, hsn_code: '', price_inclusive: true }),
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    await this.deps.repository.save(product);

    const events: DomainEvent[] = [
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
    ];

    // Opening stock for merchandise (ITEM only — fuel opening stock is seeded via
    // tanks). Posts a real OpeningBalance movement anchored to the station's
    // business day, so stock-on-hand and inventory valuation are correct from day
    // one. Requires the stock + business-day deps and a station in context.
    const openingStock = cmd.openingStock != null ? Number(cmd.openingStock) : 0;
    const stationId = cmd.stationId ?? ctx.stationId ?? null;
    if (
      openingStock > 0 &&
      inventoryType === 'ITEM' &&
      product.stockTracked &&
      stationId &&
      this.deps.stock &&
      this.deps.businessDays
    ) {
      const date = resolveBusinessDate({ now: ctx.clock.now(), timeZone: ctx.timeZone, dayStartsAt: ctx.businessDayStartsAt });
      const bd = await ensureBusinessDayForDate(this.deps.businessDays, ctx, stationId, date);
      const movement: StockMovement = {
        id: ctx.ids.newId(),
        shiftId: null,
        businessDayId: bd.id,
        productId: product.id,
        tankId: null,
        movementType: 'OpeningBalance',
        quantity: String(openingStock),
        referenceType: 'OPENING',
        referenceId: product.id,
        notes: 'Opening stock',
        createdAt: now,
      };
      await this.deps.stock.save(movement);
      events.push(
        eventFromContext(ctx, {
          eventType: BusinessEvents.INVENTORY_ADJUSTED,
          aggregateType: 'Product',
          aggregateId: product.id,
          stationId,
          businessDayId: bd.id,
          payload: { productId: product.id, openingStock, movementType: 'OpeningBalance' },
        }),
      );
    }

    await this.deps.events.publish(events);

    return ok(product);
  }
}
