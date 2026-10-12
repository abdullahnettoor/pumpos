import { formatDaysOfCover, DAYS_OF_COVER_WINDOW } from '@pump/shared';
import type { DensityTodayProductSummary } from '@pump/shared';

/**
 * Tank fill thresholds for the Fuels card (spec #505): red below 25 %, amber
 * below 40 %. Deliberately not `TANK_LEVEL` (utils/stock.ts, 15/35), which
 * drives the alerts bell and Inventory.
 */
export const TANK_RED_BELOW = 25;
export const TANK_AMBER_BELOW = 40;

export type TankTone = 'red' | 'amber' | 'ok' | 'unknown';

export const tankTone = (pct: number | null): TankTone =>
  pct === null ? 'unknown' : pct < TANK_RED_BELOW ? 'red' : pct < TANK_AMBER_BELOW ? 'amber' : 'ok';

export interface FuelTank {
  id: string;
  name: string;
  /** 0–100+ percent of capacity; null when the tank has no capacity. */
  pct: number | null;
  tone: TankTone;
  /** Tube fill 0–100. */
  fill: number;
  capacityKl: number;
  /** "2.6 days"; '' when there is no sales history. */
  cover: string;
  waitingOnDecantation: boolean;
}

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export function deriveFuelTanks(rows: readonly any[], productId: string): FuelTank[] {
  return rows
    .filter((t) => t.productId === productId)
    .map((t) => {
      const capacity = num(t.capacity);
      const volume = Math.max(0, num(t.currentVolume));
      const pct = capacity > 0 ? (volume / capacity) * 100 : null;
      return {
        id: String(t.id),
        name: String(t.name ?? ''),
        pct: pct === null ? null : Math.round(pct),
        tone: tankTone(pct),
        fill: pct === null ? 0 : Math.min(100, pct),
        capacityKl: capacity / 1000,
        cover: formatDaysOfCover(t.daysOfCover),
        waitingOnDecantation: t.waitingOnDecantation === true,
      };
    });
}

export const coverFallback = `cover after ${DAYS_OF_COVER_WINDOW} days of sales`;

export type DensityState =
  | {
      kind: 'recorded';
      density: number;
      tempC: number | null;
      at: string;
      change: DensityChange | null;
    }
  | { kind: 'jump'; density: number; tempC: number | null; at: string; change: DensityChange }
  | { kind: 'not-recorded'; last: number | null }
  | { kind: 'no-history'; density: number; tempC: number | null; at: string };

export interface DensityChange {
  delta: number;
  /** Business date of the reading compared against. */
  from: string;
}

const shiftDate = (date: string, days: number): string => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

/** Whether `from` is the day before `businessDate` (so it reads "vs yesterday"). */
export const isYesterday = (from: string, businessDate: string) =>
  from === shiftDate(businessDate, -1);

/**
 * Density state for one fuel. A change beyond the station tolerance is a jump
 * unless a Decantation reading landed today (a new load legitimately moves it).
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
  const base = { density: r.density15, tempC: r.observedTempC ?? null, at: r.recordedAt };
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

/** A fuel card gets the red outline for a low tank or a density jump. */
export const needsAttention = (tanks: FuelTank[], density: DensityState | null) =>
  tanks.some((t) => t.tone === 'red') || density?.kind === 'jump';
