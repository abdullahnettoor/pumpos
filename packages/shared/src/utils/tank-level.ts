import { z } from 'zod';

/**
 * Tank level: one answer to "is this tank fine, low or critical?" (#520).
 *
 * The thresholds are per station, stored in `stations.settings.tankLevels`
 * (JSONB, no column). Every surface that colours a tank — Dashboard, the
 * alerts bell, Inventory, mobile Home — reads them through
 * `resolveTankLevelSettings` and classifies with `tankTone`, so a tank never
 * reads "low" on one screen and "ok" on another.
 */

/** The `stations.settings` key holding the thresholds. */
export const TANK_LEVEL_SETTINGS_KEY = 'tankLevels';

export interface TankLevelSettings {
  /** A tank below this percent of capacity is critical. */
  criticalBelowPct: number;
  /** A tank below this percent (and not critical) is low. */
  lowBelowPct: number;
}

export const DEFAULT_TANK_LEVEL_SETTINGS: Readonly<TankLevelSettings> = Object.freeze({
  criticalBelowPct: 25,
  lowBelowPct: 40,
});

/** 0 < critical < low ≤ 100. */
export const tankLevelSettingsSchema = z
  .object({
    criticalBelowPct: z
      .number({ invalid_type_error: 'Enter a number' })
      .finite()
      .gt(0, 'Must be above 0%'),
    lowBelowPct: z
      .number({ invalid_type_error: 'Enter a number' })
      .finite()
      .gt(0, 'Must be above 0%')
      .max(100, 'Must be 100% or less'),
  })
  .refine((s) => s.criticalBelowPct < s.lowBelowPct, {
    message: 'Critical must be below low',
    path: ['criticalBelowPct'],
  });

/** Station thresholds from the station settings JSONB; defaults when unset or invalid. */
export function resolveTankLevelSettings(stationSettings: unknown): TankLevelSettings {
  const source =
    stationSettings && typeof stationSettings === 'object'
      ? (stationSettings as Record<string, unknown>)[TANK_LEVEL_SETTINGS_KEY]
      : undefined;
  const parsed = tankLevelSettingsSchema.safeParse(source);
  return parsed.success ? parsed.data : { ...DEFAULT_TANK_LEVEL_SETTINGS };
}

/** One threshold read raw from a settings value; the default when absent. */
function rawThreshold(value: unknown, key: keyof TankLevelSettings): unknown {
  const raw =
    value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined;
  return raw === undefined || raw === null ? DEFAULT_TANK_LEVEL_SETTINGS[key] : raw;
}

/**
 * Whether a `settings.tankLevels` write changes the thresholds. Compares each
 * threshold (missing → default on both sides), never the serialised object:
 * Postgres JSONB reorders keys, so an unchanged re-save must not count.
 */
export function tankLevelsChanged(before: unknown, after: unknown): boolean {
  return (['criticalBelowPct', 'lowBelowPct'] as const).some(
    (key) => !Object.is(rawThreshold(before, key), rawThreshold(after, key)),
  );
}

export type TankTone = 'critical' | 'low' | 'ok' | 'unknown';

/** The word for a tone the colour alone carries (desktop + mobile); none for ok/unknown. */
export const TANK_TONE_LABEL: Readonly<Partial<Record<TankTone, string>>> = Object.freeze({
  critical: 'Critical',
  low: 'Low',
});

/** Alert phrase after the tank name: "HSD critically low". */
export const TANK_TONE_ALERT: Readonly<Record<'critical' | 'low', string>> = Object.freeze({
  critical: 'critically low',
  low: 'running low',
});

/** Classify a fill percent; null (no capacity) is unknown. Over capacity is ok. */
export function tankTone(pct: number | null, settings: TankLevelSettings): TankTone {
  if (pct === null || !Number.isFinite(pct)) return 'unknown';
  if (pct < settings.criticalBelowPct) return 'critical';
  if (pct < settings.lowBelowPct) return 'low';
  return 'ok';
}

/** The tank status fields this model reads (`GET /transactions/inventory/status`). */
export interface TankLevelInput {
  capacity: number | string | null | undefined;
  currentVolume: number | string | null | undefined;
  daysOfCover?: number | string | null;
  waitingOnDecantation?: boolean;
}

export interface TankLevel {
  /** Whole percent of capacity (above 100 when book stock is over capacity); null without a capacity. */
  pct: number | null;
  /** Gauge fill, 0–100. */
  fill: number;
  tone: TankTone;
  /** Current stock, in the product unit (litres for fuel); never negative. */
  stock: number;
  capacity: number;
  /** Days the stock lasts at the recent selling rate; null without sales history. */
  daysOfCover: number | null;
  /** Book stock above capacity (open-shift sales not yet deducted). */
  overCapacity: boolean;
  /** A pending Decantation means the book stock is incomplete. */
  waitingOnDecantation: boolean;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function deriveTankLevel(row: TankLevelInput, settings: TankLevelSettings): TankLevel {
  const capacity = Math.max(0, num(row.capacity));
  const stock = Math.max(0, num(row.currentVolume));
  const exact = capacity > 0 ? (stock / capacity) * 100 : null;
  const cover =
    row.daysOfCover == null || !Number.isFinite(Number(row.daysOfCover))
      ? null
      : Number(row.daysOfCover);
  return {
    pct: exact === null ? null : Math.round(exact),
    fill: exact === null ? 0 : Math.min(100, exact),
    tone: tankTone(exact, settings),
    stock,
    capacity,
    daysOfCover: cover,
    overCapacity: exact !== null && exact > 100,
    waitingOnDecantation: row.waitingOnDecantation === true,
  };
}
