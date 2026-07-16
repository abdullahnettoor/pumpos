import { z } from 'zod';
import { resolveBusinessDate } from '@pump/shared';
import { BusinessEvents, err, eventFromContext, ok, validationError } from '../../kernel/index.js';
import type { DomainEvent, EventPublisher, ExecutionContext, Result, UseCase } from '../../kernel/index.js';
import { ensureBusinessDayForDate, type BusinessDayRepository } from '../station-ops/business-days/index.js';
import type { StockMovement, StockMovementRepository, StockVariance, StockVarianceRepository } from './ports.js';

export interface RecordStockCountCommand {
  stationId: string;
  productId: string;
  /** Physically measured quantity (tank dip for bulk, count for item). */
  actualQuantity: number | string;
  tankId?: string | null;
  reason?: string;
}

const schema = z.object({
  stationId: z.string().min(1, 'stationId is required'),
  productId: z.string().min(1, 'productId is required'),
  actualQuantity: z.coerce.number().min(0, 'actualQuantity must be >= 0'),
  tankId: z.string().nullish(),
  reason: z.string().max(255).optional(),
});

export interface RecordStockCountDeps {
  movements: StockMovementRepository;
  variances: StockVarianceRepository;
  businessDays: BusinessDayRepository;
  events: EventPublisher;
}

export interface RecordStockCountResult {
  variance: StockVariance;
  expectedQuantity: number;
  actualQuantity: number;
  varianceQuantity: number;
}

/**
 * Record a physical stock count (tank dip for bulk fuel, shelf count for items)
 * and reconcile book stock to it. Computes expected (book) quantity from the
 * movement ledger, writes a stock_variance, and posts a Variance movement to
 * bring book stock to the measured actual.
 */
export class RecordStockCount implements UseCase<RecordStockCountCommand, RecordStockCountResult> {
  constructor(private readonly deps: RecordStockCountDeps) {}

  async execute(input: RecordStockCountCommand, ctx: ExecutionContext): Promise<Result<RecordStockCountResult>> {
    const p = schema.safeParse(input);
    if (!p.success) return err(validationError('Invalid RecordStockCount command', { issues: p.error.flatten() }));
    const cmd = p.data;

    const date = resolveBusinessDate({ now: ctx.clock.now(), timeZone: ctx.timeZone, dayStartsAt: ctx.businessDayStartsAt });
    const bd = await ensureBusinessDayForDate(this.deps.businessDays, ctx, cmd.stationId, date);

    const isBulk = !!cmd.tankId;
    const expected = isBulk
      ? await this.deps.movements.currentQuantityForTank(cmd.tankId as string)
      : await this.deps.movements.currentQuantityForProduct(ctx.organizationId, cmd.productId);
    const actual = cmd.actualQuantity;
    const varianceQuantity = actual - expected;

    const now = ctx.clock.now().toISOString();
    const variance: StockVariance = {
      id: ctx.ids.newId(),
      shiftId: null,
      businessDayId: bd.id,
      productId: cmd.productId,
      tankId: cmd.tankId ?? null,
      expectedQuantity: String(expected),
      actualQuantity: String(actual),
      varianceQuantity: String(varianceQuantity),
      reason: cmd.reason ?? null,
      approvedBy: ctx.actorId ?? null,
      createdAt: now,
    };
    await this.deps.variances.save(variance);

    if (varianceQuantity !== 0) {
      const movement: StockMovement = {
        id: ctx.ids.newId(),
        shiftId: null,
        businessDayId: bd.id,
        productId: cmd.productId,
        tankId: cmd.tankId ?? null,
        movementType: 'Variance',
        quantity: String(varianceQuantity),
        referenceType: 'VARIANCE',
        referenceId: variance.id,
        notes: cmd.reason ?? 'Stock count reconciliation',
        createdAt: now,
      };
      await this.deps.movements.save(movement);
    }

    const events: DomainEvent[] = [
      eventFromContext(ctx, {
        eventType: isBulk ? BusinessEvents.TANK_DIP_RECORDED : BusinessEvents.PHYSICAL_COUNT_COMPLETED,
        aggregateType: isBulk ? 'Tank' : 'Product',
        aggregateId: cmd.tankId ?? cmd.productId,
        stationId: cmd.stationId,
        businessDayId: bd.id,
        payload: { productId: cmd.productId, tankId: cmd.tankId ?? null, expected, actual, variance: varianceQuantity },
      }),
    ];
    if (varianceQuantity !== 0) {
      events.push(
        eventFromContext(ctx, {
          eventType: BusinessEvents.VARIANCE_RECORDED,
          aggregateType: 'StockVariance',
          aggregateId: variance.id,
          stationId: cmd.stationId,
          businessDayId: bd.id,
          payload: { varianceId: variance.id, productId: cmd.productId, tankId: cmd.tankId ?? null, varianceQuantity },
        }),
      );
    }
    await this.deps.events.publish(events);

    return ok({ variance, expectedQuantity: expected, actualQuantity: actual, varianceQuantity });
  }
}
