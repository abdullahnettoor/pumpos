import type { BusinessDayWriteRepository } from '../../business-days/index.js';
import type { ShiftRepository } from '../ports.js';
import type { ShiftWriteDeps, ShiftWriteGateReader } from '../resolve-shift-write.js';

/**
 * A ShiftWriteGateReader over in-memory repositories, one call per read, in the
 * order the Drizzle gate's statements take them: shift and day discovery,
 * station lock, day lock, day re-read, then the shift re-read under lock (only
 * when the locked day admits the write).
 */
export function repositoryShiftWriteGate(deps: {
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

/** `deps` with a repository-backed gate added, unless the test wired its own. */
export function withRepositoryShiftWriteGate<T extends Omit<ShiftWriteDeps, 'shiftWriteGate'>>(
  deps: T & { shiftWriteGate?: ShiftWriteGateReader },
): T & { shiftWriteGate: ShiftWriteGateReader } {
  return { ...deps, shiftWriteGate: deps.shiftWriteGate ?? repositoryShiftWriteGate(deps) };
}
