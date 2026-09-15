import { z } from 'zod';
import { resolveBusinessDate } from '@pump/shared';
import {
  BusinessEvents,
  err,
  eventFromContext,
  notFoundError,
  ok,
  relatedEventFromContext,
  validationError,
} from '../../kernel/index.js';
import type {
  DomainEvent,
  EventPublisher,
  ExecutionContext,
  Result,
  UseCase,
} from '../../kernel/index.js';
import {
  resolveBusinessDayWrite,
  type BusinessDayWriteRepository,
} from '../station-ops/business-days/index.js';
import { resolveShiftBusinessDayWrite, type ShiftRepository } from '../station-ops/shifts/index.js';
import type { TankRepository } from '../station-setup/tanks/index.js';
import type {
  StockMovement,
  StockMovementRepository,
  StockVariance,
  StockVarianceRepository,
} from './ports.js';

export interface RecordStockCountCommand {
  stationId: string;
  productId?: string;
  /** Physically measured quantity (tank dip for bulk, count for item). */
  actualQuantity: number | string;
  tankId?: string | null;
  shiftId?: string | null;
  reason?: string;
}

const schema = z
  .object({
    stationId: z.string().min(1, 'stationId is required'),
    productId: z.string().min(1).optional(),
    actualQuantity: z.coerce.number().min(0, 'actualQuantity must be >= 0'),
    tankId: z.string().nullish(),
    shiftId: z.string().nullish(),
    reason: z.string().max(255).optional(),
  })
  .superRefine((value, refinement) => {
    if (!value.tankId && !value.productId) {
      refinement.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'tankId or productId is required',
      });
    }
    if (value.tankId && value.productId) {
      refinement.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'productId must not be supplied for a Tank Dip',
        path: ['productId'],
      });
    }
  });

export interface RecordStockCountDeps {
  movements: StockMovementRepository;
  variances: StockVarianceRepository;
  tanks: TankRepository;
  shifts: ShiftRepository;
  businessDays: BusinessDayWriteRepository;
  events: EventPublisher;
}

export interface RecordStockCountResult {
  variance: StockVariance;
  expectedQuantity: number;
  actualQuantity: number;
  varianceQuantity: number;
  /** True when a shift was open at the station: measurement + variance were
   * recorded but book stock was NOT reconciled (in-flight sales un-booked). */
  openShiftAtRecording: boolean;
}

/**
 * Record a physical stock count (tank dip for bulk fuel, shelf count for items)
 * and reconcile book stock to it. Computes expected (book) quantity from the
 * movement ledger, writes a stock_variance, and posts a Variance movement to
 * bring book stock to the measured actual.
 */
export class RecordStockCount implements UseCase<RecordStockCountCommand, RecordStockCountResult> {
  constructor(private readonly deps: RecordStockCountDeps) {}

