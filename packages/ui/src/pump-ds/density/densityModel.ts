import { shiftBusinessDate, type DensityTodayProductSummary } from '@pump/shared';
import { MINUS, formatClockInZone, formatDayMonth } from '../../utils/format.js';

/**
 * One density reading, shown the same way everywhere (#521): the Dashboard
 * Fuels card and the Inventory density tab both derive a `DensityState` and
 * format it here. The jump tolerance is always the station's
 * (`resolveDecantationSettings(...).densityToleranceKgM3`); this module has
 * no default of its own.
 */

export interface DensityChange {
  delta: number;
  /** Business date of the reading compared against. */
  from: string;
}

interface Recorded {
  density: number;
  tempC: number | null;
  observedDensity: number | null;
  /** ISO instant the reading was taken. */
  at: string;
}

export type DensityState =
  | ({ kind: 'recorded'; change: DensityChange | null } & Recorded)
  | ({ kind: 'jump'; change: DensityChange } & Recorded)
  | ({ kind: 'no-history' } & Recorded)
  | { kind: 'not-recorded'; last: number | null };

/** The two states that carry a word, and their tone. */
export const DENSITY_FLAG = {
  jump: { label: 'Unexplained jump', tone: 'danger' },
  missing: { label: 'Not recorded', tone: 'warning' },
} as const;

export type DensityFlag = (typeof DENSITY_FLAG)[keyof typeof DENSITY_FLAG];

/**
 * Density state for one fuel on a business day. A change beyond the station
 * tolerance is a jump unless a Decantation reading landed that day (a new load
 * legitimately moves it).
 */
export function deriveDensityState(
  p: DensityTodayProductSummary | undefined,
  businessDate: string,
  toleranceKgM3: number,
): DensityState {
  if (!p) return { kind: 'not-recorded', last: null };
  const earlier = [...p.trend14d]
    .reverse()
    .find((t) => t.date < businessDate && t.density15 != null);
  const r = p.latestToday;
  if (!r) return { kind: 'not-recorded', last: earlier?.density15 ?? null };
  const base: Recorded = {
    density: r.density15,
    tempC: r.observedTempC ?? null,
    observedDensity: r.observedDensity ?? null,
    at: r.recordedAt,
  };
  if (!earlier) return { kind: 'no-history', ...base };
  const change: DensityChange = {
    delta: Math.round((r.density15 - (earlier.density15 as number)) * 10) / 10,
    from: earlier.date,
  };
  const explained = p.lastReadings.some(
    (x) => x.businessDate === businessDate && x.kind === 'DECANTATION',
  );
  if (Math.abs(change.delta) > toleranceKgM3 && !explained)
    return { kind: 'jump', ...base, change };
  return { kind: 'recorded', ...base, change };
}

/** Density in kg/m³ to one decimal: `741.2`. */
export const formatDensity = (v: number): string => v.toFixed(1);

/** A density change to one decimal, signed, with a true minus: `+0.6`, `−5.3`. */
export function formatDensityDelta(delta: number): string {
  const shown = Math.abs(delta).toFixed(1);
  if (shown === '0.0') return shown;
  return `${delta > 0 ? '+' : MINUS}${shown}`;
}

/** Temperature with at most one decimal: `30 °C`, `28.5 °C`. */
export const formatTempC = (t: number): string => `${Math.round(t * 10) / 10} °C`;

/** Whether `from` is the day before `businessDate` (so it reads "vs yday"). */
export const isYesterday = (from: string, businessDate: string) =>
  from === shiftBusinessDate(businessDate, -1);

export interface DensityReadingDisplay {
  status: DensityState['kind'];
  /** Value at 15 °C; null when not recorded. */
  value: string | null;
  /** `731.5 at 30 °C · 6:30 am` (station time), or `last 739.0` when not recorded. */
  detail: string;
  /** `+0.6 vs yday`, `first reading`; null when not recorded. */
  change: string | null;
  flag: DensityFlag | null;
}

export interface DensityFormatContext {
  /** The station's IANA timezone (from its settings); never the device's. */
  timeZone?: string;
  /** The business date the reading is read against ("vs yday"). */
  businessDate: string;
}

export function formatDensityReading(
  state: DensityState,
  { timeZone, businessDate }: DensityFormatContext,
): DensityReadingDisplay {
  if (state.kind === 'not-recorded') {
    return {
      status: state.kind,
      value: null,
      detail: state.last != null ? `last ${formatDensity(state.last)}` : 'no reading yet',
      change: null,
      flag: DENSITY_FLAG.missing,
    };
  }
  const observed =
    state.observedDensity != null
      ? state.tempC != null
        ? `${formatDensity(state.observedDensity)} at ${formatTempC(state.tempC)}`
        : formatDensity(state.observedDensity)
      : null;
  const detail = [observed, formatClockInZone(state.at, timeZone)].filter(Boolean).join(' · ');
  const change =
    state.kind === 'no-history' || !state.change
      ? 'first reading'
      : `${formatDensityDelta(state.change.delta)} vs ${
          isYesterday(state.change.from, businessDate) ? 'yday' : formatDayMonth(state.change.from)
        }`;
  return {
    status: state.kind,
    value: formatDensity(state.density),
    detail,
    change,
    flag: state.kind === 'jump' ? DENSITY_FLAG.jump : null,
  };
}
