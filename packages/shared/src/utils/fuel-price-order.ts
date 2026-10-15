/**
 * The one order of a station's fuel prices, latest first (#537, #606): by
 * effective time, then when it was recorded, then id. The API's SQL
 * (`fuelPricesNewestFirst` in apps/api fuel-price-queries.ts) orders the same
 * way; change both together. The latest is the current price: the price
 * Pricing shows and shift close sells at.
 */
export interface FuelPriceOrderKey {
  id: string;
  effectiveFrom: string;
  createdAt?: string | null;
}

const time = (iso: string | null | undefined): number => (iso ? new Date(iso).getTime() : 0);

/** Sort comparator: negative when `a` is the later (newer) price. */
export function compareFuelPricesNewestFirst(a: FuelPriceOrderKey, b: FuelPriceOrderKey): number {
  return (
    time(b.effectiveFrom) - time(a.effectiveFrom) ||
    time(b.createdAt) - time(a.createdAt) ||
    (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)
  );
}

/**
 * Whether `a` is provably later than `b` in that order, from what is known of
 * `b`. A later effective time proves it; an equal one needs `b`'s recorded
 * time and id, and without them nothing is proven (#606 review).
 */
export function isProvablyNewerFuelPrice(
  a: FuelPriceOrderKey,
  b: { effectiveFrom: string; createdAt?: string | null; id?: string | null },
): boolean {
  const ta = time(a.effectiveFrom);
  const tb = time(b.effectiveFrom);
  if (ta !== tb) return ta > tb;
  if (!b.id || !b.createdAt || !a.createdAt) return false;
  return compareFuelPricesNewestFirst(a, { ...b, id: b.id }) < 0;
}
