import type { TaxCategory } from '@pump/shared';
import { computeLineTax } from '../finance/tax/index.js';
import type { SaleLineTax } from './ports.js';

/** The product attributes needed to split a sale line's tax. */
export interface SaleTaxProduct {
  taxCategory: TaxCategory;
  taxConfig?: {
    gst_rate?: number | null;
    vat_rate?: number | null;
    cess?: number | null;
    hsn_code?: string | null;
    price_inclusive?: boolean | null;
  } | null;
}

const ZERO: SaleLineTax = {
  taxCategory: 'NON_TAXABLE',
  gstRate: null,
  vatRate: null,
  cessRate: null,
  hsnCode: null,
  taxableAmount: '0',
  cgst: '0',
  sgst: '0',
  igst: '0',
  vat: '0',
  cess: '0',
};

/**
 * T5 — split a sale line's **gross** (what the customer actually pays) into
 * taxable value + tax components, and freeze them on the line.
 *
 * Retail fuel and merchandise are both sold at an all-in price: the pump rate
 * includes VAT and the MRP includes GST. So tax is always **extracted** from the
 * gross rather than added on top — which also guarantees the line total is
 * unchanged by this split (no drift against what was charged). A product can opt
 * out with `tax_config.price_inclusive = false`, in which case the gross is
 * treated as pre-tax and the tax sits on top, exactly as the invoice path does.
 *
 * A product with no usable rate yields a zero split with the full gross as the
 * taxable value, so untaxed/EXEMPT items behave as before.
 */
export function splitSaleLineTax(
  gross: number,
  product: SaleTaxProduct | null,
  interState = false,
): SaleLineTax {
  if (!product) return { ...ZERO, taxableAmount: String(round2(gross)) };

  const cfg = product.taxConfig ?? {};
  const gstRate = product.taxCategory === 'GST' ? num(cfg.gst_rate) : null;
  const vatRate = product.taxCategory === 'FUEL_VAT' ? num(cfg.vat_rate) : null;
  const cessRate = product.taxCategory === 'GST' ? num(cfg.cess) : null;
  const hsnCode = cfg.hsn_code ? String(cfg.hsn_code) : null;

  const hasRate = (gstRate ?? 0) > 0 || (vatRate ?? 0) > 0 || (cessRate ?? 0) > 0;
  if (!hasRate) {
    return {
      ...ZERO,
      taxCategory: product.taxCategory,
      hsnCode,
      taxableAmount: String(round2(gross)),
    };
  }

  const inclusive = cfg.price_inclusive !== false;
  const r = computeLineTax(
    {
      taxCategory: product.taxCategory,
      taxableAmount: gross,
      gstRatePct: gstRate,
      vatRatePct: vatRate,
      cessPct: cessRate,
      inclusive,
    },
    interState,
  );

  return {
    taxCategory: product.taxCategory,
    gstRate: gstRate != null ? String(gstRate) : null,
    vatRate: vatRate != null ? String(vatRate) : null,
    cessRate: cessRate != null ? String(cessRate) : null,
    hsnCode,
    taxableAmount: String(r.taxableAmount),
    cgst: String(r.cgst),
    sgst: String(r.sgst),
    igst: String(r.igst),
    vat: String(r.vat),
    cess: String(r.cess),
  };
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
