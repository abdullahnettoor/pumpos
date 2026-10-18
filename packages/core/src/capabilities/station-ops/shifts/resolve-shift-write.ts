import { err, notFoundError, ok } from '../../../kernel/index.js';
import type { ExecutionContext, Result } from '../../../kernel/index.js';
import {
  checkBusinessDayWriteEligibility,
  writableBusinessDayStatuses,
} from '../business-days/index.js';
import type {
  BusinessDay,
  BusinessDayStatus,
  BusinessDayWriteEligibility,
  BusinessDayWriteKind,
  BusinessDayWriteRepository,
} from '../business-days/index.js';
import type { Shift, ShiftRepository } from './ports.js';

/**
 * A Shift as the gate reads it: every field but `openingCash`. That is a sum
 * over the Shift's Drawers, which the lock statement cannot read fresh (its
 * snapshot predates any lock wait); callers that need it use `readOpeningCash`.
 */
export type GatedShift = Omit<Shift, 'openingCash'>;

export interface ShiftBusinessDayWriteEligibility extends BusinessDayWriteEligibility {
  shift: GatedShift;
}

/** A Shift and the Business Day it names, as one read returned them. */
export interface ShiftWriteGateRows {
  shift: GatedShift | null;
  businessDay: BusinessDay | null;
}

export interface ShiftWriteLockTarget {
  organizationId: string;
  stationId: string;
  businessDayId: string;
  shiftId: string;
  /** Lock the Shift only if the locked Business Day has one of these statuses. */
  writableDayStatuses: readonly BusinessDayStatus[];
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
 * once locked. The Station lock is attempted even when the Station is absent;
 * the Shift is locked and returned only when the locked Business Day is at the
 * target station with a status in `writableDayStatuses`, so a refused write
 * never locks the Shift. The caller revalidates both rows.
 *
 * `readOpeningCash` sums the Shift's Opening Floats in a fresh statement, so
 * it sees whatever committed while `lockForWrite` waited.
 */
export interface ShiftWriteGateReader {
  discover(shiftId: string): Promise<ShiftWriteGateRows>;
  lockForWrite(target: ShiftWriteLockTarget): Promise<ShiftWriteGateRows>;
  readOpeningCash(shiftId: string): Promise<string>;
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
      const dayAdmitsWrite =
        businessDay?.organizationId === target.organizationId &&
        businessDay.stationId === target.stationId &&
        target.writableDayStatuses.includes(businessDay.status);
      if (!dayAdmitsWrite) return { shift: null, businessDay };
      return { shift: await shifts.findById(target.shiftId), businessDay };
    },
    async readOpeningCash(shiftId) {
      return (await shifts.findByIdWithoutLock(shiftId))?.openingCash ?? '0';
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

/** The parents a Shift write was locked under, and the rows read under that lock. */
export interface LockedShiftParents {
  stationId: string;
  businessDayId: string;
  locked: ShiftWriteGateRows;
}

/**
 * Discover the Shift unlocked, check it and the Business Day it names belong to
 * the tenant (and to the context's station, when it names one), then lock
 * Station -> Business Day -> Shift. The Shift is locked only under a day whose
 * status is in `writableDayStatuses`; the caller judges the locked day, then
 * the locked Shift with `lockedShiftOf`.
 */
export async function lockShiftWriteParents(
  gate: ShiftWriteGateReader,
  ctx: ExecutionContext,
  shiftId: string,
  writableDayStatuses: readonly BusinessDayStatus[],
): Promise<Result<LockedShiftParents>> {
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
    writableDayStatuses,
  });
  return ok({ stationId, businessDayId, locked });
}

/** The locked Shift, provided it is still the discovered one: same tenant, station and day. */
export function lockedShiftOf(
  parents: LockedShiftParents,
  ctx: ExecutionContext,
  shiftId: string,
): Result<GatedShift> {
  const shift = parents.locked.shift;
  if (
    !shift ||
    shift.organizationId !== ctx.organizationId ||
    (ctx.stationId && shift.stationId !== ctx.stationId) ||
    shift.stationId !== parents.stationId ||
    shift.businessDayId !== parents.businessDayId
  ) {
    return err(notFoundError('Shift', shiftId));
  }
  return ok(shift);
}

/** Discover the parent, lock Station -> Business Day -> Shift, then validate both again. */
export async function resolveShiftBusinessDayWrite(
  gate: ShiftWriteGateReader,
  ctx: ExecutionContext,
  shiftId: string,
  kind: BusinessDayWriteKind,
): Promise<Result<ShiftBusinessDayWriteEligibility>> {
  const parents = await lockShiftWriteParents(
    gate,
    ctx,
    shiftId,
    writableBusinessDayStatuses(kind),
  );
  if (!parents.success) return parents;

  const { stationId, businessDayId, locked } = parents.data;
  const day = checkBusinessDayWriteEligibility(locked.businessDay, ctx, {
    stationId,
    kind,
    notFoundId: businessDayId,
  });
  if (!day.success) return day;

  const shift = lockedShiftOf(parents.data, ctx, shiftId);
  if (!shift.success) return shift;
  return ok({ ...day.data, shift: shift.data });
}
