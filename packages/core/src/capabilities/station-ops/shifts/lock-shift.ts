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
import type { Shift, ShiftRepository } from './ports.js';
import type { BusinessDayWriteRepository } from '../business-days/index.js';
import { resolveShiftBusinessDayWrite } from './resolve-shift-write.js';

export interface LockShiftCommand {
  shiftId: string;
}

export interface LockShiftDeps {
  shifts: ShiftRepository;
  businessDays: BusinessDayWriteRepository;
  events: EventPublisher;
}

/** Lock a CLOSED shift, making it immutable. */
export class LockShift implements UseCase<LockShiftCommand, Shift> {
  constructor(private readonly deps: LockShiftDeps) {}

  async execute(input: LockShiftCommand, ctx: ExecutionContext): Promise<Result<Shift>> {
    if (!input?.shiftId) return err(validationError('shiftId is required'));
    const eligibility = await resolveShiftBusinessDayWrite(
      this.deps.shifts,
      this.deps.businessDays,
      ctx,
      input.shiftId,
      'FINANCIAL',
    );
    if (!eligibility.success) return eligibility as unknown as Result<Shift>;
    const shift = eligibility.data.shift;
    if (shift.status !== 'CLOSED')
      return err(
        invariantViolation('Only closed shifts can be locked', {
          shiftId: shift.id,
          status: shift.status,
        }),
      );
    const businessDay = eligibility.data.businessDay;
    if (businessDay.status === 'OPEN') {
      return err(
        invariantViolation('A Shift cannot be locked while its Business Day is open', {
          shiftId: shift.id,
          businessDayId: businessDay.id,
        }),
      );
    }

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
