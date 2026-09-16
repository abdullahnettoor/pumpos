import { describe, it, expect } from 'vitest';
import { splitSaleLineTax } from './sale-tax.js';

const gstProduct = (cfg: Record<string, unknown> | null) => ({
  taxCategory: 'GST' as const,
  taxConfig: cfg as any,
});
const fuelProduct = (cfg: Record<string, unknown> | null) => ({
  taxCategory: 'FUEL_VAT' as const,
  taxConfig: cfg as any,
});

describe('splitSaleLineTax (T5)', () => {
  it('extracts GST from an MRP-inclusive merchandise line without changing the total', () => {
    const t = splitSaleLineTax(1180, gstProduct({ gst_rate: 18, hsn_code: '27101980' }));
    expect(t.taxCategory).toBe('GST');
    expect(Number(t.taxableAmount)).toBe(1000);
    expect(Number(t.cgst)).toBe(90);
    expect(Number(t.sgst)).toBe(90);
    expect(Number(t.vat)).toBe(0);
    expect(t.hsnCode).toBe('27101980');
    // Taxable + tax must reconstruct exactly what the customer paid.
    expect(Number(t.taxableAmount) + Number(t.cgst) + Number(t.sgst)).toBe(1180);
  });

  it('uses IGST for an inter-state sale', () => {
    const t = splitSaleLineTax(1180, gstProduct({ gst_rate: 18 }), true);
    expect(Number(t.igst)).toBe(180);
    expect(Number(t.cgst)).toBe(0);
  });

  it('adds GST on top when the product is priced tax-exclusive', () => {
    const t = splitSaleLineTax(1000, gstProduct({ gst_rate: 18, price_inclusive: false }));
    expect(Number(t.taxableAmount)).toBe(1000);
    expect(Number(t.cgst) + Number(t.sgst)).toBe(180);
  });

  it('extracts VAT from a fuel line and never populates GST', () => {
    const t = splitSaleLineTax(1000, fuelProduct({ vat_rate: 25 }));
    expect(t.taxCategory).toBe('FUEL_VAT');
    expect(Number(t.taxableAmount)).toBe(800);
    expect(Number(t.vat)).toBe(200);
    expect(Number(t.cgst)).toBe(0);
    expect(Number(t.sgst)).toBe(0);
    expect(Number(t.igst)).toBe(0);
  });

  it('yields a zero split with the full gross as taxable when no rate is configured', () => {
    const t = splitSaleLineTax(500, gstProduct(null));
    expect(Number(t.taxableAmount)).toBe(500);
    expect(Number(t.cgst)).toBe(0);
  });

  it('yields a zero split when the product cannot be resolved', () => {
    const t = splitSaleLineTax(500, null);
    expect(t.taxCategory).toBe('NON_TAXABLE');
    expect(Number(t.taxableAmount)).toBe(500);
  });
});
