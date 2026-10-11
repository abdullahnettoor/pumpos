import { num, productCategoryOf, round2, type ProductType } from '@pump/shared';

/**
 * The sales figures a Shift Summary snapshot carries beyond the fuel totals the
 * close writes: Product Sales, the payment split and the Shift's total sales.
 * Pure (no I/O): the projection reads the rows, this fixes what they mean, so
 * the mobile Shift Summary, its Shift rows and the PDF read ONE set of figures
 * instead of each re-deriving them. Added to the snapshot additively when the
 * Shift Summary is composed; snapshots frozen earlier lack them and readers
 * fall back (the DSSR compose did the same for its later fields).
 */

/** One product's Product Sales in the Shift, grouped by product id. */
export interface ShiftProductSaleLine {
  productId: string;
  productName: string;
  /** The product's category (its `productType`); null when the product is unknown. */
  productType: ProductType | null;
  quantity: number;
  value: number;
}

export interface ShiftProductSales {
  /** Σ sale totals (what the DSSR counts); tax can put it above the line sum. */
  total: number;
  lines: ShiftProductSaleLine[];
}

export interface ShiftPayments {
  cash: number;
  upi: number;
  card: number;
  credit: number;
  /**
   * Σ the Shift's OMC Card Sales: fuel paid by an Oil Marketing Company card,
   * settled to the OMC Wallet (never Drawer cash, never a receivable). Added to
   * the snapshot later, so a snapshot frozen before it lacks the key.
   */
  omcCard?: number;
}

interface ProductRow {
  productId?: string | null;
  productName?: string | null;
  productType?: unknown;
  quantity?: number | string | null;
  lineTotal?: number | string | null;
}

/**
 * Product Sales from the Shift's non-fuel sales: one line per product id (two
 * products sharing a name stay two lines), largest value first.
 */
export function composeShiftProductSales(
  rows: readonly ProductRow[],
  salesTotal: number,
): ShiftProductSales {
  const byProduct = new Map<string, ShiftProductSaleLine>();
  for (const r of rows) {
    const productId = r.productId ?? '';
    const line = byProduct.get(productId) ?? {
      productId,
      productName: r.productName ?? 'Product',
      productType: productCategoryOf(r.productType),
      quantity: 0,
      value: 0,
    };
    line.quantity += num(r.quantity);
    line.value += num(r.lineTotal);
    byProduct.set(productId, line);
  }
  const lines = [...byProduct.values()]
    .map((l) => ({ ...l, quantity: round2(l.quantity), value: round2(l.value) }))
    .sort((a, b) => b.value - a.value || a.productName.localeCompare(b.productName));
  return { total: round2(num(salesTotal)), lines };
}

interface HandoverRow {
  cardHandedOver?: unknown;
  upiHandedOver?: unknown;
  creditHandedOver?: unknown;
}

/**
 * How the Shift was paid, as declared: cash the Drawers took (floats excluded),
 * card and UPI from the Handovers, credit from the Shift's credit sales (else
 * what the Handovers declared) and OMC Card Sales from the OMC ledger rows. No
 * residual bucket: money no figure accounts for is not invented here (an
 * attendant shortage is the Drawer variance, shown by the reader as its own
 * line, not a payment method).
 */
export function composeShiftPayments(input: {
  cashSales: number;
  handovers: readonly HandoverRow[];
  creditSalesTotal: number;
  /** Σ the Shift's OMC Card Sales. */
  omcCardTotal: number;
}): ShiftPayments {
  const sum = (pick: (h: HandoverRow) => unknown) =>
    round2(input.handovers.reduce((s, h) => s + num(pick(h)), 0));
  const credit =
    num(input.creditSalesTotal) > 0 ? num(input.creditSalesTotal) : sum((h) => h.creditHandedOver);
  return {
    cash: round2(num(input.cashSales)),
    upi: sum((h) => h.upiHandedOver),
    card: sum((h) => h.cardHandedOver),
    credit: round2(credit),
    omcCard: round2(num(input.omcCardTotal)),
  };
}

/** Total sales of a Shift: fuel from the nozzle readings plus Product Sales. */
export const composeShiftTotalSales = (fuelSalesValue: number, productSalesTotal: number) =>
  round2(num(fuelSalesValue) + num(productSalesTotal));
