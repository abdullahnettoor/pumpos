import { describe, expect, it } from 'vitest';
import {
  deriveFuelLines,
  derivePaymentSlices,
  deriveShiftProducts,
  deriveShiftSummary,
  nozzleDuNames,
  volumeLabel,
} from './summary.js';

const snapshot = {
  cashVarianceModel: 2,
  totalFuelSalesValue: 213200,
  fuelByProduct: [
    { productName: 'Diesel', productCode: 'HSD', unit: 'L', netVolume: 1240, salesValue: 111000 },
    { productName: 'Petrol', productCode: 'MS', unit: 'L', netVolume: 980.5, salesValue: 102200 },
  ],
  nozzleReadings: [
    {
      nozzleId: 'n1',
      nozzleName: 'N1',
      productCode: 'MS',
      productName: 'Petrol',
      openingReading: 184220.4,
      closingReading: 184760.4,
      volumeSold: 540,
      testingVolume: 5,
      netVolume: 535,
      unit: 'L',
    },
  ],
  handovers: [
    { cardHandedOver: '1000', upiHandedOver: '2000.50', creditHandedOver: '500' },
    { cardHandedOver: '0', upiHandedOver: '3000', creditHandedOver: '0' },
  ],
  cashSalesSum: 90000,
  creditSalesTotal: 500,
  attendantVariance: -340,
  officeCountVariance: 20,
  cashVariance: 20,
  closingCash: 70020,
  expectedCash: 70000,
  drawers: [
    {
      attendantId: 'u1',
      duId: 'd1',
      duName: 'DU1',
      attendantName: 'Ramesh K',
      expectedCash: 34420,
      cashHandedOver: 34420,
      variance: 0,
    },
    {
      attendantId: 'u3',
      duId: 'd3',
      duName: 'DU3',
      attendantName: 'Vinod M',
      expectedCash: 31800,
      cashHandedOver: 31460,
      variance: -340,
    },
  ],
};

describe('deriveShiftSummary', () => {
  const duNames = nozzleDuNames([{ id: 'n1', duId: 'd1' }], [{ id: 'd1', name: 'DU1' }]);
  const m = deriveShiftSummary(snapshot, duNames);

  it('lists fuel grades largest first with the net litres', () => {
    expect(m.fuel.map((f) => [f.code, f.quantity, f.value])).toEqual([
      ['HSD', 1240, 111000],
      ['MS', 980.5, 102200],
    ]);
    expect(m.fuelValue).toBe(213200);
    expect(m.fuelVolumeLabel).toBe('2,221 L');
  });

  it('reads the payment split from the declared figures', () => {
    expect(m.payments).toEqual({ cash: 90000, upi: 5000.5, card: 1000, credit: 500 });
  });

  it('names the Dispenser Unit and fuel on each nozzle row and keeps testing apart', () => {
    expect(m.nozzles).toEqual([
      {
        key: 'n1',
        nozzle: 'N1',
        detail: 'DU1 · MS',
        opening: 184220.4,
        closing: 184760.4,
        litres: 535,
        testing: 5,
        unit: 'L',
      },
    ]);
  });

  it('shows each Drawer declared against expected, with the server variance', () => {
    expect(m.drawers[1]).toMatchObject({
      du: 'DU3',
      attendant: 'Vinod M',
      declared: 31460,
      expected: 31800,
      variance: -340,
    });
  });

  it('puts the office count beside the Drawers, not on top of them', () => {
    expect(m.office).toEqual({
      label: 'Office count vs declared',
      counted: 70020,
      expected: 70000,
      variance: 20,
    });
    expect(m.variance).toMatchObject({ attendant: -340, office: 20, headlineNote: 'DU3 short' });
  });

  it('copes with a snapshot that has no sections', () => {
    const empty = deriveShiftSummary({}, new Map());
    expect(empty).toMatchObject({ fuel: [], nozzles: [], drawers: [], fuelValue: 0 });
    expect(empty.fuelVolumeLabel).toBe('0 L');
  });

  it('keeps a pending Drawer pending (null variance)', () => {
    const p = deriveShiftSummary(
      { drawers: [{ duName: 'DU2', expectedCash: null, cashHandedOver: null, variance: null }] },
      new Map(),
    );
    expect(p.drawers[0]).toMatchObject({ declared: null, expected: null, variance: null });
  });

  it('labels a single-level snapshot "Cash variance"', () => {
    expect(deriveShiftSummary({ cashVariance: -80 }, new Map()).office.label).toBe('Cash variance');
  });
});

describe('volumeLabel / deriveFuelLines', () => {
  it('never adds litres to kilograms', () => {
    const fuel = deriveFuelLines({
      fuelByProduct: [
        { productName: 'Petrol', productCode: 'MS', unit: 'L', netVolume: 100, salesValue: 1 },
        { productName: 'CNG', productCode: 'CNG', unit: 'kg', netVolume: 40, salesValue: 1 },
      ],
    });
    expect(volumeLabel(fuel)).toBe('100 L · 40 kg');
  });
});

describe('deriveShiftProducts', () => {
  it('groups bulk handover items and billed sales by product', () => {
    const p = deriveShiftProducts(
      [
        {
          totalAmount: '1180',
          items: [
            { productId: 'oil', productName: 'Engine oil', quantity: '4.000', lineTotal: '1000' },
          ],
        },
      ],
      [
        {
          totalAmount: '590',
          items: [{ productName: 'Engine oil', quantity: '1', lineTotal: '500' }],
        },
        {
          totalAmount: '210',
          items: [{ productId: 'cool', productName: 'Coolant', quantity: '1', lineTotal: '210' }],
        },
      ],
    );
    // A handover item has an id, a billed item only a name: both land on one line.
    expect(p.lines.map((l) => [l.name, l.quantity, l.value])).toEqual([
      ['Engine oil', 5, 1500],
      ['Coolant', 1, 210],
    ]);
    expect(p.total).toBe(1980);
  });

  it('is empty for a Shift with no product sales', () => {
    expect(deriveShiftProducts([], [])).toEqual({ lines: [], total: 0 });
  });
});

describe('derivePaymentSlices', () => {
  const p = { cash: 100, upi: 60, card: 25, credit: 15 };
  it('has the four declared methods and no Other when they add up', () => {
    expect(derivePaymentSlices(p, 200).map((s) => s.key)).toEqual([
      'cash',
      'upi',
      'card',
      'credit',
    ]);
  });
  it('shows what the methods do not account for as Other', () => {
    const slices = derivePaymentSlices(p, 250);
    expect(slices.at(-1)).toEqual({ key: 'other', label: 'Other', amount: 50 });
  });
  it('waits for the full total before working out Other', () => {
    expect(derivePaymentSlices(p, null)).toHaveLength(4);
  });
});
