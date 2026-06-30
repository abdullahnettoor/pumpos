import { z } from 'zod';
import { BusinessEvents, err, eventFromContext, invariantViolation, notFoundError, ok, validationError } from '../../../kernel/index.js';
import type { EventPublisher, ExecutionContext, Result, UseCase } from '../../../kernel/index.js';
import type { NozzleRepository } from '../../station-setup/nozzles/index.js';
import type {
  NozzleReadingRepository,
  Shift,
  ShiftReconciliationReader,
  ShiftRepository,
  ShiftSummaryWriter,
  StockMovementInput,
  StockMovementWriter,
} from './ports.js';

export interface CloseShiftCommand {
  shiftId: string;
  closingCash: number | string;
  nozzleReadings?: { nozzleId: string; closingReading: number }[];
  cashDrops?: number | string;
  notes?: string;
}

const schema = z.object({
  shiftId: z.string().min(1, 'shiftId is required'),
  closingCash: z.coerce.number().min(0, 'closingCash must be >= 0'),
  nozzleReadings: z.array(z.object({ nozzleId: z.string().min(1), closingReading: z.coerce.number().min(0) })).optional(),
  cashDrops: z.coerce.number().min(0).optional(),
  notes: z.string().max(500).optional(),
});

export interface CloseShiftDeps {
  shifts: ShiftRepository;
  nozzles: NozzleRepository;
  nozzleReadings: NozzleReadingRepository;
  reconciliation: ShiftReconciliationReader;
  stockMovements: StockMovementWriter;
  summaries: ShiftSummaryWriter;
  events: EventPublisher;
}

export interface CloseShiftResult {
  shift: Shift;
  snapshot: Record<string, unknown>;
}

/**
 * Close an open shift: finalize nozzle readings (volume = closing - opening),
 * record fuel SALE stock movements, run drawer reconciliation
 * (expectedDrawerCash = openingCash + cashCollections - drawerExpenses
 *  - drawerSupplierPayments - cashDrops), persist an immutable shift summary,
 * and mark the shift CLOSED. Run inside runInTransaction.
 *
 * NOTE: fuel cash-vs-card split is not yet known (Retail capture lands in
 * Phase 5); cash sales are therefore not added to expected drawer cash yet.
 */
export class CloseShift implements UseCase<CloseShiftCommand, CloseShiftResult> {
  constructor(private readonly deps: CloseShiftDeps) {}

  async execute(input: CloseShiftCommand, ctx: ExecutionContext): Promise<Result<CloseShiftResult>> {
    const p = schema.safeParse(input);
    if (!p.success) return err(validationError('Invalid CloseShift command', { issues: p.error.flatten() }));
    const cmd = p.data;

    const shift = await this.deps.shifts.findById(cmd.shiftId);
    if (!shift || shift.organizationId !== ctx.organizationId) return err(notFoundError('Shift', cmd.shiftId));
    if (shift.status !== 'OPEN') return err(invariantViolation('Shift is not open', { shiftId: shift.id, status: shift.status }));

    const dbReadings = await this.deps.nozzleReadings.listByShift(shift.id);
    const closingByNozzle = new Map((cmd.nozzleReadings ?? []).map((r) => [r.nozzleId, r.closingReading]));

    // Apply any provided closing readings.
    for (const reading of dbReadings) {
      const provided = closingByNozzle.get(reading.nozzleId);
      if (provided === undefined) continue;
      const opening = Number(reading.openingReading);
      if (provided < opening) {
        return err(validationError(`Closing reading (${provided}) is below opening (${opening})`, { nozzleId: reading.nozzleId }));
      }
      const volume = provided - opening;
      await this.deps.nozzleReadings.updateClosing(reading.id, String(provided), String(volume));
      reading.closingReading = String(provided);
      reading.volumeSold = String(volume);
    }

    const nozzles = await this.deps.nozzles.listByStation(ctx.organizationId, shift.stationId);
    const nozzleMap = new Map(nozzles.map((n) => [n.id, n]));

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

    // Drawer reconciliation.
    const totals = await this.deps.reconciliation.totalsForShift(shift.id);
    const openingCash = Number(shift.openingCash);
    const closingCash = cmd.closingCash;
    const cashDrops = Number(cmd.cashDrops ?? 0);
    const expectedDrawerCash =
      openingCash + totals.cashSales + totals.cashCollections - totals.drawerExpenses - totals.drawerSupplierPayments - cashDrops;
    const cashVariance = closingCash - expectedDrawerCash;

    const nowIso = ctx.clock.now().toISOString();
    const snapshot: Record<string, unknown> = {
      generatedAt: nowIso,
      shiftId: shift.id,
      businessDayId: shift.businessDayId,
      openingCash,
      closingCash,
      cashDrops,
      reconciliation: totals,
      expectedDrawerCash,
      cashVariance,
      readings: enriched,
      totalVolume,
      totalTesting,
      totalNetVolume,
      totalFuelSalesValue,
      notes: cmd.notes ?? null,
    };
    await this.deps.summaries.save(shift.id, snapshot);

    const closed: Shift = {
      ...shift,
      status: 'CLOSED',
      closedBy: ctx.actorId ?? 'system',
      closedAt: nowIso,
      closingCash: String(closingCash),
      updatedAt: nowIso,
    };
    await this.deps.shifts.save(closed);

    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.CASH_DECLARED,
        aggregateType: 'Shift',
        aggregateId: shift.id,
        stationId: shift.stationId,
        businessDayId: shift.businessDayId,
        payload: { shiftId: shift.id, closingCash, expectedDrawerCash, cashVariance },
      }),
      eventFromContext(ctx, {
        eventType: BusinessEvents.SHIFT_CLOSED,
        aggregateType: 'Shift',
        aggregateId: shift.id,
        stationId: shift.stationId,
        businessDayId: shift.businessDayId,
        payload: { shiftId: shift.id, totalVolume, totalFuelSalesValue, cashVariance },
      }),
    ]);

    return ok({ shift: closed, snapshot });
  }
}
