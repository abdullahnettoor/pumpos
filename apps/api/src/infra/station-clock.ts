import { eq } from 'drizzle-orm';
import { schema, type DbClient } from '@pump/db';
import { businessDateSettings } from '@pump/shared';

/**
 * Resolve a station's business-date settings (timezone + day-start boundary)
 * from its `settings` JSONB. Pass the result into `buildContext` so use-cases
 * derive the business day in station-local time. Falls back to Asia/Kolkata /
 * 00:00 when the station or settings are missing.
 */
export async function loadStationClock(
  db: DbClient,
  stationId: string | null | undefined,
): Promise<{ timeZone: string; businessDayStartsAt: string }> {
  if (!stationId) {
    const d = businessDateSettings(null);
    return { timeZone: d.timeZone, businessDayStartsAt: d.dayStartsAt };
  }
  const [row] = await db
    .select({ settings: schema.stations.settings })
    .from(schema.stations)
    .where(eq(schema.stations.id, stationId))
    .limit(1);
  const d = businessDateSettings(row?.settings ?? null);
  return { timeZone: d.timeZone, businessDayStartsAt: d.dayStartsAt };
}
