import { z } from 'zod';
import { BusinessEvents, err, eventFromContext, invariantViolation, ok, validationError } from '../../kernel/index.js';
import type { EventPublisher, ExecutionContext, Result, UseCase } from '../../kernel/index.js';
import type { BusinessDayRepository } from '../station-ops/business-days/index.js';
import type { StockMovement, StockMovementRepository } from './ports.js';

export interface RecordInventoryAdjustmentCommand {
  stationId: string;
  productId: string;
  /** Signed delta: positive adds stock, negative removes. */
  quantity: number | string;
  tankId?: string | null;
  reason?: string;
}

const schema = z.object({
  stationId: z.string().min(1, 'stationId is required'),
  productId: z.string().min(1, 'productId is required'),
  quantity: z.coerce.number().refine((n) => n !== 0, 'quantity must be non-zero'),
  tankId: z.string().nullish(),
  reason: z.string().max(255).optional(),
});

export interface RecordInventoryAdjustmentDeps {
  movements: StockMovementRepository;
  businessDays: BusinessDayRepository;
  events: EventPublisher;
}

/** Manually adjust stock (correction, write-off, found stock). */
export class RecordInventoryAdjustment implements UseCase<RecordInventoryAdjustmentCommand, StockMovement> {
  constructor(private readonly deps: RecordInventoryAdjustmentDeps) {}

  async execute(input: RecordInventoryAdjustmentCommand, ctx: ExecutionContext): Promise<Result<StockMovement>> {
    const p = schema.safeParse(input);
    if (!p.success) return err(validationError('Invalid RecordInventoryAdjustment command', { issues: p.error.flatten() }));
    const cmd = p.data;

    const bd = await this.deps.businessDays.findOpenByStation(ctx.organizationId, cmd.stationId);
    if (!bd) return err(invariantViolation('No open business day for this station', { stationId: cmd.stationId }));

    const now = ctx.clock.now().toISOString();
    const movement: StockMovement = {
      id: ctx.ids.newId(),
      shiftId: null,
      businessDayId: bd.id,
      productId: cmd.productId,
      tankId: cmd.tankId ?? null,
      movementType: 'Adjustment',
      quantity: String(cmd.quantity),
      referenceType: 'ADJUSTMENT',
      referenceId: null,
      notes: cmd.reason ?? null,
      createdAt: now,
    };
    await this.deps.movements.save(movement);

    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.INVENTORY_ADJUSTED,
        aggregateType: 'StockMovement',
        aggregateId: movement.id,
        stationId: cmd.stationId,
        businessDayId: bd.id,
        payload: { productId: cmd.productId, tankId: movement.tankId, quantity: movement.quantity, reason: movement.notes },
      }),
    ]);

    return ok(movement);
  }
}
