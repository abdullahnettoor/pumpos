import { describe, expect, it } from 'vitest';
import { dssrDayStatus, readDssrDay } from './dssrModel.js';
import {
  dssrCellTone,
  FUEL_PRODUCT_COLUMNS,
  FUEL_STOCK_COLUMNS,
  shiftColumns,
  ATTENDANT_COLUMNS,
  attendantTotalNotes,
  attendantTotalRow,
  fuelTotalNotes,
  shiftTotalNotes,
  totalNote,
  fuelTotalRow,
  shiftTotalRow,
} from './dssrColumns.js';
import { cellText, totalTexts } from '../../../pump-ds/table/columns.js';

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
      'Product sales',
      'Normal credit sales',
      'Fleet credit sales',
      'Purchases',
      'Gross margin',
    ]);
    expect(day.drawerTotals).toEqual({ attendantVariance: null, officeVariance: null });
  });

  it('keeps GST and VAT on their own lines, IGST in place of CGST / SGST', () => {
    const day = readDssrDay({
      snapshotData: {
        salesTax: { gst: { taxable: 100, igst: 18, total: 18 }, vat: { vat: 50 } },
      },
    });
    expect(day.sales.slice(-4)).toEqual([
      { label: 'Product taxable value', value: '₹100.00' },
      { label: 'Output GST on sales (IGST)', value: '₹18.00' },
      { label: 'Output VAT on fuel', value: '₹50.00' },
      { label: 'Gross margin', value: '₹0.00' },
    ]);
  });

  it('reads an old-shape row (no frozen status) by the exact-zero rule it was composed under (#556)', () => {
    // Snapshot rows sealed before the status was stored: tank, figures, no `status`.
    const day = readDssrDay({
      snapshotData: {
        fuelStockVariance: [
          { tankName: 'T1', unit: 'Litre', varianceQuantity: -2 },
          { tankName: 'T2', unit: 'Litre', varianceQuantity: 3 },
          { tankName: 'T3', unit: 'Litre', varianceQuantity: 0 },
          // Under the current quantity rule this would read Balanced; it was sealed a Gain.
          { tankName: 'T4', unit: 'Litre', varianceQuantity: 0.0004 },
          { tankName: 'T5', unit: 'Litre', varianceQuantity: '-0.0004' },
        ],
      },
    });
    expect(day.fuelStock.map((r) => r.status)).toEqual([
      'short',
      'surplus',
      'balanced',
      'surplus',
      'short',
    ]);
    const variance = FUEL_STOCK_COLUMNS.find((c) => c.id === 'variance')!;
    expect(dssrCellTone(variance, day.fuelStock[3])).toBe('surplus');
  });

  it("keeps a snapshot's frozen stock status, never re-derived under a newer rule (#556)", () => {
    const day = readDssrDay({
      snapshotData: {
        fuelStockVariance: [
          { tankName: 'T1', varianceQuantity: -2, status: 'Loss' },
          { tankName: 'T2', varianceQuantity: 0.0004, status: 'Gain' },
          { tankName: 'T3', varianceQuantity: 0, status: 'OK' },
        ],
      },
    });
    expect(day.fuelStock.map((r) => r.status)).toEqual(['short', 'surplus', 'balanced']);
    // The figure is tinted by the same frozen status (screen and PDF).
    const variance = FUEL_STOCK_COLUMNS.find((c) => c.id === 'variance')!;
    expect(day.fuelStock.map((r) => dssrCellTone(variance, r))).toEqual(['short', 'surplus', null]);
  });

  it('never adds volumes across units: the note under the total says so', () => {
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
    expect(totalNote(fuelTotalNotes(day.fuel))).toBe('Total: volumes not added across L and kg.');
  });

  it('notes the shifts the attendant total leaves out', () => {
    const day = readDssrDay({
      businessDate: '2026-10-09',
      snapshotData: {
        shifts: [
          { shiftId: 'a', shiftSequence: 1, cashVariance: 0, attendantVariance: null },
          { shiftId: 'b', shiftSequence: 2, cashVariance: 0, attendantVariance: -5 },
        ],
        fuel: { totalNetVolume: 0 },
        drawer: { totalCashVariance: 0, totalAttendantVariance: -5 },
      },
    });
    expect(shiftTotalNotes(day)).toEqual([
      'attendant var. excl. 1 shift without a separate attendant variance',
    ]);
    expect(day.shifts.map((s) => s.label)).toEqual(['20261009-1', '20261009-2']);
  });

  /*
   * #583 review: the shift and attendant totals are the snapshot's, never a
   * sum of the rows. Each fixture's stored total differs from its rows' sum.
   */
  const shiftDay = (snapshotData: Record<string, unknown>) =>
    readDssrDay({
      businessDate: '2026-10-09',
      snapshotData: {
        shifts: [
          {
            shiftId: 'a',
            shiftSequence: 1,
            netVolume: 100,
            cashVariance: -10,
            attendantVariance: -4,
          },
          { shiftId: 'b', shiftSequence: 2, netVolume: 50, cashVariance: 5, attendantVariance: 2 },
        ],
        drawer: {
          totalCashVariance: -7,
          totalAttendantVariance: -3,
          attendants: [{ attendantName: 'Ravi', variance: -4 }],
        },
        ...snapshotData,
      },
    });

  it('reads the shift total net volume from fuel.totalNetVolume, not the rows', () => {
    const day = shiftDay({
      fuel: { totalNetVolume: 149.5, byProduct: [{ productName: 'Petrol', unit: 'L' }] },
    });
    expect(totalTexts(shiftColumns(day), day.shifts, shiftTotalRow(day))?.cells).toEqual([
      'Total',
      '',
      '',
      '149.50 L',
      '−₹3.00',
      '−₹7.00',
    ]);
  });

  it('a mixed-unit day prints the shift net volume total as —, and says why', () => {
    const day = shiftDay({
      fuel: {
        totalNetVolume: 150,
        byProduct: [
          { productName: 'Petrol', unit: 'L' },
          { productName: 'CNG', unit: 'kg' },
        ],
      },
    });
    expect(
      totalTexts(shiftColumns(day), day.shifts, shiftTotalRow(day))?.cells.slice(0, 4),
    ).toEqual(['Total', '', '', '—']);
    expect(shiftTotalNotes(day)).toEqual(['volumes not added across L and kg']);
  });

  it('leaves a variance total the snapshot lacks blank, never summing the rows, and says why', () => {
    const fuel = { totalNetVolume: 149.5, byProduct: [{ productName: 'Petrol', unit: 'L' }] };
    const day = shiftDay({
      fuel,
      drawer: { attendants: [{ attendantName: 'Ravi', variance: -4 }] },
    });
    expect(totalTexts(shiftColumns(day), day.shifts, shiftTotalRow(day))?.cells).toEqual([
      'Total',
      '',
      '',
      '149.50 L',
      '',
      '',
    ]);
    expect(shiftTotalNotes(day)).toEqual(['variance totals not stored for this day']);
    expect(totalTexts(ATTENDANT_COLUMNS, day.attendants, attendantTotalRow(day))?.cells).toEqual([
      'Total',
      '',
    ]);
    expect(attendantTotalNotes(day)).toEqual(['variance total not stored for this day']);
    const officeOnly = shiftDay({
      fuel,
      drawer: { totalCashVariance: -7, attendants: [{ attendantName: 'Ravi', variance: -4 }] },
    });
    expect(shiftTotalNotes(officeOnly)).toEqual(['attendant var. total not stored for this day']);
    expect(
      totalTexts(shiftColumns(officeOnly), officeOnly.shifts, shiftTotalRow(officeOnly))?.cells,
    ).toEqual(['Total', '', '', '149.50 L', '', '−₹7.00']);
    const stored = shiftDay({ fuel });
    expect(
      totalTexts(ATTENDANT_COLUMNS, stored.attendants, attendantTotalRow(stored))?.cells,
    ).toEqual(['Total', '−₹3.00']);
    expect(attendantTotalNotes(stored)).toEqual([]);
    expect(totalNote(shiftTotalNotes(stored))).toBeNull();
  });

  /* #583 review round 2: a net volume the snapshot does not store is never gross − testing. */
  it('leaves the net volume blank when the snapshot stores gross and testing but no totalNetVolume', () => {
    const day = shiftDay({
      fuel: {
        totalGrossVolume: 160,
        totalTestingVolume: 10,
        totalSalesValue: 15000,
        byProduct: [{ productName: 'Petrol', unit: 'L', grossVolume: 160, testingVolume: 10 }],
      },
    });
    expect(day.fuel.totals.net).toBeNull();
    expect(
      totalTexts(shiftColumns(day), day.shifts, shiftTotalRow(day))?.cells.slice(0, 4),
    ).toEqual(['Total', '', '', '']);
    expect(shiftTotalNotes(day)).toEqual(['net volume not stored for this day']);
    expect(fuelTotalNotes(day.fuel)).toEqual(['net volume not stored for this day']);
    expect(totalTexts(FUEL_PRODUCT_COLUMNS, day.fuel.rows, fuelTotalRow(day.fuel))?.cells).toEqual([
      'Total',
      '160.00 L',
      '10.00 L',
      '',
      '₹15,000.00',
    ]);
  });

  it('prints the shift net volume total in the day’s fuel unit: kg on a kg-only day', () => {
    const day = shiftDay({
      fuel: { totalNetVolume: 149.5, byProduct: [{ productName: 'CNG', unit: 'kg' }] },
    });
    expect(totalTexts(shiftColumns(day), day.shifts, shiftTotalRow(day))?.cells[3]).toBe(
      '149.50 kg',
    );
  });

  /* #587: a shift's net volume takes the day's fuel unit, as the shift total does. */
  const shiftNetVolumes = (day: ReturnType<typeof readDssrDay>) => {
    const net = shiftColumns(day).find((c) => c.id === 'netVolume');
    return day.shifts.map((s) => (net ? cellText(net, s) : null));
  };

  it('prints each shift’s net volume in kg on a kg-only day', () => {
    const day = shiftDay({
      fuel: { totalNetVolume: 150, byProduct: [{ productName: 'CNG', unit: 'kg' }] },
    });
    expect(shiftNetVolumes(day)).toEqual(['100.00 kg', '50.00 kg']);
  });

  it('prints each shift’s net volume in L on a litres-only day, and on a day with no fuel', () => {
    const litres = shiftDay({
      fuel: { totalNetVolume: 150, byProduct: [{ productName: 'Petrol', unit: 'L' }] },
    });
    expect(shiftNetVolumes(litres)).toEqual(['100.00 L', '50.00 L']);
    expect(shiftNetVolumes(shiftDay({ fuel: { byProduct: [] } }))).toEqual(['100.00 L', '50.00 L']);
  });

  it('prints each shift’s net volume as — on a mixed L/kg day, with the mixed-unit note', () => {
    const day = shiftDay({
      fuel: {
        totalNetVolume: 150,
        byProduct: [
          { productName: 'Petrol', unit: 'L' },
          { productName: 'CNG', unit: 'kg' },
        ],
      },
    });
    expect(shiftNetVolumes(day)).toEqual(['—', '—']);
    expect(shiftTotalNotes(day)).toEqual(['volumes not added across L and kg']);
  });
});
