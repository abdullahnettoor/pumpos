import { localToInstant } from '@pump/shared';

/**
 * Pricing › Fuels (#537): one row per fuel, built from the current prices and
 * the price history. Pure, so the figures are tested here, never in the screen.
 */

export interface CurrentFuelPrice {
  productId: string;
  productName: string;
  productCode?: string | null;
  /** 0 when no price has ever been recorded (the API's convention). */
  price: number | string;
  effectiveFrom: string | null;
}

export interface FuelPriceHistoryEntry {
  id: string;
  productId: string;
  price: number | string;
  effectiveFrom: string;
  createdAt?: string | null;
}

export interface FuelPriceRow {
  productId: string;
  productName: string;
  productCode: string | null;
  /** Sales unit (`L`, `kg`). */
  unit: string;
  /** `null` while no price has been recorded. */
  price: number | null;
  effectiveFrom: string | null;
  /** The change into the current price; `null` when there was only one price. */
  lastChange: { from: number; to: number } | null;
}

const time = (iso: string | null | undefined): number => (iso ? new Date(iso).getTime() : 0);

/**
 * Latest first: by effective time, then by when it was recorded, then by id,
 * so two prices effective at the same moment always read in the same order.
 */
const newestFirst = (a: FuelPriceHistoryEntry, b: FuelPriceHistoryEntry): number =>
  time(b.effectiveFrom) - time(a.effectiveFrom) ||
  time(b.createdAt) - time(a.createdAt) ||
  (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

/** Price history, the latest change first (a copy; the cache stays as served). */
export function sortNewestFirst<T extends FuelPriceHistoryEntry>(entries: T[]): T[] {
  return [...entries].sort(newestFirst);
}

/**
 * The fuel rows, in the order the API lists the fuels. When the history holds
 * the fuel's prices, the row reads its current price from the same ordered
 * list as the last change, so the two can never disagree on a tie.
 */
export function buildFuelPriceRows(
  current: CurrentFuelPrice[],
  history: FuelPriceHistoryEntry[],
  unitOf: (productId: string) => string | null | undefined,
): FuelPriceRow[] {
  return current.map((cp) => {
    const [latest, previous] = sortNewestFirst(history.filter((h) => h.productId === cp.productId));
    const price = latest
      ? Number(latest.price)
      : cp.effectiveFrom != null
        ? Number(cp.price)
        : null;
    return {
      productId: cp.productId,
      productName: cp.productName,
      productCode: cp.productCode ?? null,
      unit: unitOf(cp.productId) || 'L',
      price,
      effectiveFrom: latest ? latest.effectiveFrom : cp.effectiveFrom,
      lastChange:
        latest && previous ? { from: Number(previous.price), to: Number(latest.price) } : null,
    };
  });
}

/** `now` on the station's wall clock, as a `datetime-local` value (`YYYY-MM-DDTHH:MM`). */
export function stationDateTimeInput(now: Date, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** A `datetime-local` value read on the station's wall clock, as a UTC ISO instant. */
export function stationInputToIso(value: string, timeZone: string): string {
  const [date = '', hhmm = '00:00'] = value.split('T');
  return new Date(localToInstant(date, hhmm.slice(0, 5), timeZone)).toISOString();
}
