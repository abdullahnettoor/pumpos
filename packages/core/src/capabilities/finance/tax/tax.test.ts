import { describe, expect, it } from 'vitest';
import { computeTax, isInterState } from './index.js';

describe('computeTax', () => {
  it('splits GST into CGST+SGST intra-state', () => {
    const r = computeTax([{ taxCategory: 'GST', taxableAmount: 1000, gstRatePct: 18 }], { supplierStateCode: '29', buyerStateCode: '29' });
    expect(r.interState).toBe(false);
    expect(r.lines[0].cgst).toBe(90);
    expect(r.lines[0].sgst).toBe(90);
    expect(r.lines[0].igst).toBe(0);
    expect(r.lines[0].total).toBe(1180);
    expect(r.totals.grandTotal).toBe(1180);
  });

  it('uses IGST inter-state', () => {
    const r = computeTax([{ taxCategory: 'GST', taxableAmount: 1000, gstRatePct: 18 }], { supplierStateCode: '29', buyerStateCode: '27' });
    expect(r.interState).toBe(true);
    expect(r.lines[0].igst).toBe(180);
    expect(r.lines[0].cgst).toBe(0);
    expect(r.lines[0].total).toBe(1180);
  });

  it('defaults to intra-state when buyer state unknown', () => {
    expect(isInterState({ supplierStateCode: '29' })).toBe(false);
    const r = computeTax([{ taxCategory: 'GST', taxableAmount: 100, gstRatePct: 18 }], { supplierStateCode: '29' });
    expect(r.lines[0].cgst).toBe(9);
    expect(r.lines[0].sgst).toBe(9);
  });

  it('applies VAT for fuel (no GST split)', () => {
    const r = computeTax([{ taxCategory: 'FUEL_VAT', taxableAmount: 1000, vatRatePct: 25 }], { supplierStateCode: '29', buyerStateCode: '27' });
    expect(r.lines[0].vat).toBe(250);
    expect(r.lines[0].igst).toBe(0);
    expect(r.lines[0].total).toBe(1250);
  });

  it('charges nothing for EXEMPT / NON_TAXABLE', () => {
    const r = computeTax([
      { taxCategory: 'EXEMPT', taxableAmount: 500 },
      { taxCategory: 'NON_TAXABLE', taxableAmount: 300 },
    ], { supplierStateCode: '29', buyerStateCode: '29' });
    expect(r.totals.taxTotal).toBe(0);
    expect(r.totals.grandTotal).toBe(800);
  });

  it('aggregates totals and adds cess', () => {
    const r = computeTax([
      { taxCategory: 'GST', taxableAmount: 1000, gstRatePct: 18, cessPct: 1 },
      { taxCategory: 'FUEL_VAT', taxableAmount: 2000, vatRatePct: 20 },
    ], { supplierStateCode: '29', buyerStateCode: '29' });
    expect(r.lines[0].cess).toBe(10);
    expect(r.totals.cgst).toBe(90);
    expect(r.totals.sgst).toBe(90);
    expect(r.totals.vat).toBe(400);
    expect(r.totals.grandTotal).toBe(1000 + 180 + 10 + 2000 + 400);
  });
});
