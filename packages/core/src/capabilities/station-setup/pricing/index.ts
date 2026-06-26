import { z } from 'zod';
import { BusinessEvents, err, eventFromContext, ok, validationError } from '../../../kernel/index.js';
import type { EventPublisher, ExecutionContext, Result, UseCase } from '../../../kernel/index.js';

export interface FuelPrice {
  id: string;
  organizationId: string;
  stationId: string;
  productId: string;
  price: string;
  effectiveFrom: string;
  createdAt: string;
}

export interface FuelPriceRepository {
  save(price: FuelPrice): Promise<void>;
  listByStation(organizationId: string, stationId: string): Promise<FuelPrice[]>;
}

export interface RecordFuelPriceCommand {
  stationId: string;
  productId: string;
  price: number | string;
  effectiveFrom?: string | null;
}

const schema = z.object({
  stationId: z.string().min(1, 'stationId is required'),
  productId: z.string().min(1, 'productId is required'),
  price: z.coerce.number().nonnegative('price must be >= 0'),
  effectiveFrom: z.string().nullish(),
});

export interface FuelPriceDeps {
  repository: FuelPriceRepository;
  events: EventPublisher;
}

/** Record a new fuel price (append-only price history). */
export class RecordFuelPrice implements UseCase<RecordFuelPriceCommand, FuelPrice> {
  constructor(private readonly deps: FuelPriceDeps) {}
  async execute(input: RecordFuelPriceCommand, ctx: ExecutionContext): Promise<Result<FuelPrice>> {
    const p = schema.safeParse(input);
    if (!p.success) return err(validationError('Invalid RecordFuelPrice command', { issues: p.error.flatten() }));
    const now = ctx.clock.now().toISOString();
    const price: FuelPrice = {
      id: ctx.ids.newId(),
      organizationId: ctx.organizationId,
      stationId: p.data.stationId,
      productId: p.data.productId,
      price: String(p.data.price),
      effectiveFrom: p.data.effectiveFrom ?? now,
      createdAt: now,
    };
    await this.deps.repository.save(price);
    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.PRICE_CHANGED,
        aggregateType: 'FuelPrice',
        aggregateId: price.id,
        stationId: price.stationId,
        payload: { productId: price.productId, price: price.price, effectiveFrom: price.effectiveFrom },
      }),
    ]);
    return ok(price);
  }
}
