import { isFuelPriceInEffect, isProvablyNewerFuelPrice } from '@pump/shared';
import {
  sortNewestFirst,
  type CurrentFuelPrice,
  type FuelPriceHistoryEntry,
} from '../../components/StationSetup/fuelPriceRows.js';

/**
 * Patches for Pricing › Fuels (#606) from the change-price answer
 * (POST /setup/pricing → the recorded `FuelPrice`).
 *
 * Only what the server returned is written: the new price's id, price,
 * effective-from and created-at. The product's name and code come from the
 * cached current-price row (the same product). The card's "last change" is
 * not patched; it recomputes from the history with `priceChange`. Order is the
 * server's (`compareFuelPricesNewestFirst`, @pump/shared).
 */

/** What POST /setup/pricing answers. */
export interface RecordedFuelPrice {
  id: string;
  stationId: string;
  productId: string;
  price: string | number;
  effectiveFrom: string;
  createdAt: string;
}

/** A row of GET /setup/pricing/history. */
export interface FuelPriceHistoryRow extends FuelPriceHistoryEntry {
  productName?: string | null;
  productCode?: string | null;
}

/**
 * The recorded price in the price history, in the server's order (latest
 * effective first, then latest recorded, then id). A replayed answer is not
 * listed twice.
 */
export function withRecordedPriceInHistory<T extends FuelPriceHistoryRow>(
  history: T[],
  answer: RecordedFuelPrice,
  labels: { productName: string | null; productCode: string | null },
): (T | FuelPriceHistoryRow)[] {
  if (history.some((h) => h.id === answer.id)) return history;
  const row: FuelPriceHistoryRow = {
    id: answer.id,
    productId: answer.productId,
    productName: labels.productName,
    productCode: labels.productCode,
    price: answer.price,
    effectiveFrom: answer.effectiveFrom,
    createdAt: answer.createdAt,
  };
  return sortNewestFirst<FuelPriceHistoryRow>([...history, row]);
}

/**
 * The product's current price, replaced by the answer only when the cache
 * proves the server now reads the answer as current (#606 review): it must be
 * provably later, in the server's order (`isProvablyNewerFuelPrice`), than
 * both the cached current price and the latest cached history entry of the
 * product. The cached current price is known by its effective time, plus the
 * recorded time and id of the history entry that matches it, when one does.
 * Anything unproven (an equal-time replay with no history, a stale history, a
 * backdated or out-of-order answer) is left to the refetch.
 *
 * A scheduled price (#619), effective after `now`, is not current on the
 * server until its time, so it never replaces the current price here: it
 * joins the history only. Likewise, only history entries in effect at `now`
 * are weighed against it.
 *
 * `history` is the cached history *before* the answer joined it, or undefined
 * when none is cached.
 */
export function withRecordedCurrentPrice<T extends CurrentFuelPrice>(
  current: T[],
  answer: RecordedFuelPrice,
  history: FuelPriceHistoryEntry[] | undefined,
  now: Date | number,
): T[] {
  const at = current.findIndex((c) => c.productId === answer.productId);
  if (at < 0) return current;
  if (!isFuelPriceInEffect(answer, now)) return current;
  const row = current[at];
  const mine = sortNewestFirst(
    (history ?? []).filter(
      (h) => h.productId === answer.productId && h.id !== answer.id && isFuelPriceInEffect(h, now),
    ),
  );
  const key = { id: answer.id, effectiveFrom: answer.effectiveFrom, createdAt: answer.createdAt };
  if (row.effectiveFrom) {
    // The history entry that is the cached current price, if the history holds it.
    const matched = mine.find(
      (h) => h.effectiveFrom === row.effectiveFrom && Number(h.price) === Number(row.price),
    );
    const known = matched
      ? { effectiveFrom: matched.effectiveFrom, createdAt: matched.createdAt, id: matched.id }
      : { effectiveFrom: row.effectiveFrom };
    if (!isProvablyNewerFuelPrice(key, known)) return current;
  }
  if (mine[0] && !isProvablyNewerFuelPrice(key, mine[0])) return current;
  const next = [...current];
  next[at] = { ...row, price: Number(answer.price), effectiveFrom: answer.effectiveFrom };
  return next;
}
