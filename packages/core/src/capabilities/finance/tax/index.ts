import type { TaxCategory } from '@pump/shared';

/**
 * Pure tax computation for Indian fuel retail. Fuel is VAT (outside GST);
 * lubricants/merchandise/services are GST — CGST+SGST intra-state, IGST
 * inter-state (decided by supplier vs buyer state code). EXEMPT / NON_TAXABLE
 * attract nothing. This is the single source of truth for both on-screen tax
 * previews and GST invoice generation (Phase T).
 */

export interface TaxLineInput {
  taxCategory: TaxCategory;
  /**
   * Line amount. Pre-tax (exclusive) by default; when `inclusive` is true this
   * is the tax-inclusive gross (e.g. retail MRP) and the taxable base is
   * back-calculated from it.
   */
  taxableAmount: number;
  gstRatePct?: number | null;
  vatRatePct?: number | null;
  cessPct?: number | null;
  /** Treat `taxableAmount` as tax-inclusive (MRP) and derive the taxable base. */
  inclusive?: boolean;
}

export interface TaxLineResult {
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  vat: number;
  cess: number;
  taxTotal: number;
  total: number;
}

export interface TaxTotals {
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  vat: number;
  cess: number;
  taxTotal: number;
  grandTotal: number;
}

export interface TaxComputation {
  lines: TaxLineResult[];
  totals: TaxTotals;
  /** True when GST lines are taxed as IGST (supplier state ≠ buyer state). */
  interState: boolean;
}

export interface TaxContext {
  supplierStateCode?: string | null;
  buyerStateCode?: string | null;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Inter-state only when BOTH state codes are known and differ. When the buyer
 * state is unknown (e.g. walk-in / B2C), GST is treated as intra-state
 * (CGST+SGST) — the safe default for a single-outlet sale.
 */
export function isInterState(ctx: TaxContext): boolean {
  const supplier = (ctx.supplierStateCode ?? '').trim();
  const buyer = (ctx.buyerStateCode ?? '').trim();
  return Boolean(supplier) && Boolean(buyer) && supplier !== buyer;
}

export function computeLineTax(line: TaxLineInput, interState: boolean): TaxLineResult {
  const gstRate = Math.max(0, line.gstRatePct ?? 0);
  const vatRate = Math.max(0, line.vatRatePct ?? 0);
  const cessRate = Math.max(0, line.cessPct ?? 0);

  // When the amount is tax-inclusive (retail MRP), back-calculate the taxable
  // base so tax is extracted from the price rather than added on top.
  let taxable = line.taxableAmount;
  if (line.inclusive) {
    let divisor = 1;
    if (line.taxCategory === 'GST') divisor = 1 + (gstRate + cessRate) / 100;
    else if (line.taxCategory === 'FUEL_VAT') divisor = 1 + vatRate / 100;
    taxable = divisor > 0 ? line.taxableAmount / divisor : line.taxableAmount;
  }
  taxable = round2(taxable);

  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  let vat = 0;
  let cess = 0;

  if (line.taxCategory === 'GST') {
    if (interState) {
      igst = round2((taxable * gstRate) / 100);
    } else {
      cgst = round2((taxable * gstRate) / 200);
      sgst = cgst;
    }
    cess = round2((taxable * cessRate) / 100);
  } else if (line.taxCategory === 'FUEL_VAT') {
    vat = round2((taxable * vatRate) / 100);
  }
  // EXEMPT / NON_TAXABLE → no tax.

  const taxTotal = round2(cgst + sgst + igst + vat + cess);
  return { taxableAmount: taxable, cgst, sgst, igst, vat, cess, taxTotal, total: round2(taxable + taxTotal) };
}

export function computeTax(lines: TaxLineInput[], ctx: TaxContext = {}): TaxComputation {
  const interState = isInterState(ctx);
  const results = lines.map((l) => computeLineTax(l, interState));
  const totals = results.reduce<TaxTotals>(
    (acc, r) => ({
      taxableAmount: round2(acc.taxableAmount + r.taxableAmount),
      cgst: round2(acc.cgst + r.cgst),
      sgst: round2(acc.sgst + r.sgst),
      igst: round2(acc.igst + r.igst),
      vat: round2(acc.vat + r.vat),
      cess: round2(acc.cess + r.cess),
      taxTotal: round2(acc.taxTotal + r.taxTotal),
      grandTotal: round2(acc.grandTotal + r.total),
    }),
    { taxableAmount: 0, cgst: 0, sgst: 0, igst: 0, vat: 0, cess: 0, taxTotal: 0, grandTotal: 0 },
  );
  return { lines: results, totals, interState };
}