  async execute(
    input: RecordStockCountCommand,
    ctx: ExecutionContext,
  ): Promise<Result<RecordStockCountResult>> {
    const p = schema.safeParse(input);
    if (!p.success)
      return err(
        validationError('Invalid RecordStockCount command', { issues: p.error.flatten() }),
      );
    const cmd = p.data;
    if (ctx.stationId && ctx.stationId !== cmd.stationId)
      return err(notFoundError('Station', cmd.stationId));

    const tank = cmd.tankId ? await this.deps.tanks.findByIdForUpdate(cmd.tankId) : null;
    if (
      cmd.tankId &&
      (!tank ||
        tank.organizationId !== ctx.organizationId ||
        tank.stationId !== cmd.stationId ||
        tank.status !== 'ACTIVE')
    ) {
      return err(notFoundError('Tank', cmd.tankId));
    }
    const productId = tank?.productId ?? cmd.productId!;

    let attributedShift = null;
    let attributedDay = null;
    if (cmd.shiftId) {
      const eligibility = await resolveShiftBusinessDayWrite(
        this.deps.shifts,
        this.deps.businessDays,
        ctx,
        cmd.shiftId,
        'STOCK',
      );
      if (!eligibility.success) return eligibility as unknown as Result<RecordStockCountResult>;
      attributedShift = eligibility.data.shift;
      attributedDay = eligibility.data.businessDay;
      // Attribution to any tenant/station-valid shift is allowed, open or
      // closed — a dip may be measured while the shift it belongs to runs.
      if (
        !attributedShift ||
        attributedShift.organizationId !== ctx.organizationId ||
        attributedShift.stationId !== cmd.stationId
      ) {
        return err(notFoundError('Shift', cmd.shiftId));
      }
    }
    // A dip may be recorded at any point in the business day. While a shift is
    // OPEN, dispensed fuel is not yet booked (nozzle sales land at close), so
    // the measurement + variance are recorded but book stock is NOT reconciled
    // — reconciling to a mid-shift reading would double-count once the shift's
    // sales post. The record and events carry the flag so consumers can warn.
    const openShiftAtRecording =
      !!cmd.tankId &&
      !!(await this.deps.shifts.findOpenByStation(ctx.organizationId, cmd.stationId));

    const date = resolveBusinessDate({
      now: ctx.clock.now(),
      timeZone: ctx.timeZone,
      dayStartsAt: ctx.businessDayStartsAt,
    });
    const eligibility = attributedDay
      ? ok({ businessDay: attributedDay, lateEntry: false })
      : await resolveBusinessDayWrite(this.deps.businessDays, ctx, {
          stationId: cmd.stationId,
          businessDate: date,
          kind: 'STOCK',
        });
    if (!eligibility.success) return eligibility as unknown as Result<RecordStockCountResult>;
    const bd = eligibility.data.businessDay;

    const isBulk = !!cmd.tankId;
    const expected = isBulk
      ? await this.deps.movements.currentQuantityForTank(cmd.tankId as string)
      : await this.deps.movements.currentQuantityForProduct(ctx.organizationId, productId);
    const actual = cmd.actualQuantity;
    const varianceQuantity = actual - expected;

    const now = ctx.clock.now().toISOString();
    const variance: StockVariance = {
      id: ctx.ids.newId(),
      shiftId: cmd.shiftId ?? null,
      businessDayId: bd.id,
      productId,
      tankId: cmd.tankId ?? null,
      expectedQuantity: String(expected),
      actualQuantity: String(actual),
      varianceQuantity: String(varianceQuantity),
      reason: cmd.reason ?? null,
      approvedBy: ctx.actorId ?? null,
      metadata: openShiftAtRecording ? { openShiftAtRecording: true } : {},
      createdAt: now,
    };
    await this.deps.variances.save(variance);

    if (varianceQuantity !== 0 && !openShiftAtRecording) {
      const movement: StockMovement = {
        id: ctx.ids.newId(),
        shiftId: cmd.shiftId ?? null,
        businessDayId: bd.id,
        productId,
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
        eventType: isBulk
          ? BusinessEvents.TANK_DIP_RECORDED
          : BusinessEvents.PHYSICAL_COUNT_COMPLETED,
        aggregateType: isBulk ? 'Tank' : 'Product',
        aggregateId: cmd.tankId ?? productId,
        stationId: cmd.stationId,
        businessDayId: bd.id,
        payload: {
          productId,
          tankId: cmd.tankId ?? null,
          shiftId: cmd.shiftId ?? null,
          expected,
          actual,
          variance: varianceQuantity,
          openShiftAtRecording,
        },
      }),
    ];
    if (varianceQuantity !== 0) {
      events.push(
        relatedEventFromContext(ctx, {
          eventType: BusinessEvents.VARIANCE_RECORDED,
          aggregateType: 'StockVariance',
          aggregateId: variance.id,
          stationId: cmd.stationId,
          businessDayId: bd.id,
          payload: {
            varianceId: variance.id,
            productId,
            tankId: cmd.tankId ?? null,
            shiftId: cmd.shiftId ?? null,
            varianceQuantity,
            openShiftAtRecording,
          },
        }),
      );
    }
    await this.deps.events.publish(events);

    return ok({
      variance,
      expectedQuantity: expected,
      actualQuantity: actual,
      varianceQuantity,
      openShiftAtRecording,
    });
  }
}
