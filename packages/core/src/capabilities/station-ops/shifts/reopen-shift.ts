import { BusinessEvents, err, eventFromContext, invariantViolation, notFoundError, ok, validationError } from '../../../kernel/index.js';
import type { EventPublisher, ExecutionContext, Result, UseCase } from '../../../kernel/index.js';
import type { Shift, ShiftRepository, ShiftSummaryWriter } from './ports.js';

export interface ReopenShiftCommand {
  shiftId: string;
}

export interface ReopenShiftDeps {
  shifts: ShiftRepository;
  summaries: ShiftSummaryWriter;
  events: EventPublisher;
}

/** Reopen a CLOSED shift for correction. Clears closing cash + summary snapshot. */
export class ReopenShift implements UseCase<ReopenShiftCommand, Shift> {
  constructor(private readonly deps: ReopenShiftDeps) {}

  async execute(input: ReopenShiftCommand, ctx: ExecutionContext): Promise<Result<Shift>> {
    if (!input?.shiftId) return err(validationError('shiftId is required'));
    const shift = await this.deps.shifts.findById(input.shiftId);
    if (!shift || shift.organizationId !== ctx.organizationId) return err(notFoundError('Shift', input.shiftId));
    if (shift.status === 'OPEN') return err(invariantViolation('Shift is already open', { shiftId: shift.id }));
    if (shift.status === 'LOCKED') return err(invariantViolation('Locked shifts cannot be reopened', { shiftId: shift.id }));

    const nowIso = ctx.clock.now().toISOString();
    const reopened: Shift = {
      ...shift,
      status: 'OPEN',
      closedBy: null,
      closedAt: null,
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
