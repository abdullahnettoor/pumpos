import { compareFuelPricesNewestFirst, localToInstant } from '@pump/shared';
import { toPaise } from '../../utils/ledgerWindow.js';
import { unknownOutcome } from '../../office-records/submitKeys.js';

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
  /**
   * The change into the current price; `null` when there was only one price.
   * `difference` is `to − from`, worked in whole paise.
   */
  lastChange: { from: number; to: number; difference: number } | null;
}

/** One price change, old → new, with the difference in whole paise. */
export function priceChange(from: number | string, to: number | string) {
  return {
    from: Number(from),
    to: Number(to),
    difference: (toPaise(to) - toPaise(from)) / 100,
  };
}

/**
 * Latest first: the API's order (`compareFuelPricesNewestFirst`, shared with
 * the SQL), so two prices effective at the same moment read the same here as
 * on the server.
 */
const newestFirst = (a: FuelPriceHistoryEntry, b: FuelPriceHistoryEntry): number =>
  compareFuelPricesNewestFirst(a, b);

/** Price history, the latest change first (a copy; the cache stays as served). */
export function sortNewestFirst<T extends FuelPriceHistoryEntry>(entries: T[]): T[] {
  return [...entries].sort(newestFirst);
}

/**
 * The fuel rows, in the order the API lists the fuels. The current price is
 * the API's: the price shift close sells at. The last change reads the history
 * in the API's order (the same tie-breakers), so it ends on that price.
 */
export function buildFuelPriceRows(
  current: CurrentFuelPrice[],
  history: FuelPriceHistoryEntry[],
  unitOf: (productId: string) => string | null | undefined,
): FuelPriceRow[] {
  return current.map((cp) => {
    const [latest, previous] = sortNewestFirst(history.filter((h) => h.productId === cp.productId));
    return {
      productId: cp.productId,
      productName: cp.productName,
      productCode: cp.productCode ?? null,
      unit: unitOf(cp.productId) || 'L',
      price: cp.effectiveFrom != null ? Number(cp.price) : null,
      effectiveFrom: cp.effectiveFrom,
      lastChange: latest && previous ? priceChange(previous.price, latest.price) : null,
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

/** What a price change sent: the body a retry must send again (#606). */
export interface FuelPriceAttempt {
  stationId: string;
  productId: string;
  price: number;
  effectiveFrom?: string | null;
}

/** A price change in flight or refused, as the card reads it (#606). */
export interface FuelPriceWriteVars {
  payload: FuelPriceAttempt;
}

/** A change of this station's prices, by fuel; null for another station's. */
export const fuelPriceWriteKey = (v: FuelPriceWriteVars, stationId: string): string | null =>
  v.payload.stationId === stationId ? v.payload.productId : null;

/**
 * The attempt to restore when a fuel's last change has an unknown outcome
 * (no answer, a timeout, a 5xx, a key conflict): its exact body, so a retry
 * reuses its Idempotency-Key. A decided refusal (a 4xx) starts fresh: null.
 */
export function unconfirmedAttempt(
  write: { state: 'saving' | 'failed'; error: unknown; variables: FuelPriceWriteVars } | undefined,
): FuelPriceAttempt | null {
  return write?.state === 'failed' && unknownOutcome(write.error) ? write.variables.payload : null;
}
