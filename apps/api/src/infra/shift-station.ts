import { and, eq } from 'drizzle-orm';
import { schema, type DbClient } from '@pump/db';
import { isAuthorizedForStation } from '@pump/shared';

/**
 * The station a Shift belongs to, scoped to the caller's organization (#243).
 *
 * `null` when the shift does not exist inside this organization — a foreign
 * shift is indistinguishable from a missing one, exactly as `stationExistsInOrg`
 * treats a foreign station.
 */
export async function findShiftStation(
  db: DbClient,
  organizationId: string,
  shiftId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ stationId: schema.shifts.stationId })
    .from(schema.shifts)
    .where(and(eq(schema.shifts.id, shiftId), eq(schema.shifts.organizationId, organizationId)))
    .limit(1);
  return row?.stationId ?? null;
}

export type ShiftStationAuthorization =
  | { authorized: true; stationId: string | null }
  | { authorized: false; reason: 'FORBIDDEN' | 'STATION_MISMATCH' };

/**
 * Station authorization for a Shift-anchored write.
 *
 * A Role answers whether the *user* may act. It does not answer *where*, and
 * the station is not the caller's to assert: the Shift owns it. Guarding on a
 * body `stationId` only guards callers who choose to send one — omit the field
 * and the guard is skipped — so the station is derived from the Shift instead,
 * and a supplied `stationId` is only ever cross-checked against it.
 *
 * This matters because the core's own station check is conditional
 * (`resolveShiftBusinessDayWrite`: `ctx.stationId && discovered.stationId !==
 * ctx.stationId`). With no station in the ExecutionContext it silently no-ops
 * and only the organization check remains, which lets a Manager scoped to one
 * station write into another station's open Shift in the same organization.
 *
 * Returns the resolved station so the caller can put it in the context, which
 * is what makes that core clause engage as defence in depth.
 *
 * An unresolvable shift is deliberately NOT refused here: answering 403 would
 * tell a caller whether a shift id is real in some other organization. It is
 * passed through as `stationId: null` for the use-case to reject as not found.
 */
export async function authorizeShiftStation(
  db: DbClient,
  user: { organizationId: string; role: string; assignedStationIds: string[] },
  shiftId: string | null | undefined,
  claimedStationId?: string | null,
): Promise<ShiftStationAuthorization> {
  if (!shiftId) return { authorized: true, stationId: null };

  const stationId = await findShiftStation(db, user.organizationId, shiftId);
  if (!stationId) return { authorized: true, stationId: null };

  if (
    !isAuthorizedForStation(user as Parameters<typeof isAuthorizedForStation>[0], {
      organizationId: user.organizationId,
      stationId,
    })
  ) {
    return { authorized: false, reason: 'FORBIDDEN' };
  }

  // A caller authorized for both stations could otherwise name one station and
  // anchor the row to another's Shift; the write would silently follow the
  // Shift. Refuse rather than quietly pick a winner.
  if (claimedStationId && claimedStationId !== stationId) {
    return { authorized: false, reason: 'STATION_MISMATCH' };
  }

  return { authorized: true, stationId };
}
