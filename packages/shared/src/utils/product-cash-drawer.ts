import { compareNatural, dispenserLabel } from './natural-order.js';

/**
 * Which Drawer counts an Attendant's cash Product Sales (#419, Fix A).
 *
 * A Product Sale carries no Dispenser Unit, so an Attendant on more than one
 * DU has one pot of product cash and several Drawers. It is counted in ONE of
 * them: the Attendant's first assigned DU by DU code, in natural order (DU-2
 * before DU-10). Their other Drawers count no product cash.
 *
 * One rule, used by the server's `record-handover` and by every client
 * preview (the desktop Handover drawer, the mobile handover form), so the
 * figure an Attendant sees is the one the server records.
 */

/** One of the Attendant's DU assignments on the Shift. */
export interface ProductCashAssignment {
  duId?: string | null;
  duCode?: string | null;
  duName?: string | null;
}

/**
 * First by DU code (its name when it has none), naturally; then by name; then
 * by id, so two DUs sharing a code still resolve the same way everywhere.
 */
function compareDrawers(a: ProductCashAssignment, b: ProductCashAssignment): number {
  return (
    compareNatural(dispenserLabel(a), dispenserLabel(b)) ||
    compareNatural(a.duName, b.duName) ||
    String(a.duId).localeCompare(String(b.duId))
  );
}

/**
 * The assignment whose Drawer counts the Attendant's product cash, or null
 * when the Attendant holds no DU (staff with no Drawer: out of scope here).
 * Pass only this Attendant's assignments on this Shift.
 */
export function productCashOwner<T extends ProductCashAssignment>(
  assignments: readonly T[],
): T | null {
  let owner: T | null = null;
  for (const a of assignments) {
    if (!a.duId) continue;
    if (owner === null || compareDrawers(a, owner) < 0) owner = a;
  }
  return owner;
}

/** The DU id whose Drawer counts the Attendant's product cash, or null. */
export function productCashDrawer(assignments: readonly ProductCashAssignment[]): string | null {
  return productCashOwner(assignments)?.duId ?? null;
}

/**
 * The product cash one Drawer counts: all of it on the owning DU's Drawer,
 * nothing on the Attendant's other Drawers.
 */
export function drawerProductCash(input: {
  assignments: readonly ProductCashAssignment[];
  duId: string;
  productCash: number;
}): number {
  return productCashDrawer(input.assignments) === input.duId ? input.productCash : 0;
}
