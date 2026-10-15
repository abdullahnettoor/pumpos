import { describe, expect, it } from 'vitest';
import { dssrDayStatus, readDssrDay } from './dssrModel.js';
import { fuelTotalRow, shiftTotalRow } from './dssrColumns.js';

describe('dssrDayStatus (Business Day Status)', () => {
  it('a stored snapshot is Sealed; a preview is Open today and a Draft before it', () => {
    expect(dssrDayStatus({}, '2026-10-09', '2026-10-15')).toBe('day-sealed');
    expect(dssrDayStatus({ live: true }, '2026-10-14', '2026-10-15')).toBe('day-draft');
    expect(dssrDayStatus({ live: true }, '2026-10-15', '2026-10-15')).toBe('day-open');
  });
});

describe('readDssrDay', () => {
  it('reads an empty row without inventing figures', () => {
    const day = readDssrDay({ businessDate: '2026-10-09' });
    expect(day.shiftsIncluded).toBe(0);
    expect(day.fuel.rows).toEqual([]);
    expect(day.sales.map((l) => l.label)).toEqual([
      'Merchandise sales',
      'Normal credit sales',
      'Fleet credit sales',
      'Purchases',
    ]);
    expect(day.drawerTotals).toEqual({ attendantVariance: null, officeVariance: null });
  });

  it('keeps GST and VAT on their own lines, IGST in place of CGST / SGST', () => {
    const day = readDssrDay({
      snapshotData: {
        salesTax: { gst: { taxable: 100, igst: 18, total: 18 }, vat: { vat: 50 } },
      },
    });
    expect(day.sales.slice(-3)).toEqual([
      { label: 'Merchandise taxable value', value: '₹100.00' },
      { label: 'Output GST on sales (IGST)', value: '₹18.00' },
      { label: 'Output VAT on fuel', value: '₹50.00' },
    ]);
  });

  it('reads stock variance through the shared vocabulary', () => {
    const day = readDssrDay({
      snapshotData: {
        fuelStockVariance: [
          { tankName: 'T1', varianceQuantity: -2 },
          { tankName: 'T2', varianceQuantity: 3 },
          { tankName: 'T3', varianceQuantity: 0.001 },
        ],
      },
    });
    expect(day.fuelStock.map((r) => r.status)).toEqual(['short', 'surplus', 'balanced']);
  });

  it('never adds volumes across units: the total row says so', () => {
    const day = readDssrDay({
      snapshotData: {
        fuel: {
          byProduct: [
            { productName: 'Petrol', unit: 'L', netVolume: 10 },
            { productName: 'CNG', unit: 'kg', netVolume: 5 },
          ],
        },
      },
    });
    const total = fuelTotalRow(day.fuel);
    expect(typeof total === 'object' && total.label).toBe(
      'Total (volumes not added across L and kg)',
    );
  });

  it('labels the shift total when older shifts carry no attendant variance', () => {
    const day = readDssrDay({
      businessDate: '2026-10-09',
      snapshotData: {
        shifts: [
          { shiftId: 'a', shiftSequence: 1, cashVariance: 0, attendantVariance: null },
          { shiftId: 'b', shiftSequence: 2, cashVariance: 0, attendantVariance: -5 },
        ],
        drawer: { totalCashVariance: 0, totalAttendantVariance: -5 },
      },
    });
    const total = shiftTotalRow(day);
    expect(typeof total === 'object' && total.label).toBe(
      'Total (attendant var. excl. 1 older shift)',
    );
    expect(day.shifts.map((s) => s.label)).toEqual(['20261009-1', '20261009-2']);
  });
});
