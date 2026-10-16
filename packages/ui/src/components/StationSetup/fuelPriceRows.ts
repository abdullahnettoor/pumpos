import {
  compareFuelPricesNewestFirst,
  isFuelPriceInEffect,
  isScheduledFuelPrice,
  localToInstant,
} from '@pump/shared';
import { toPaise } from '../../utils/ledgerWindow.js';
import { formatClockInZone, formatShortDay } from '../../utils/format.js';
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
  /**
   * The next price change still ahead (#619): recorded, but not current until
   * its effective time. `null` when none is scheduled.
   */
  scheduled: { price: number; effectiveFrom: string } | null;
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

/** Epoch ms of an ISO instant. */
const at = (iso: string): number => new Date(iso).getTime();

/**
 * A product's next scheduled change (#619): the earliest effective time still
 * ahead of `now`; of the prices sharing that moment, the one the server will
 * read as current then (the one order).
 */
function nextScheduled<T extends FuelPriceHistoryEntry>(entries: T[], now: number): T | null {
  const ahead = sortNewestFirst(entries.filter((e) => isScheduledFuelPrice(e, now)));
  if (ahead.length === 0) return null;
  const first = Math.min(...ahead.map((e) => at(e.effectiveFrom)));
  return ahead.find((e) => at(e.effectiveFrom) === first) ?? null;
}

/**
 * The fuel rows, in the order the API lists the fuels. The current price is
 * the API's: the latest price in effect, the price a shift opened now sells
 * at. The last change reads the history in effect at `now`, in the API's
 * order (the same tie-breakers), and ends on that price. A change scheduled
 * for later is listed separately (#619).
 */
export function buildFuelPriceRows(
  current: CurrentFuelPrice[],
  history: FuelPriceHistoryEntry[],
  unitOf: (productId: string) => string | null | undefined,
  now: Date | number,
): FuelPriceRow[] {
  const nowMs = typeof now === 'number' ? now : now.getTime();
  return current.map((cp) => {
    const mine = history.filter((h) => h.productId === cp.productId);
    const inEffect = sortNewestFirst(mine.filter((h) => isFuelPriceInEffect(h, nowMs)));
    // The change into the current price: from the entry that is the current
    // price (if the history holds it), else from the latest in effect.
    const currentAt = cp.effectiveFrom
      ? inEffect.findIndex(
          (h) =>
            at(h.effectiveFrom) === at(cp.effectiveFrom!) && Number(h.price) === Number(cp.price),
        )
      : -1;
    const from = Math.max(currentAt, 0);
    const [latest, previous] = [inEffect[from], inEffect[from + 1]];
    const next = nextScheduled(mine, nowMs);
    return {
      productId: cp.productId,
      productName: cp.productName,
      productCode: cp.productCode ?? null,
      unit: unitOf(cp.productId) || 'L',
      price: cp.effectiveFrom != null ? Number(cp.price) : null,
      effectiveFrom: cp.effectiveFrom,
      lastChange: latest && previous ? priceChange(previous.price, latest.price) : null,
      scheduled: next ? { price: Number(next.price), effectiveFrom: next.effectiveFrom } : null,
    };
  });
}

/**
 * When the next scheduled price of any fuel takes effect (epoch ms), or null
 * when none is ahead of `now` (#619). The screens refresh the current prices
 * then, so a scheduled price takes over on time.
 */
export function nextScheduledPriceAt(
  history: readonly FuelPriceHistoryEntry[],
  now: number,
): number | null {
  let next: number | null = null;
  for (const h of history) {
    const t = at(h.effectiveFrom);
    if (t > now && (next == null || t < next)) next = t;
  }
  return next;
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

/**
 * Whether cached current prices were fetched before a scheduled price that has
 * since taken effect (#628 review): the cache still holds the old price, and
 * no timer is left to refresh it (a page that unmounted before the time and
 * remounted after it). `fetchedAt` is the current prices' fetch time (epoch
 * ms); 0 means nothing is cached.
 */
export function missedScheduledPrice(
  history: readonly FuelPriceHistoryEntry[],
  fetchedAt: number,
  now: number,
): boolean {
  if (fetchedAt <= 0) return false;
  return history.some((h) => {
    const t = at(h.effectiveFrom);
    return t > fetchedAt && t <= now;
  });
}

/** A price's effective time on the station clock, short: `Fri 16 Oct, 10:00 am` (#619). */
export function formatPriceTime(iso: string, timeZone: string): string {
  const date = stationDateTimeInput(new Date(iso), timeZone).slice(0, 10);
  return `${formatShortDay(date)}, ${formatClockInZone(iso, timeZone)}`;
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
