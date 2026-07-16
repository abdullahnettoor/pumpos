import { BusinessEvents, err, eventFromContext, invariantViolation, notFoundError, ok, validationError } from '../../../kernel/index.js';
import type { EventPublisher, ExecutionContext, Result, UseCase } from '../../../kernel/index.js';
import type { Shift, ShiftRepository } from './ports.js';

export interface LockShiftCommand {
  shiftId: string;
}

export interface LockShiftDeps {
  shifts: ShiftRepository;
  events: EventPublisher;
}

/** Lock a CLOSED shift, making it immutable. */
export class LockShift implements UseCase<LockShiftCommand, Shift> {
  constructor(private readonly deps: LockShiftDeps) {}

  async execute(input: LockShiftCommand, ctx: ExecutionContext): Promise<Result<Shift>> {
    if (!input?.shiftId) return err(validationError('shiftId is required'));
    const shift = await this.deps.shifts.findById(input.shiftId);
    if (!shift || shift.organizationId !== ctx.organizationId) return err(notFoundError('Shift', input.shiftId));
    if (shift.status !== 'CLOSED') return err(invariantViolation('Only closed shifts can be locked', { shiftId: shift.id, status: shift.status }));

    const nowIso = ctx.clock.now().toISOString();
    const locked: Shift = { ...shift, status: 'LOCKED', lockedAt: nowIso, updatedAt: nowIso };
    await this.deps.shifts.save(locked);

    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.SHIFT_LOCKED,
        aggregateType: 'Shift',
        aggregateId: shift.id,
        stationId: shift.stationId,
        businessDayId: shift.businessDayId,
        payload: { shiftId: shift.id },
      }),
    ]);

    return ok(locked);
  }
}
