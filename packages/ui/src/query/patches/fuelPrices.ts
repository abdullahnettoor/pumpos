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
 * not patched; it recomputes from the history with `priceChange`.
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
 * The product's current price, as the server picks it: the latest of its
 * prices in the history order. So a backdated change, or an answer that
 * arrives after a newer save of the same fuel (out of order), leaves the
 * current price alone. `history` must already hold the answer
 * (`withRecordedPriceInHistory`); without a cached history, an answer is
 * current only if it takes effect at or after the cached current price.
 */
export function withRecordedCurrentPrice<T extends CurrentFuelPrice>(
  current: T[],
  answer: RecordedFuelPrice,
  history: FuelPriceHistoryEntry[] | undefined,
): T[] {
  const at = current.findIndex((c) => c.productId === answer.productId);
  if (at < 0) return current;
  const row = current[at];
  const latest = history
    ? sortNewestFirst(history.filter((h) => h.productId === answer.productId))[0]
    : undefined;
  const isCurrent = history
    ? latest?.id === answer.id
    : !row.effectiveFrom || Date.parse(answer.effectiveFrom) >= Date.parse(row.effectiveFrom);
  if (!isCurrent) return current;
  const price = Number(answer.price);
  if (Number(row.price) === price && row.effectiveFrom === answer.effectiveFrom) return current;
  const next = [...current];
  next[at] = { ...row, price, effectiveFrom: answer.effectiveFrom };
  return next;
}
