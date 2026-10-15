import { describe, expect, it } from 'vitest';
import { reconcileDrawer } from '@pump/shared';
import {
  acceptedHandoverRecon,
  handoverNozzles,
  handoverRecon,
  handoverReconInput,
  sumAmounts,
} from './handoverFigures.js';

const nz = (id: string, opening: number, price = 100, extra: object = {}) => ({
  nozzleId: id,
  nozzleName: id,
  productId: 'p-ms',
  productName: 'Petrol',
  unit: 'L',
  openingReading: opening,
  unitPrice: price,
  ...extra,
});

describe('handoverNozzles (#534)', () => {
  it('lists nozzles in natural order and values volume less testing at the pump price', () => {
    const f = handoverNozzles(
      [nz('N10', 100), nz('N2', 200), nz('N1', 50)],
      { N1: 60, N2: 210, N10: 105 },
      { N2: 1 },
    );
    expect(f.rows.map((r) => r.nozzle)).toEqual(['N1', 'N2', 'N10']);
    expect(f.volume).toBe(25);
    expect(f.testing).toBe(1);
    expect(f.fuelSales).toBe(2400);
    expect(f.unit).toBe('L');
    expect(f.meteredByProduct.get('p-ms')).toBe(24);
  });

  it('defaults a closing reading to the opening and flags one below it', () => {
    const f = handoverNozzles([nz('N1', 100), nz('N2', 100)], { N2: 90 }, {});
    expect(f.rows[0]).toMatchObject({ closing: 100, volume: 0, invalid: false });
    expect(f.rows[1]).toMatchObject({ closing: 90, volume: 0, invalid: true });
  });

  it('never values sales below zero, and reads mixed units as units', () => {
    const f = handoverNozzles([nz('N1', 0), nz('N2', 0, 50, { unit: 'kg' })], { N1: 1 }, { N1: 5 });
    expect(f.fuelSales).toBe(0);
    expect(f.unit).toBe('units');
  });
});

