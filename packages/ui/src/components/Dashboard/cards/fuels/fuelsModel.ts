import { DAYS_OF_COVER_WINDOW, deriveTankLevel, shiftBusinessDate } from '@pump/shared';
import type {
  DecantationView,
  DensityTodayProductSummary,
  TankLevel,
  TankLevelSettings,
} from '@pump/shared';

/**
 * One tank in a fuel block: the shared tank-level model (#520) — tone from the
 * station's tank levels, the same ones the alerts bell and mobile use.
 */
export interface FuelTank extends TankLevel {
  id: string;
  name: string;
}

/** One row of `GET /transactions/inventory/status` (fields this card reads). */
export interface InventoryTankRow {
  id: string;
  name?: string | null;
  productId: string;
  capacity: number | string;
  currentVolume: number | string;
  daysOfCover?: number | null;
  waitingOnDecantation?: boolean;
}

export function deriveFuelTanks(
  rows: readonly InventoryTankRow[],
  productId: string,
  tankLevels: TankLevelSettings,
): FuelTank[] {
  return rows
    .filter((t) => t.productId === productId)
    .map((t) => ({
      id: String(t.id),
      name: String(t.name ?? ''),
      ...deriveTankLevel(t, tankLevels),
    }));
}

export const coverFallback = `cover after ${DAYS_OF_COVER_WINDOW} days of sales`;

export type DensityState =
  | {
      kind: 'recorded';
      density: number;
      tempC: number | null;
      observedDensity: number | null;
      at: string;
      change: DensityChange | null;
    }
  | {
      kind: 'jump';
      density: number;
      tempC: number | null;
      observedDensity: number | null;
      at: string;
      change: DensityChange;
    }
  | { kind: 'not-recorded'; last: number | null }
  | {
      kind: 'no-history';
      density: number;
      tempC: number | null;
      observedDensity: number | null;
      at: string;
    };

export interface DensityChange {
  delta: number;
  /** Business date of the reading compared against. */
  from: string;
}

/** Whether `from` is the day before `businessDate` (so it reads "vs yesterday"). */
export const isYesterday = (from: string, businessDate: string) =>
  from === shiftBusinessDate(businessDate, -1);

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
  const base = {
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

/** A fuel card gets the red outline for a critical tank or a density jump. */
export const needsAttention = (tanks: FuelTank[], density: DensityState | null) =>
  tanks.some((t) => t.tone === 'critical') || density?.kind === 'jump';

/** The tanker waiting to be measured for one fuel (quantity/time may be unknown). */
export interface PendingDecant {
  /** Litres per the linked purchase invoice; null when not linked yet. */
  qtyL: number | null;
  /** ISO instant the unload started (else the record was created). */
  since: string | null;
}

/**
 * Pending Decantation for a fuel, from the Decantation list (PENDING_MEASUREMENT).
 * The tank status endpoint only carries a boolean; quantity comes from the
 * linked invoice and time from the unload start.
 */
export function derivePendingDecant(
  decants: readonly DecantationView[],
  productId: string,
): PendingDecant | null {
  const mine = decants
    .filter(
      (d) => d.status === 'PENDING_MEASUREMENT' && d.lines.some((l) => l.productId === productId),
    )
    .sort((a, b) =>
      (a.unloadStartedAt ?? a.createdAt).localeCompare(b.unloadStartedAt ?? b.createdAt),
    );
  if (mine.length === 0) return null;
  let qty = 0;
  let known = false;
  for (const d of mine) {
    const q = d.links?.find((l) => l.productId === productId)?.invoiceQty;
    if (q != null) {
      qty += q;
      known = true;
    }
  }
  return { qtyL: known ? qty : null, since: mine[0].unloadStartedAt ?? mine[0].createdAt };
}

/** Plan purchase is offered only for a critical tank with nothing waiting to decant. */
export const shouldPlanPurchase = (tanks: FuelTank[]) =>
  tanks.some((t) => t.tone === 'critical') && !tanks.some((t) => t.waitingOnDecantation);

/**
 * Header swatch colour for a fuel, as in the prototype: Petrol (MS) brand,
 * Diesel (HSD) info, anything else (premium grades, CNG…) in a stable cycle.
 * Keyed on the product, not its list position, so a fuel keeps its colour
 * whatever order the API returns.
 */
const OTHER_SWATCHES = ['bg-warning-fg', 'bg-danger-fg', 'bg-ink-muted'] as const;
export function fuelSwatch(code: string, name: string, index: number): string {
  const key = `${code} ${name}`.toUpperCase();
  if (/\b(MS|PETROL)\b/.test(key.replace(/[^A-Z0-9]+/g, ' '))) return 'bg-brand';
  if (/\b(HSD|DIESEL)\b/.test(key.replace(/[^A-Z0-9]+/g, ' '))) return 'bg-info-fg';
  return OTHER_SWATCHES[index % OTHER_SWATCHES.length];
}
