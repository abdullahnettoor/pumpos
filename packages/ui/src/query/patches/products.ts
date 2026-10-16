/**
 * Patches for the product list (`queryKeys.products()`) from a product edit's
 * own answer (PUT /setup/products/:id → the updated `Product`).
 *
 * Only the MRP is written (#638): a Handover Product Sale line waiting on
 * "Set MRP" reads the new price straight away, before the background refresh.
 */

/** The fields of PUT /setup/products/:id's answer this patch reads. */
export interface AnsweredProduct {
  id: string;
  sellingPrice?: number | string | null;
}

/**
 * The list with the answered product's MRP. Unchanged (the same array) when the
 * product is not cached or already reads that price, so nothing re-renders.
 */
export function withProductPrice<T extends { id: string; sellingPrice?: number | string | null }>(
  list: T[],
  answer: AnsweredProduct,
): T[] {
  const sellingPrice = answer.sellingPrice ?? null;
  const at = list.findIndex((p) => p.id === answer.id);
  if (at < 0 || (list[at].sellingPrice ?? null) === sellingPrice) return list;
  const next = [...list];
  next[at] = { ...list[at], sellingPrice };
  return next;
}
