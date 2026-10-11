import { describe, expect, it } from 'vitest';
import {
  deriveFuelLines,
  derivePaymentSlices,
  derivePaymentSplit,
  deriveSalesTotals,
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
    expect(m.payments).toEqual({
      cash: 90000,
      upi: 5000.5,
      card: 1000,
      credit: 500,
      omcCard: null,
    });
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

  it('names a single-level snapshot "Counted cash", as the header card does', () => {
    expect(deriveShiftSummary({ cashVariance: -80 }, new Map()).office.label).toBe('Counted cash');
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

describe('Product Sales (from the snapshot)', () => {
  const withProducts = {
    ...snapshot,
    totalProductSalesValue: 1416,
    totalSalesValue: 214616,
    productSales: {
      total: 1416,
      lines: [
        {
          productId: 'p1',
          productName: 'Engine Oil',
          productType: 'LUBRICANT',
          quantity: 3,
          value: 900,
        },
        // A second product sharing the name stays its own line.
        {
          productId: 'p2',
          productName: 'Engine Oil',
          productType: 'ACCESSORY',
          quantity: 1,
          value: 450,
        },
      ],
    },
  };

  it('lists one line per product id and takes the sales total as the figure', () => {
    const p = deriveShiftProducts(withProducts);
    expect(p?.lines.map((l) => [l.key, l.name, l.quantity, l.value])).toEqual([
      ['p1', 'Engine Oil', 3, 900],
      ['p2', 'Engine Oil', 1, 450],
    ]);
    expect(p?.total).toBe(1416);
  });

  it('carries each line category, and none for a snapshot line frozen without one', () => {
    const p = deriveShiftProducts({
      productSales: {
        total: 150,
        lines: [
          { productId: 'a', productName: 'Oil', productType: 'LUBRICANT', quantity: 1, value: 100 },
          { productId: 'b', productName: 'Old line', quantity: 1, value: 50 },
        ],
      },
    });
    expect(p?.lines.map((l) => [l.name, l.productType])).toEqual([
      ['Oil', 'LUBRICANT'],
      ['Old line', null],
    ]);
  });

  it('is an empty list (not missing) for a Shift with no Product Sales', () => {
    expect(deriveShiftProducts({ productSales: { total: 0, lines: [] } })).toEqual({
      lines: [],
      total: 0,
    });
  });

  it('is null for a snapshot that predates Product Sales', () => {
    expect(deriveShiftProducts(snapshot)).toBeNull();
    expect(deriveShiftSummary(snapshot, new Map()).products).toBeNull();
  });

  it('adds them to the headline total', () => {
    expect(deriveShiftSummary(withProducts, new Map()).total).toBe(214616);
    expect(deriveSalesTotals(withProducts)).toEqual({
      fuel: 213200,
      products: 1416,
      total: 214616,
    });
  });

  it('shows fuel alone as the total for a snapshot without them', () => {
    expect(deriveSalesTotals(snapshot)).toEqual({ fuel: 213200, products: null, total: 213200 });
  });
});

describe('payments (from the snapshot)', () => {
  it('reads the snapshot payment split rather than summing Handovers again', () => {
    const m = deriveShiftSummary(
      { ...snapshot, payments: { cash: 1, upi: 2, card: 3, credit: 4 } },
      new Map(),
    );
    expect(m.payments).toEqual({ cash: 1, upi: 2, card: 3, credit: 4, omcCard: null });
  });
});

describe('Dispenser Unit on a nozzle row', () => {
  const reading = { nozzleId: 'n1', nozzleName: 'N1', productCode: 'MS', unit: 'L' };

  it("takes the reading's own DU over today's setup", () => {
    const moved = nozzleDuNames([{ id: 'n1', duId: 'd9' }], [{ id: 'd9', name: 'DU9' }]);
    const m = deriveShiftSummary({ nozzleReadings: [{ ...reading, duName: 'DU1' }] }, moved);
    expect(m.nozzles[0].detail).toBe('DU1 · MS');
  });

  it('falls back to the setup only for a snapshot whose readings carry no DU', () => {
    const names = nozzleDuNames([{ id: 'n1', duId: 'd9' }], [{ id: 'd9', name: 'DU9' }]);
    expect(deriveShiftSummary({ nozzleReadings: [reading] }, names).nozzles[0].detail).toBe(
      'DU9 · MS',
    );
  });
});

describe('derivePaymentSlices', () => {
  it('has the four declared methods and nothing else', () => {
    const slices = derivePaymentSlices({ cash: 100, upi: 60, card: 25, credit: 15, omcCard: null });
    expect(slices.map((s) => [s.key, s.amount])).toEqual([
      ['cash', 100],
      ['upi', 60],
      ['card', 25],
      ['credit', 15],
    ]);
  });
});

// The report-compare fixture's two Shifts (Sri Lakshmi, 2026-10-10), as their Shift Summary
// snapshots store them. Morning: DU-1 declared ₹125 short and Suresh took ₹2,000 on an OMC card.
const MORNING = {
  cashVarianceModel: 2,
  totalSalesValue: 181400,
  attendantVariance: -125,
  officeCountVariance: 50,
  cashVariance: 50,
  payments: { cash: 71275, upi: 58000, card: 27000, credit: 23000, omcCard: 2000 },
};
const EVENING = {
  cashVarianceModel: 2,
  totalSalesValue: 142315,
  attendantVariance: 0,
  officeCountVariance: 0,
  cashVariance: 0,
  payments: { cash: 64275, upi: 37000, card: 30000, credit: 11040, omcCard: 0 },
};

/** The identity the page must show: every slice plus the gap line is the total. */
const added = (split: ReturnType<typeof derivePaymentSplit>) =>
  split.slices.reduce((s, x) => s + x.amount, 0) +
  (split.gap ? (split.gap.kind === 'short' ? split.gap.amount : -split.gap.amount) : 0) +
  (split.unitemised?.amount ?? 0);

describe('derivePaymentSplit', () => {
  const split = (snap: typeof MORNING) => {
    const m = deriveShiftSummary(snap, new Map());
    return derivePaymentSplit(m.payments, m.total, m.variance.attendant);
  };

  it('Morning: cash + UPI + card + credit + OMC card + the ₹125 shortage = total sales', () => {
    const s = split(MORNING);
    expect(s.slices.map((x) => [x.label, x.amount])).toEqual([
      ['Cash', 71275],
      ['UPI', 58000],
      ['Card', 27000],
      ['Credit', 23000],
      ['OMC card', 2000],
    ]);
    expect(s.gap).toMatchObject({ kind: 'short', label: 'Short', amount: 125, tone: 'bad' });
    expect(s.total).toBe(181400);
    expect(added(s)).toBe(181400);
  });

  it('Evening: balanced, adds up with no gap line and no OMC bucket', () => {
    const s = split(EVENING);
    expect(s.slices.map((x) => x.key)).toEqual(['cash', 'upi', 'card', 'credit']);
    expect(s.gap).toBeNull();
    expect(s.total).toBe(142315);
    expect(added(s)).toBe(142315);
  });

  it('shows an overage as its own line that comes off the split', () => {
    const over = { ...MORNING, attendantVariance: 40, totalSalesValue: 181235 };
    const s = split(over);
    expect(s.gap).toMatchObject({ kind: 'over', label: 'Over', amount: 40, tone: 'warn' });
    expect(s.total).toBe(181235);
    expect(added(s)).toBe(181235);
  });

  it('a new snapshot that adds up has nothing left unitemised', () => {
    expect(split(MORNING).unitemised).toBeNull();
    expect(split(EVENING).unitemised).toBeNull();
  });

  it('a snapshot without the OMC bucket keeps its total and names the missing ₹2,000', () => {
    const { omcCard: _omit, ...payments } = MORNING.payments;
    const legacy = { ...MORNING, payments };
    const m = deriveShiftSummary(legacy, new Map());
    expect(m.payments.omcCard).toBeNull();
    const s = derivePaymentSplit(m.payments, m.total, m.variance.attendant);
    expect(s.slices.map((x) => x.key)).toEqual(['cash', 'upi', 'card', 'credit']);
    expect(s.gap).toMatchObject({ kind: 'short', amount: 125 });
    expect(s.unitemised).toEqual({
      amount: 2000,
      note: 'Recorded before payment details were stored',
    });
    expect(s.total).toBe(181400);
    expect(added(s)).toBe(181400);
  });

  it('a snapshot with no payments block at all (summed from the Handovers) shows nothing extra', () => {
    const m = deriveShiftSummary(
      {
        totalFuelSalesValue: 1000,
        cashSalesSum: 900,
        handovers: [{ cardHandedOver: '100', upiHandedOver: '0', creditHandedOver: '0' }],
        cashVariance: 0,
      },
      new Map(),
    );
    const s = derivePaymentSplit(m.payments, m.total, m.variance.attendant);
    expect(s.gap).toBeNull();
    expect(s.unitemised).toBeNull();
    expect(s.total).toBe(1000);
  });

  it('a snapshot that stored the OMC bucket but still does not add up says so', () => {
    const s = split({ ...MORNING, attendantVariance: -340 });
    expect(s.gap).toMatchObject({ kind: 'short', amount: 340 });
    expect(s.unitemised).toEqual({
      amount: -215,
      note: 'Payment details do not add up to total sales',
    });
    expect(s.total).toBe(181400);
    expect(added(s)).toBe(181400);
  });

  it('treats a rupee-rounding difference as adding up (the shared VARIANCE_TOLERANCE)', () => {
    const m = deriveShiftSummary({ ...MORNING, totalSalesValue: 181400.4 }, new Map());
    expect(derivePaymentSplit(m.payments, m.total, m.variance.attendant).unitemised).toBeNull();
  });
});
