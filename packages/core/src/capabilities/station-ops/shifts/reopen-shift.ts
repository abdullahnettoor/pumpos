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
import type { Shift, ShiftRepository, ShiftSummaryWriter } from './ports.js';
import type { BusinessDayWriteRepository } from '../business-days/index.js';
import type { StockVarianceRepository } from '../../inventory/index.js';

export interface ReopenShiftCommand {
  shiftId: string;
}

export interface ReopenShiftDeps {
  shifts: ShiftRepository;
  businessDays: BusinessDayWriteRepository;
  summaries: ShiftSummaryWriter;
  stockVariances: StockVarianceRepository;
  events: EventPublisher;
}

/** Reopen a CLOSED shift for correction. Clears closing cash + summary snapshot. */
export class ReopenShift implements UseCase<ReopenShiftCommand, Shift> {
  constructor(private readonly deps: ReopenShiftDeps) {}

  async execute(input: ReopenShiftCommand, ctx: ExecutionContext): Promise<Result<Shift>> {
    if (!input?.shiftId) return err(validationError('shiftId is required'));
    const discoveredShift = await this.deps.shifts.findByIdWithoutLock(input.shiftId);
    if (!discoveredShift || discoveredShift.organizationId !== ctx.organizationId)
      return err(notFoundError('Shift', input.shiftId));

    await this.deps.businessDays.lockStation(ctx.organizationId, discoveredShift.stationId);
    await this.deps.businessDays.lockById(ctx.organizationId, discoveredShift.businessDayId);

    // Re-read under the canonical Station -> Business Day -> Shift lock order.
    const shift = await this.deps.shifts.findById(input.shiftId);
    if (!shift || shift.organizationId !== ctx.organizationId)
      return err(notFoundError('Shift', input.shiftId));
    const businessDay = await this.deps.businessDays.findById(shift.businessDayId);
    if (
      !businessDay ||
      businessDay.organizationId !== ctx.organizationId ||
      businessDay.stationId !== shift.stationId
    ) {
      return err(notFoundError('BusinessDay', shift.businessDayId));
    }
    if (businessDay.status === 'CLOSED') {
      return err(
        invariantViolation('Cannot reopen a Shift after its Business Day is closed', {
          shiftId: shift.id,
          businessDayId: businessDay.id,
        }),
      );
    }
    if (shift.status === 'OPEN')
      return err(invariantViolation('Shift is already open', { shiftId: shift.id }));
    if (shift.status !== 'CLOSED' && shift.status !== 'LOCKED')
      return err(
        invariantViolation('Only closed shifts can be reopened', {
          shiftId: shift.id,
          status: shift.status,
        }),
      );

    // Reopening cannot overlap another drawer-accountability window.
    const openShift = await this.deps.shifts.findOpenByStation(
      shift.organizationId,
      shift.stationId,
    );
    if (openShift && openShift.id !== shift.id) {
      return err(
        invariantViolation(
          'Cannot reopen: another shift is currently open at this station. Close it first.',
          { shiftId: shift.id, openShiftId: openShift.id },
        ),
      );
    }
    // A tank dip attributed to this shift pins its stock reconciliation.
    if (await this.deps.stockVariances.existsForShift(shift.id)) {
      return err(
        invariantViolation('Cannot reopen: the Shift has an attributed Tank Dip', {
          shiftId: shift.id,
        }),
      );
    }
    const nowIso = ctx.clock.now().toISOString();
    const reopened: Shift = {
      ...shift,
      status: 'OPEN',
      closedBy: null,
      closedAt: null,
      lockedAt: null,
      closingCash: null,
      updatedAt: nowIso,
    };
    await this.deps.shifts.save(reopened);
    await this.deps.summaries.deleteForShift(shift.id);

    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.SHIFT_REOPENED,
        aggregateType: 'Shift',
        aggregateId: shift.id,
        stationId: shift.stationId,
        businessDayId: shift.businessDayId,
        payload: { shiftId: shift.id },
      }),
    ]);

    return ok(reopened);
  }
}
