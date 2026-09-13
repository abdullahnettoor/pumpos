import { err, notFoundError, ok } from '../../../kernel/index.js';
import type { ExecutionContext, Result } from '../../../kernel/index.js';
import { resolveBusinessDayWrite } from '../business-days/index.js';
import type { BusinessDayWriteEligibility, BusinessDayWriteKind, BusinessDayWriteRepository } from '../business-days/index.js';
import type { Shift, ShiftRepository } from './ports.js';

export interface ShiftBusinessDayWriteEligibility extends BusinessDayWriteEligibility {
  shift: Shift;
}

/** Discover the parent, lock Station -> Business Day -> Shift, then validate both again. */
export async function resolveShiftBusinessDayWrite(
  shifts: ShiftRepository,
  businessDays: BusinessDayWriteRepository,
  ctx: ExecutionContext,
  shiftId: string,
  kind: BusinessDayWriteKind,
): Promise<Result<ShiftBusinessDayWriteEligibility>> {
  const discovered = await shifts.findByIdWithoutLock(shiftId);
  if (!discovered || discovered.organizationId !== ctx.organizationId) return err(notFoundError('Shift', shiftId));

  const day = await resolveBusinessDayWrite(businessDays, ctx, {
    stationId: discovered.stationId,
    businessDayId: discovered.businessDayId,
    kind,
  });
  if (!day.success) return day;

  const shift = await shifts.findById(shiftId);
  if (!shift || shift.organizationId !== ctx.organizationId || shift.stationId !== discovered.stationId || shift.businessDayId !== day.data.businessDay.id) {
    return err(notFoundError('Shift', shiftId));
  }
  return ok({ ...day.data, shift });
}
