import { err, notFoundError, ok } from '../../../kernel/index.js';
import type { ExecutionContext, Result } from '../../../kernel/index.js';
import { checkBusinessDayWriteEligibility } from '../business-days/index.js';
import type {
  BusinessDay,
  BusinessDayWriteEligibility,
  BusinessDayWriteKind,
  BusinessDayWriteRepository,
} from '../business-days/index.js';
import type { Shift, ShiftRepository } from './ports.js';

export interface ShiftBusinessDayWriteEligibility extends BusinessDayWriteEligibility {
  shift: Shift;
}

/** A Shift and the Business Day it names, as one read returned them. */
export interface ShiftWriteGateRows {
  shift: Shift | null;
  businessDay: BusinessDay | null;
}

export interface ShiftWriteLockTarget {
  organizationId: string;
  stationId: string;
  businessDayId: string;
  shiftId: string;
}

/**
 * The reads behind every Shift-anchored write (#248).
 *
 * `discover` takes NO row locks: it returns the Shift by id and the Business
 * Day its `businessDayId` names, so the caller can validate the tenant and
 * station before locking anything.
 *
 * `lockForWrite` takes row locks in the canonical order Station -> Business
 * Day -> Shift (the Station and Business Day locks are organization-scoped, the
 * Shift lock is by id), and returns the Business Day and Shift as they stand
 * once locked. Every lock is attempted even when an earlier row is absent; the
 * caller revalidates both rows.
 */
export interface ShiftWriteGateReader {
  discover(shiftId: string): Promise<ShiftWriteGateRows>;
  lockForWrite(target: ShiftWriteLockTarget): Promise<ShiftWriteGateRows>;
}

/**
 * The gate composed from the repositories, one statement per read: shift and
 * day discovery, station lock, day lock, day re-read, shift re-read under lock.
 * Used where no consolidated gate is wired.
 */
export function sequentialShiftWriteGate(deps: {
  shifts: ShiftRepository;
  businessDays: BusinessDayWriteRepository;
}): ShiftWriteGateReader {
  const { shifts, businessDays } = deps;
  return {
    async discover(shiftId) {
      const shift = await shifts.findByIdWithoutLock(shiftId);
      if (!shift) return { shift: null, businessDay: null };
      return { shift, businessDay: await businessDays.findById(shift.businessDayId) };
    },
    async lockForWrite(target) {
      await businessDays.lockStation(target.organizationId, target.stationId);
      await businessDays.lockById(target.organizationId, target.businessDayId);
      const businessDay = await businessDays.findById(target.businessDayId);
      const shift = await shifts.findById(target.shiftId);
      return { shift, businessDay };
    },
  };
}

/** The consolidated gate when one is wired, else the repository-backed one. */
export function shiftWriteGateFor(deps: {
  shifts: ShiftRepository;
  businessDays: BusinessDayWriteRepository;
  shiftWriteGate?: ShiftWriteGateReader;
}): ShiftWriteGateReader {
  return deps.shiftWriteGate ?? sequentialShiftWriteGate(deps);
}

/** Discover the parent, lock Station -> Business Day -> Shift, then validate both again. */
export async function resolveShiftBusinessDayWrite(
  gate: ShiftWriteGateReader,
  ctx: ExecutionContext,
  shiftId: string,
  kind: BusinessDayWriteKind,
): Promise<Result<ShiftBusinessDayWriteEligibility>> {
  const discovered = await gate.discover(shiftId);
  const discoveredShift = discovered.shift;
  if (
    !discoveredShift ||
    discoveredShift.organizationId !== ctx.organizationId ||
    (ctx.stationId && discoveredShift.stationId !== ctx.stationId)
  ) {
    return err(notFoundError('Shift', shiftId));
  }

  const { stationId, businessDayId } = discoveredShift;
  const candidate = discovered.businessDay;
  if (
    !candidate ||
    candidate.organizationId !== ctx.organizationId ||
    candidate.stationId !== stationId
  ) {
    return err(notFoundError('Business Day', businessDayId));
  }

  const locked = await gate.lockForWrite({
    organizationId: ctx.organizationId,
    stationId,
    businessDayId,
    shiftId,
  });
  const day = checkBusinessDayWriteEligibility(locked.businessDay, ctx, {
    stationId,
    kind,
    notFoundId: businessDayId,
  });
  if (!day.success) return day;

  const shift = locked.shift;
  if (
    !shift ||
    shift.organizationId !== ctx.organizationId ||
    (ctx.stationId && shift.stationId !== ctx.stationId) ||
    shift.stationId !== stationId ||
    shift.businessDayId !== day.data.businessDay.id
  ) {
    return err(notFoundError('Shift', shiftId));
  }
  return ok({ ...day.data, shift });
}
