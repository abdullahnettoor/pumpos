import { z } from 'zod';
import {
  BusinessEvents,
  err,
  eventFromContext,
  invariantViolation,
  notFoundError,
  ok,
  validationError,
} from '../../../kernel/index.js';
import type { EventPublisher, ExecutionContext, Result, UseCase } from '../../../kernel/index.js';
import type {
  CloseShiftContextReader,
  NozzleReadingRepository,
  Shift,
  ShiftReconciliationTotals,
  ShiftRepository,
  ShiftSummaryProjector,
  ShiftSummaryWriter,
  StockMovementInput,
  StockMovementWriter,
} from './ports.js';
import { CASH_VARIANCE_MODEL_TWO_LEVEL, computeShiftCloseCash, drawerKey } from '@pump/shared';
import type { CloseCashDrop } from '@pump/shared';

/**
 * The office's expected cash at shift close (#287, ADR 0005). It is built from
 * the cash each Drawer **declared** at Handover (Σ Opening Floats + received
 * cash sales − Handover drops), less any drop at close that names no Drawer.
 * Attendant shortages are judged separately at Handover (attendant variance),
 * so this measures office counting only. One formula for close and live status.
 */
export function expectedShiftDrawerCash(
  totals: Pick<ShiftReconciliationTotals, 'openingFloat' | 'cashSales' | 'handoverCashDrops'>,
  unassignedCloseCashDrops = 0,
): number {
  return (
    totals.openingFloat + totals.cashSales - totals.handoverCashDrops - unassignedCloseCashDrops
  );
}

export { computeShiftCloseCash } from '@pump/shared';
export type { CloseCashDrop, ShiftCloseCash } from '@pump/shared';

export interface CloseShiftCommand {
  shiftId: string;
  closingCash: number | string;
  nozzleReadings?: { nozzleId: string; closingReading: number }[];
  /** @deprecated drop at close naming no Drawer; use closeCashDrops. */
  cashDrops?: number | string;
  closeCashDrops?: CloseCashDrop[];
  notes?: string;
}

const schema = z
  .object({
    shiftId: z.string().min(1, 'shiftId is required'),
    closingCash: z.coerce.number().min(0, 'closingCash must be >= 0'),
    nozzleReadings: z
      .array(z.object({ nozzleId: z.string().min(1), closingReading: z.coerce.number().min(0) }))
      .optional(),
    cashDrops: z.coerce.number().min(0).optional(),
    closeCashDrops: z
      .array(
        z
          .object({
            attendantId: z.string().min(1).nullish(),
            duId: z.string().min(1).nullish(),
            amount: z.coerce.number().positive(),
          })
          .refine((d) => !d.attendantId === !d.duId, {
            message: 'A drop names a Drawer with both attendantId and duId, or neither',
          }),
      )
      .max(50)
      .optional(),
    notes: z.string().max(500).optional(),
  })
  .strict();

export interface CloseShiftDeps {
  /** One consolidated read for shift + readings + nozzles + totals + credit sales (#229). */
  context: CloseShiftContextReader;
  shifts: ShiftRepository;
  nozzleReadings: NozzleReadingRepository;
  stockMovements: StockMovementWriter;
  summaries: ShiftSummaryWriter;
  /**
   * Optional presentation projector: when provided, the persisted summary is the
   * FULL projected snapshot, written ONCE — instead of the caller re-projecting
   * and re-saving after the fact (two extra statements on the close path, #229).
   */
  projector?: ShiftSummaryProjector;
  events: EventPublisher;
}

export interface CloseShiftResult {
  shift: Shift;
  snapshot: Record<string, unknown>;
  /** Drawer cash sales from the reconciliation — typed for downstream ledger
   *  posting, so callers need not dig through the (projected) snapshot. */
  cashSales: number;
}

/**
 * Close an open shift: finalize nozzle readings (volume = closing - opening),
 * record fuel SALE stock movements, run the two-level cash reconciliation
 * (attendant variance at Handover + office count variance, #287; office money
 * never enters a Drawer, ADR 0005), persist an immutable shift summary,
 * and mark the shift CLOSED. Every Drawer must be handed over first.
 * Run inside runInTransaction.
 */
export class CloseShift implements UseCase<CloseShiftCommand, CloseShiftResult> {
  constructor(private readonly deps: CloseShiftDeps) {}

