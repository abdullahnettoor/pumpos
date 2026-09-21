import { and, eq } from 'drizzle-orm';
import { schema, type DbClient } from '@pump/db';
import { businessDateSettings } from '@pump/shared';

export type StationClock = { timeZone: string; businessDayStartsAt: string };

/** The platform defaults (Asia/Kolkata / 00:00) for routes without a station. */
export function defaultStationClock(): StationClock {
  const d = businessDateSettings(null);
  return { timeZone: d.timeZone, businessDayStartsAt: d.dayStartsAt };
}

/**
 * Resolve a station's business-date settings (timezone + day-start boundary)
 * from its `settings` JSONB, **scoped to the caller's organization** (#235):
 * a station belonging to another tenant is indistinguishable from a missing
 * one — `null` is returned and the route must refuse with 404. Never read a
 * station's settings without this organization predicate.
 *
 * Pass the resolved clock into `buildContext` so use-cases derive the
 * business day in station-local time.
 */
export async function findStationClock(
  db: DbClient,
  organizationId: string,
  stationId: string,
): Promise<StationClock | null> {
  const [row] = await db
    .select({ settings: schema.stations.settings })
    .from(schema.stations)
    .where(
      and(eq(schema.stations.id, stationId), eq(schema.stations.organizationId, organizationId)),
    )
    .limit(1);
  if (!row) return null;
  const d = businessDateSettings(row.settings ?? null);
  return { timeZone: d.timeZone, businessDayStartsAt: d.dayStartsAt };
}

/**
 * As `findStationClock`, but with the legacy optional-station convenience:
 * no stationId → platform defaults. A stationId that does not resolve inside
 * the organization still yields `null` so the caller refuses the request.
 */
export async function loadStationClock(
  db: DbClient,
  organizationId: string,
  stationId: string | null | undefined,
): Promise<StationClock | null> {
  if (!stationId) return defaultStationClock();
  return findStationClock(db, organizationId, stationId);
}

/** The uniform refusal for a station outside the caller's organization. */
export function stationNotFound(c: { json: (body: unknown, status: 404) => Response }): Response {
  return c.json(
    { success: false, error: { code: 'NOT_FOUND', message: 'Station not found' } },
    404,
  );
}
