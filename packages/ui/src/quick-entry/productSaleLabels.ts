import type { SaleLabels } from '../query/patches/productSales.js';

/**
 * The names a Billed Sale's list row shows that the write's answer does not
 * carry (#606): the seller's, the saved customer's and each product's, from
 * the records the operator picked in the form.
 */
export function productSaleLabels(
  payload: { attendantId?: string | null; customerId?: string | null },
  lookups: {
    sellers: { userId: string; userName: string }[];
    products: { id: string; name: string }[];
    customers: { id: string; name: string }[];
  },
): SaleLabels {
  const productNames: Record<string, string> = {};
  for (const p of lookups.products) productNames[p.id] = p.name;
  return {
    attendantName: lookups.sellers.find((s) => s.userId === payload.attendantId)?.userName ?? null,
    customerName: payload.customerId
      ? (lookups.customers.find((c) => c.id === payload.customerId)?.name ?? null)
      : null,
    productNames,
  };
}