  async execute(
    input: CloseShiftCommand,
    ctx: ExecutionContext,
  ): Promise<Result<CloseShiftResult>> {
    const p = schema.safeParse(input);
    if (!p.success)
      return err(validationError('Invalid CloseShift command', { issues: p.error.flatten() }));
    const cmd = p.data;

    const context = await this.deps.context.load(ctx.organizationId, cmd.shiftId);
    const shift = context.shift;
    if (!shift || shift.organizationId !== ctx.organizationId)
      return err(notFoundError('Shift', cmd.shiftId));
    if (shift.status !== 'OPEN')
      return err(
        invariantViolation('Shift is not open', { shiftId: shift.id, status: shift.status }),
      );

    const pending = context.totals.drawers.filter((d) => d.cashHandedOver === null);
    if (pending.length > 0)
      return err(
        invariantViolation('Every drawer must be handed over before closing the shift', {
          shiftId: shift.id,
          pendingDrawers: pending.map((d) => ({ attendantId: d.attendantId, duId: d.duId })),
        }),
      );
    const unknownDrop = (cmd.closeCashDrops ?? []).find(
      (d) =>
        drawerKey(d) !== '' && !context.totals.drawers.some((dr) => drawerKey(dr) === drawerKey(d)),
    );
    if (unknownDrop)
      return err(
        validationError('Cash drop names a drawer not on this shift', { drop: unknownDrop }),
      );

    const dbReadings = context.readings;
    const closingByNozzle = new Map(
      (cmd.nozzleReadings ?? []).map((r) => [r.nozzleId, r.closingReading]),
    );

    // Apply any provided closing readings — batched into ONE statement (#229).
    const closingUpdates: { id: string; closingReading: string; volumeSold: string }[] = [];
    for (const reading of dbReadings) {
      const provided = closingByNozzle.get(reading.nozzleId);
      if (provided === undefined) continue;
      const opening = Number(reading.openingReading);
      if (provided < opening) {
        return err(
          validationError(`Closing reading (${provided}) is below opening (${opening})`, {
            nozzleId: reading.nozzleId,
          }),
        );
      }
      const volume = provided - opening;
      closingUpdates.push({
        id: reading.id,
        closingReading: String(provided),
        volumeSold: String(volume),
      });
      reading.closingReading = String(provided);
      reading.volumeSold = String(volume);
    }
    if (closingUpdates.length > 0) {
      await this.deps.nozzleReadings.updateClosingMany(closingUpdates);
    }

    const nozzleMap = new Map(context.nozzles.map((n) => [n.id, n]));

    // Enriched readings + fuel sale stock movements.
    const enriched: Record<string, unknown>[] = [];
    const movements: StockMovementInput[] = [];
    let totalVolume = 0;
    let totalTesting = 0;
    let totalNetVolume = 0;
    let totalFuelSalesValue = 0;
    for (const reading of dbReadings) {
      const grossVolume = Number(reading.volumeSold);
      // Testing/calibration fuel is dispensed then returned to the tank: it is
      // neither a sale nor a stock loss, so net it out of sales value and stock.
      const testing = Math.min(Math.max(Number(reading.testingVolume ?? 0), 0), grossVolume);
      const netVolume = grossVolume - testing;
      const unitPrice = Number(reading.unitPrice ?? 0);
      const salesValue = netVolume * unitPrice;
      totalVolume += grossVolume;
      totalTesting += testing;
      totalNetVolume += netVolume;
      totalFuelSalesValue += salesValue;
      const nz = nozzleMap.get(reading.nozzleId);
      enriched.push({
        nozzleId: reading.nozzleId,
        productId: nz?.productId ?? null,
        openingReading: Number(reading.openingReading),
        closingReading: Number(reading.closingReading),
        volumeSold: grossVolume,
        grossVolume,
        testingVolume: testing,
        netVolume,
        unitPrice,
        salesValue,
      });
      if (netVolume > 0 && nz) {
        movements.push({
          shiftId: shift.id,
          businessDayId: shift.businessDayId,
          productId: nz.productId,
          tankId: nz.tankId,
          movementType: 'Sale',
          quantity: String(-netVolume),
          referenceType: 'reading',
          referenceId: reading.id,
          notes: 'Metered fuel sale',
        });
      }
    }
    if (movements.length > 0) {
      await this.deps.stockMovements.saveMany(movements);
    }

    // Drawer reconciliation (totals preloaded in the consolidated context read;
    // they aggregate money rows this use case never mutates).
    const totals = context.totals;
    // Two-level variance (#287, ADR 0005): opening cash is Σ Opening Floats;
    // the office expects what Drawers declared at Handover.
    const openingCash = totals.openingFloat;
    const closingCash = cmd.closingCash;
    const closeCash = computeShiftCloseCash(
      totals,
      closingCash,
      cmd.closeCashDrops ?? [],
      Number(cmd.cashDrops ?? 0),
    );
    const { expectedDrawerCash, cashVariance, attendantVariance } = closeCash;
    const closeCashDrops = closeCash.drawerCloseCashDrops + closeCash.unassignedCloseCashDrops;
    const cashDrops = totals.handoverCashDrops + closeCashDrops;

    // Credit sales with vehicle information for the immutable snapshot.
    const creditSalesRecords = context.creditSales;
    const creditSalesTotal = creditSalesRecords.reduce((sum, r) => sum + Number(r.amount), 0);

    const nowIso = ctx.clock.now().toISOString();
    const baseSnapshot: Record<string, unknown> = {
      generatedAt: nowIso,
      cashVarianceModel: CASH_VARIANCE_MODEL_TWO_LEVEL,
      shiftId: shift.id,
      businessDayId: shift.businessDayId,
      openingCash,
      closingCash,
      cashDrops,
      handoverCashDrops: totals.handoverCashDrops,
      closeCashDrops,
      closeCashDropEntries: cmd.closeCashDrops ?? [],
      unassignedCloseCashDrops: closeCash.unassignedCloseCashDrops,
      drawers: closeCash.drawers,
      reconciliation: { ...totals, cashSales: closeCash.cashSales, drawers: closeCash.drawers },
      expectedDrawerCash,
      cashVariance,
      officeCountVariance: cashVariance,
      attendantVariance,
      readings: enriched,
      totalVolume,
      totalTesting,
      totalNetVolume,
      totalFuelSalesValue,
      creditSales: creditSalesRecords.map((r) => ({
        id: r.id,
        amount: r.amount,
        quantity: r.quantity,
        unitPrice: r.unitPrice,
        notes: r.notes,
        duId: r.duId,
        attendantId: r.attendantId,
        customerId: r.customerId,
        vehicleId: r.vehicleId,
        productId: r.productId,
        customerName: r.customerName,
        productName: r.productName,
        productCode: r.productCode,
        vehicleNumber: r.vehicleNumber,
      })),
      creditSalesTotal,
      notes: cmd.notes ?? null,
    };

    const closed: Shift = {
      ...shift,
      status: 'CLOSED',
      closedBy: ctx.actorId ?? 'system',
      closedAt: nowIso,
      closingCash: String(closingCash),
      updatedAt: nowIso,
    };

    // Project BEFORE persisting so the summary is written exactly once with its
    // final (presentation-enriched) content. projectShiftSummary is idempotent
    // over its own output, so downstream refreshes remain safe.
    const snapshot = this.deps.projector
      ? await this.deps.projector.project(closed, baseSnapshot)
      : baseSnapshot;
    await this.deps.summaries.save(shift.id, snapshot);
    await this.deps.shifts.save(closed);

    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.CASH_DECLARED,
        aggregateType: 'Shift',
        aggregateId: shift.id,
        stationId: shift.stationId,
        businessDayId: shift.businessDayId,
        payload: {
          shiftId: shift.id,
          closingCash,
          expectedDrawerCash,
          cashVariance,
          attendantVariance,
        },
        presentation: {
          templateId: 'cash-declared.v1',
          values: { closingCash },
        },
        groupingRole: 'related',
      }),
      eventFromContext(ctx, {
        eventType: BusinessEvents.SHIFT_CLOSED,
        aggregateType: 'Shift',
        aggregateId: shift.id,
        stationId: shift.stationId,
        businessDayId: shift.businessDayId,
        payload: { shiftId: shift.id, totalVolume, totalFuelSalesValue, cashVariance },
        presentation: {
          templateId: 'shift-closed.v1',
          values: { cashVariance },
        },
        groupingRole: 'primary',
      }),
    ]);

    return ok({ shift: closed, snapshot, cashSales: closeCash.cashSales });
  }
}
