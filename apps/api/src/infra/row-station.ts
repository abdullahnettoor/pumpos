import { and, eq } from 'drizzle-orm';
import { schema, type DbClient } from '@pump/db';
import { isAuthorizedForStation } from '@pump/shared';
import type { AuthenticatedPrincipal } from './authenticated-principal.js';

/**
 * A table whose rows hang off a Business Day — expenses, other income, customer
 * transactions, sales. `business_days` is what carries the organization and the
 * station, so it is the join every one of these lookups makes.
 */
// The drizzle table types do not share a structural supertype that keeps both
// columns typed, so this is the one place the looseness is admitted.
/* eslint-disable @typescript-eslint/no-explicit-any */
export type BusinessDayAnchoredTable = any;

/**
 * The station a stored row belongs to, scoped to the caller's organization
 * (#247). `null` when the row does not exist inside this organization — a
 * foreign row is indistinguishable from a missing one.
 *
 * The station comes from the row itself (Office Records, ADR 0005) or from its
 * Business Day, and from nowhere else. An
 * id-resolved mutation has no shift and no caller-supplied station to trust,
 * so this is the only honest source.
 */
export async function findRowStation(
  db: DbClient,
  table: BusinessDayAnchoredTable,
  id: string,
  organizationId: string,
): Promise<string | null> {
  // Office Records (ADR 0005) carry their own organization + station.
  if (table.organizationId && table.stationId && !table.businessDayId) {
    const [own] = await db
      .select({ stationId: table.stationId })
      .from(table)
      .where(and(eq(table.id, id), eq(table.organizationId, organizationId)))
      .limit(1);
    return (own?.stationId as string | undefined) ?? null;
  }
  const [row] = await db
    .select({ stationId: schema.businessDays.stationId })
    .from(table)
    .innerJoin(schema.businessDays, eq(table.businessDayId, schema.businessDays.id))
    .where(and(eq(table.id, id), eq(schema.businessDays.organizationId, organizationId)))
    .limit(1);
  return row?.stationId ?? null;
}

export type RowStationAuthorization =
  | { authorized: true; stationId: string }
  | { authorized: false; reason: 'NOT_FOUND' | 'FORBIDDEN' };

/**
 * Station authorization for a mutation that names only a row id.
 *
 * Organization scope alone is not enough: same organization, wrong station
 * still corrupts a Business Day the caller has no business touching. Voiding
 * is the sharp case — it moves a figure someone has already reconciled against.
 *
 * Returns the resolved station so the caller can carry it into the
 * ExecutionContext, which is the half that is easy to implement and easy to
 * forget (#246).
 */
export async function authorizeRowStation(
  db: DbClient,
  user: AuthenticatedPrincipal,
  table: BusinessDayAnchoredTable,
  id: string,
): Promise<RowStationAuthorization> {
  const stationId = await findRowStation(db, table, id, user.organizationId);
  if (!stationId) return { authorized: false, reason: 'NOT_FOUND' };

  if (!isAuthorizedForStation(user, { organizationId: user.organizationId, stationId })) {
    return { authorized: false, reason: 'FORBIDDEN' };
  }
  return { authorized: true, stationId };
}
