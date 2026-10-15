import { toPaise } from '../../utils/ledgerWindow.js';

/**
 * The Handover Product Sale form's figures (#533): each line's tax split from
 * the product's own configuration, the sale total, and the cash it puts in the
 * employee's Drawer. Pure, so the drawer only lays them out. The server
 * re-prices every line (core `computeLineTax`); this is the preview.
 */

/** The product fields the preview reads. */
export interface PricedProduct {
  sellingPrice?: number | string | null;
  taxCategory?: string | null;
  taxConfig?: {
    gst_rate?: number | string;
    vat_rate?: number | string;
    price_inclusive?: boolean;
  } | null;
}

export interface LineTax {
  taxable: number;
  tax: number;
  total: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** One line's taxable value, tax and total (mirrors core `computeLineTax`). */
export function lineTax(product: PricedProduct | undefined, qty: number): LineTax {
  const price = product?.sellingPrice != null ? Number(product.sellingPrice) : 0;
  const gross = qty * price;
  const cat = product?.taxCategory || 'GST';
  const rate =
    cat === 'GST'
      ? Number(product?.taxConfig?.gst_rate ?? 0)
      : cat === 'FUEL_VAT'
        ? Number(product?.taxConfig?.vat_rate ?? 0)
        : 0;
  const inclusive = product?.taxConfig?.price_inclusive !== false;
  if (rate > 0 && (cat === 'GST' || cat === 'FUEL_VAT')) {
    if (inclusive) {
      const taxable = gross / (1 + rate / 100);
      return { taxable: round2(taxable), tax: round2(gross - taxable), total: round2(gross) };
    }
    const tax = gross * (rate / 100);
    return { taxable: round2(gross), tax: round2(tax), total: round2(gross + tax) };
  }
  return { taxable: round2(gross), tax: 0, total: round2(gross) };
}

export interface DraftLine {
  productId: string;
  quantity: string;
}

/** The form's lines a save sends: a product and a positive quantity. */
export function saleLines(rows: DraftLine[]): { productId: string; quantity: number }[] {
  return rows
    .filter((r) => r.productId && Number(r.quantity) > 0)
    .map((r) => ({ productId: r.productId, quantity: Number(r.quantity) }));
}

/** Σ of the lines, in whole paise so the total is the sum of the lines shown. */
export function draftTotals(
  rows: DraftLine[],
  productById: Record<string, PricedProduct | undefined>,
): LineTax {
  let taxable = 0;
  let tax = 0;
  let total = 0;
  for (const line of saleLines(rows)) {
    const product = productById[line.productId];
    if (!product) continue;
    const t = lineTax(product, line.quantity);
    taxable += toPaise(t.taxable);
    tax += toPaise(t.tax);
    total += toPaise(t.total);
  }
  return { taxable: taxable / 100, tax: tax / 100, total: total / 100 };
}

/** The cash the sale puts in the Drawer: the total less the card/UPI part, never below zero. */
export const cashToDrawer = (total: number, nonCash: number): number =>
  Math.max(0, (toPaise(total) - toPaise(nonCash)) / 100);

/** Why the form cannot be saved yet, or null. */
export function draftError(input: {
  attendantId: string;
  rows: DraftLine[];
  total: number;
  nonCash: number;
}): string | null {
  if (!input.attendantId) return 'Select the employee who made the sales.';
  if (saleLines(input.rows).length === 0) return 'Add at least one product with a quantity.';
  if (toPaise(input.nonCash) > toPaise(input.total)) {
    return 'The card/UPI part cannot be more than the sale total.';
  }
  return null;
}
