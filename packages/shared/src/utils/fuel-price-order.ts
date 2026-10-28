/**
 * The one order of a station's fuel prices, latest first (#537, #606): by
 * effective time, then when it was recorded, then id. The API's SQL
 * (`fuelPricesNewestFirst` in apps/api fuel-price-queries.ts) orders the same
 * way; change both together.
 *
 * Scheduled prices (#619): a price whose effective time is still ahead is
 * stored but not yet current. The current price is the latest *in effect*
 * (effective at or before now, by the server's clock): the price Pricing
 * shows and a shift opened now sells at. The API filters the same way
 * (`effective_from <= now`).
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

/** Epoch ms of `now`, from a Date or epoch ms. */
const ms = (now: Date | number): number => (typeof now === 'number' ? now : now.getTime());

/** Whether a price is in effect at `now`: its effective time is not still ahead. */
export function isFuelPriceInEffect(p: { effectiveFrom: string }, now: Date | number): boolean {
  return time(p.effectiveFrom) <= ms(now);
}

/** Whether a price is scheduled: recorded, but its effective time is still ahead of `now`. */
export function isScheduledFuelPrice(p: { effectiveFrom: string }, now: Date | number): boolean {
  return !isFuelPriceInEffect(p, now);
}

/**
 * Each product's current price at `now` (#619): the latest of its prices in
 * effect, in the one order. A product whose only prices are scheduled has
 * none yet.
 */
export function currentFuelPriceByProduct<T extends FuelPriceOrderKey & { productId: string }>(
  prices: readonly T[],
  now: Date | number,
): Map<string, T> {
  const current = new Map<string, T>();
  for (const p of [...prices]
    .filter((x) => isFuelPriceInEffect(x, now))
    .sort(compareFuelPricesNewestFirst)) {
    if (!current.has(p.productId)) current.set(p.productId, p);
  }
  return current;
}