describe('handoverRecon (#534): expected = float + fuel cash + product cash − drops', () => {
  const base = {
    fuelSales: 10_000,
    productCash: 450,
    card: 2_000,
    upi: 1_000,
    credit: 500,
    omc: 0,
    openingFloat: 2_000,
    drops: 3_000,
    declaredCash: 5_950,
  };

  it('adds up line by line', () => {
    const r = handoverRecon(base);
    expect(r.cardUpi).toBe(3_000);
    expect(r.creditOmc).toBe(500);
    expect(r.cashSales).toBe(6_950);
    expect(r.expected).toBe(5_950);
    expect(r.variance).toBe(0);
  });

  it('gives the variance the old formula gave: declared total − expected total − float + drops', () => {
    const declared = { ...base, declaredCash: 5_750 };
    const r = handoverRecon(declared);
    const totalDeclared = 5_750 + 2_000 + 1_000 + 500 + 0;
    const old = totalDeclared - (10_000 + 450) - 2_000 + 3_000;
    expect(r.variance).toBe(old);
    expect(r.variance).toBe(-200);
  });

  it('matches the server’s reconcileDrawer to the paisa on fractional inputs', () => {
    const cases = [
      {
        ...base,
        fuelSales: 0.005,
        productCash: 0,
        card: 0,
        upi: 0,
        credit: 0,
        omc: 0,
        openingFloat: 0,
        drops: 0,
        declaredCash: 0,
      },
      {
        ...base,
        fuelSales: 102_078.13125,
        productCash: 0.005,
        card: 0.004,
        declaredCash: 98_000.995,
      },
      {
        ...base,
        fuelSales: 9_755.4419,
        upi: 1_000.335,
        credit: 0.115,
        drops: 0.005,
        declaredCash: 8_754.99,
      },
    ];
    for (const c of cases) {
      const server = reconcileDrawer({
        openingFloat: c.openingFloat,
        expectedFuelSales: c.fuelSales,
        merchandiseCash: c.productCash,
        cardHandedOver: c.card,
        upiHandedOver: c.upi,
        creditSales: c.credit,
        omcCardSales: c.omc,
        cashHandedOver: c.declaredCash,
        cashDrops: c.drops,
      });
      const r = handoverRecon(c);
      expect(r.variance).toBe(server.varianceAmount);
      expect(r.expected).toBe(server.expectedCash);
      expect(r.cashSales).toBe(server.cashSales);
    }
    // Fuel ₹0.005 with nothing declared is balanced, as the server records it.
    expect(handoverRecon(cases[0]).variance).toBe(0);
  });

  it('totals everything declared: cash + card + UPI + credit + OMC', () => {
    expect(handoverRecon({ ...base, omc: 250 }).declaredTotal).toBe(5_950 + 3_000 + 500 + 250);
  });

  it('sums in paise, so float dust reads as balanced', () => {
    const r = handoverRecon({
      ...base,
      fuelSales: 0.1 + 0.2,
      productCash: 0,
      card: 0,
      upi: 0,
      credit: 0,
      drops: 0,
      openingFloat: 0,
      declaredCash: 0.3,
    });
    expect(r.variance).toBe(0);
    expect(Object.is(r.variance, -0)).toBe(false);
  });

  it('lays the server’s accepted figures out as the same lines', () => {
    const r = acceptedHandoverRecon({
      handover: { cashHandedOver: '5750.00', cardHandedOver: '2000', upiHandedOver: '1000' },
      expectedFuelSales: 10_000,
      merchandiseCash: 450,
      creditSales: 500,
      omcCardSales: 0,
      openingFloat: 2_000,
      cashDrops: 3_000,
      expectedCash: 5_950,
      declaredTotal: 9_250,
      varianceAmount: -200,
    });
    expect(r).toMatchObject({
      source: 'accepted',
      cashSales: 6_950,
      expected: 5_950,
      declaredCash: 5_750,
      variance: -200,
      declaredTotal: 9_250,
    });
  });

  it('sums amounts as entered, never rounding a line on its own', () => {
    expect(sumAmounts([{ amount: '0.005' }, { amount: 0.005 }, { amount: null }])).toBeCloseTo(
      0.01,
      10,
    );
  });

  it('maps the drawer’s form as the payload does, so a ₹0.005 card line matches the server (#534 review)', () => {
    // Fuel ₹1, one terminal batch of ₹0.005 card, nothing declared.
    const input = handoverReconInput({
      terminals: [{ terminalId: 't1' }],
      aggregateAllowed: false,
      values: { cashHandedOver: '', cashDrops: '', terminalCard: { t1: '0.005' }, terminalUpi: {} },
      creditLines: [],
      omcLines: [],
      fuelSales: 1,
      productCash: 0,
      openingFloat: 0,
    });
    const server = reconcileDrawer({
      openingFloat: 0,
      expectedFuelSales: 1,
      merchandiseCash: 0,
      cardHandedOver: 0.005,
      upiHandedOver: 0,
      creditSales: 0,
      omcCardSales: 0,
      cashHandedOver: 0,
      cashDrops: 0,
    });
    const r = handoverRecon(input);
    expect(r.variance).toBe(server.varianceAmount);
    expect(r.expected).toBe(server.expectedCash);
    expect(r.cashSales).toBe(server.cashSales);
    // Same for raw credit and OMC lines and aggregate totals.
    const agg = handoverRecon(
      handoverReconInput({
        terminals: [],
        aggregateAllowed: true,
        values: { cashHandedOver: '3.335', cardHandedOver: '0.005', upiHandedOver: '0.005' },
        creditLines: [{ amount: '0.005' }],
        omcLines: [{ amount: 0.005 }],
        fuelSales: 3.36,
        productCash: 0,
        openingFloat: 0,
      }),
    );
    const aggServer = reconcileDrawer({
      openingFloat: 0,
      expectedFuelSales: 3.36,
      merchandiseCash: 0,
      cardHandedOver: 0.005,
      upiHandedOver: 0.005,
      creditSales: 0.005,
      omcCardSales: 0.005,
      cashHandedOver: 3.335,
      cashDrops: 0,
    });
    expect(agg.variance).toBe(aggServer.varianceAmount);
    expect(agg.expected).toBe(aggServer.expectedCash);
  });
});
