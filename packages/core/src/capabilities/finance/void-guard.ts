import { err, invariantViolation, notFoundError, ok } from '../../kernel/index.js';
import type { Result } from '../../kernel/index.js';
import type { ShiftRepository } from '../station-ops/shifts/index.js';

/**
 * Drawer-cash entries (expenses / income that moved the physical drawer) may
 * only be voided while their shift is still OPEN. Once the shift is closed the
 * drawer has been reconciled into an immutable shift summary, so a retro-void
 * would silently contradict that snapshot. Business-day-anchored entries
 * (bank / owner / petty cash) never touch the drawer and stay voidable.
 */
export async function assertDrawerEntryVoidable(
  entry: { shiftId: string | null; affectsDrawer: boolean },
  shifts: ShiftRepository | undefined,
  label: string,
): Promise<Result<true>> {
  if (!entry.affectsDrawer || !entry.shiftId || !shifts) return ok(true);

  const shift = await shifts.findById(entry.shiftId);
  if (!shift) return err(notFoundError('Shift', entry.shiftId));
  if (shift.status !== 'OPEN') {
    return err(
      invariantViolation(
        `${label} was paid from the cash drawer of a ${shift.status.toLowerCase()} shift and can no longer be voided. Record a correcting entry instead.`,
        { shiftId: shift.id, shiftStatus: shift.status },
      ),
    );
  }
  return ok(true);
}
