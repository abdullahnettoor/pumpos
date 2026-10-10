/**
 * Pure composition of the Product Sales included in a Shift Summary. The
 * projection supplies rows already grouped by product id; category fields are
 * optional so snapshots produced before #392 remain valid.
 */

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export interface ShiftProductSaleLine {
  productId: string;
  productName: string;
  productType: string;
  category: string | null;
  quantity: number;
  value: number;
}

export interface ShiftProductSales {
  total: number;
  lines: ShiftProductSaleLine[];
}

interface ProductRow {
  productId?: string | null;
  productName?: string | null;
  productType?: string | null;
  category?: string | null;
  quantity?: number | string | null;
  lineTotal?: number | string | null;
}

/** Normalize a Shift Summary's grouped product-sale lines. */
export function composeShiftProductSales(
  rows: readonly ProductRow[],
  salesTotal: number,
): ShiftProductSales {
  const lines = rows.map((row) => ({
    productId: row.productId ?? '',
    productName: row.productName ?? 'Product',
    productType: row.productType || 'OTHER',
    category: row.category ?? null,
    quantity: round2(num(row.quantity)),
    value: round2(num(row.lineTotal)),
  }));
  return { total: round2(num(salesTotal)), lines };
}
