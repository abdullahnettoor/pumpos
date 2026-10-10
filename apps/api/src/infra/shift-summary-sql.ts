import { sql, type SQL } from 'drizzle-orm';

const SNAPSHOT_REF = /^[a-zA-Z_][a-zA-Z0-9_]*\."?[a-zA-Z_][a-zA-Z0-9_]*"?$/;

/** Clamps testing to metered volume before deriving the net nozzle litres. */
export function netNozzleVolume(volumeSold: unknown, testingVolume: unknown): number {
  const gross = Math.max(0, Number(volumeSold ?? 0) || 0);
  const testing = Math.min(Math.max(Number(testingVolume ?? 0) || 0, 0), gross);
  return gross - testing;
}

/** Legacy Shift Summary fallback shared by every SQL aggregate reader. */
export function shiftSummaryNetVolume(
  snapshot: Record<string, any>,
  readings: readonly { netVolume: number }[] = [],
): number {
  if (readings.length > 0) return readings.reduce((sum, row) => sum + row.netVolume, 0);
  if (snapshot.totalNetVolume != null) return Number(snapshot.totalNetVolume);
  return Math.max(0, Number(snapshot.totalVolume ?? 0) - Number(snapshot.totalTesting ?? 0));
}

/** Stored Shift Summary equivalent of shiftSummaryNetVolume. */
export function shiftSummaryNetVolumeSql(ref: string): SQL {
  if (!SNAPSHOT_REF.test(ref)) throw new Error(`shift-summary-sql: invalid snapshot ref "${ref}"`);
  const data = sql.raw(ref);
  return sql`COALESCE(
    (SELECT SUM(COALESCE((r.value ->> 'netVolume')::numeric,
      COALESCE((r.value ->> 'volumeSold')::numeric, 0)
        - COALESCE((r.value ->> 'testingVolume')::numeric, 0)))
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(${data} -> 'readings') = 'array'
        THEN ${data} -> 'readings' ELSE '[]'::jsonb END) r
      WHERE jsonb_typeof(${data} -> 'readings') = 'array'),
    (${data} ->> 'totalNetVolume')::numeric,
    GREATEST(0, COALESCE((${data} ->> 'totalVolume')::numeric, 0)
      - COALESCE((${data} ->> 'totalTesting')::numeric,
        (${data} ->> 'totalTestingVolume')::numeric, 0)),
    0)`;
}
