import { z } from 'zod';
import { isBalancedQuantity, resolveBusinessDate } from '@pump/shared';
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
import type { TankDipMeasurement } from './decantation/measurement.js';
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
  /** #468: resolves pending Decantation tank lines from a tank dip. */
  decantationMeasurement?: TankDipMeasurement;
}

export interface RecordStockCountResult {
  variance: StockVariance;
  expectedQuantity: number;
  actualQuantity: number;
  varianceQuantity: number;
  /** True when a shift was open at the station: measurement + variance were
   * recorded but book stock was NOT reconciled (in-flight sales un-booked). */
  openShiftAtRecording: boolean;
  /** Advisory only; never blocks the dip. */
  warnings: StockCountWarning[];
}

export interface StockCountWarning {
  code: 'DECANTATION_PENDING_OPEN_SHIFT';
  message: string;
  documentNumbers: string[];
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

    let attributedDay = null;
    if (cmd.shiftId) {
      const eligibility = await resolveShiftBusinessDayWrite(
        this.deps.shifts,
        this.deps.businessDays,
        ctx,
        cmd.shiftId,
        'STOCK',
      );
      if (!eligibility.success) return eligibility;
      const attributedShift = eligibility.data.shift;
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
    if (!eligibility.success) return eligibility;
    const bd = eligibility.data.businessDay;

    const isBulk = !!cmd.tankId;
    const varianceId = ctx.ids.newId();
    const nowIso = ctx.clock.now().toISOString();

    // Pending Decantation lines of this tank are measured from this dip BEFORE
    // the expected quantity is read, so the received litres are in book stock
    // and the dip never double counts them (D4). With a shift open the dip is
    // not reconciled either, so the lines stay pending.
    let decantationLinesMeasured = 0;
    if (tank && !openShiftAtRecording && this.deps.decantationMeasurement) {
      const measured = await this.deps.decantationMeasurement.measureFromTankDip(ctx, {
        stationId: cmd.stationId,
        tankId: tank.id,
        dip: cmd.actualQuantity,
        dipAt: nowIso,
        refId: varianceId,
        anchor: { businessDayId: bd.id, businessDate: bd.businessDate },
      });
      if (!measured.success) return measured;
      decantationLinesMeasured = measured.data.measuredLines;
    }

    const warnings: StockCountWarning[] = [];
    if (tank && openShiftAtRecording && this.deps.decantationMeasurement) {
      const documentNumbers = await this.deps.decantationMeasurement.pendingDocumentNumbers(ctx, {
        stationId: cmd.stationId,
        tankId: tank.id,
      });
      if (documentNumbers.length > 0)
        warnings.push({
          code: 'DECANTATION_PENDING_OPEN_SHIFT',
          message: `Decantation ${documentNumbers.join(', ')} stays pending: a Shift is open, so this dip does not measure it. Dip again after the Shift closes.`,
          documentNumbers,
        });
    }

    const expected = isBulk
      ? await this.deps.movements.currentQuantityForTank(cmd.tankId as string)
      : await this.deps.movements.currentQuantityForProduct(ctx.organizationId, productId);
    const actual = cmd.actualQuantity;
    // One balanced rule for quantities (#556): a variance under half the
    // recorded step (3 decimals) is float noise. It is stored as 0 and posts no
    // Variance movement, so the stock_variance row and the ledger agree.
    const rawVariance = actual - expected;
    const balanced = isBalancedQuantity(rawVariance);
    const varianceQuantity = balanced ? 0 : rawVariance;

    const now = ctx.clock.now().toISOString();
    const variance: StockVariance = {
      id: varianceId,
      organizationId: ctx.organizationId,
      stationId: cmd.stationId,
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

    if (!balanced && !openShiftAtRecording) {
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
          decantationLinesMeasured,
        },
      }),
    ];
    if (!balanced) {
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
      warnings,
    });
  }
}
