import { z } from 'zod';
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

/**
 * Whether a product has an MRP a Handover Product Sale can be priced at: a
 * selling price above zero, the server's own rule (core
 * `record-merchandise-handover`, "Product has no selling price set").
 */
export const hasMrp = (product: PricedProduct | undefined): boolean =>
  product?.sellingPrice != null && Number(product.sellingPrice) > 0;

/** The price a product picker shows: its MRP, or that it has none. */
export const mrpLabel = (
  product: PricedProduct,
  format: (amount: number | string) => string,
): string => (hasMrp(product) ? `MRP ${format(product.sellingPrice ?? 0)}` : 'No price set');

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

/**
 * The lines (by index) whose product has no MRP (#638). The server refuses a
 * sale with such a line, so the form blocks it rather than failing on save. A
 * line with no product picked yet is not one of them.
 */
export function linesWithoutMrp(
  rows: DraftLine[],
  productById: Record<string, PricedProduct | undefined>,
): number[] {
  return rows.flatMap((r, i) =>
    r.productId && productById[r.productId] && !hasMrp(productById[r.productId]) ? [i] : [],
  );
}

/** Why Save is disabled while lines lack an MRP; null when none does. */
export function noMrpReason(missing: number, canSetMrp: boolean): string | null {
  if (missing === 0) return null;
  const what = missing === 1 ? 'An item has no MRP' : `${missing} items have no MRP`;
  return `${what}. ${canSetMrp ? 'Use Set MRP on it first.' : 'Ask your Owner or Manager to set an MRP.'}`;
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

/** The form's values: what the operator typed, before it is parsed. */
export interface HandoverProductSaleFormValues {
  attendantId: string;
  lines: DraftLine[];
  /** The card / UPI part of the sale, rupees as typed ('' = none). */
  nonCash: string;
}

/**
 * The form's rules (React Hook Form + Zod, through `useZodForm`): an employee,
 * at least one product with a quantity, every picked product with an MRP (the
 * server's rule), and a card / UPI part that is an amount no larger than the
 * sale total. `totalOf` prices the lines and `missingMrp` lists the lines
 * without an MRP (the products' own configuration), so the schema is built per
 * product list.
 */
export function handoverProductSaleSchema(
  totalOf: (lines: DraftLine[]) => number,
  missingMrp: (lines: DraftLine[]) => number[] = () => [],
) {
  return z
    .object({
      attendantId: z.string().min(1, 'Select the employee who made the sales.'),
      lines: z
        .array(z.object({ productId: z.string(), quantity: z.string() }))
        .refine((lines) => saleLines(lines).length > 0, 'Add at least one product with a quantity.')
        .refine((lines) => missingMrp(lines).length === 0, 'Set an MRP for every item first.'),
      nonCash: z
        .string()
        .refine(
          (v) => v.trim() === '' || (Number.isFinite(Number(v)) && Number(v) >= 0),
          'Enter the card/UPI part as an amount.',
        ),
    })
    .superRefine((v, ctx) => {
      if (toPaise(Number(v.nonCash) || 0) > toPaise(totalOf(v.lines))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['nonCash'],
          message: 'The card/UPI part cannot be more than the sale total.',
        });
      }
    });
}

/**
 * The names a saved sale's list row shows that the write's answer does not
 * carry (#606): the employee's and each product's, from the records picked.
 */
export function saleLabels(
  attendantId: string,
  sellers: { id: string; name: string }[],
  productById: Record<string, { name: string }>,
): { attendantName: string | null; productNames: Record<string, string> } {
  const productNames: Record<string, string> = {};
  for (const [id, p] of Object.entries(productById)) productNames[id] = p.name;
  return {
    attendantName: sellers.find((s) => s.id === attendantId)?.name ?? null,
    productNames,
  };
}
