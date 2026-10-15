import { describe, expect, it } from 'vitest';
import { attendantTotals, salesTaxTotals } from './reportTotals.js';

describe('salesTaxTotals (#531)', () => {
  it('adds the GST lines’ CGST, SGST, IGST and cess, and the fuel lines’ VAT, in paise', () => {
    const rows = [
      { taxCategory: 'GST', cgst: '0.10', sgst: '0.20', igst: 0, cess: null },
      { taxCategory: 'GST', cgst: 0, sgst: 0, igst: '212.80', cess: '0.01' },
      { taxCategory: 'FUEL_VAT', vat: '0.10' },
      { taxCategory: 'FUEL_VAT', vat: 0.2 },
      { taxCategory: 'EXEMPT', cgst: 99, vat: 99 },
    ];
    // Float rupees would give 0.30000000000000004 for the VAT.
    expect(salesTaxTotals(rows)).toEqual({ gstOutput: 213.11, vat: 0.3 });
  });

  it('is zero for no lines and ignores a broken figure', () => {
    expect(salesTaxTotals([])).toEqual({ gstOutput: 0, vat: 0 });
    expect(salesTaxTotals([{ taxCategory: 'GST', cgst: 'abc', sgst: '1.5' }]).gstOutput).toBe(1.5);
  });
});

describe('attendantTotals (#531)', () => {
  const a = (varianceAmount: number, shiftsWorked: number) =>
    ({ shiftsWorked, totals: { varianceAmount } }) as never;

  it('nets the variances in paise and counts the shifts', () => {
    expect(attendantTotals([a(-0.1, 2), a(-0.2, 3), a(0.3, 1)])).toEqual({
      variance: 0,
      shifts: 6,
    });
    expect(attendantTotals([a(-970, 21), a(370, 20)])).toEqual({ variance: -600, shifts: 41 });
  });

  it('is zero for no attendants', () => {
    expect(attendantTotals([])).toEqual({ variance: 0, shifts: 0 });
  });
});
