import { describe, expect, it } from 'vitest';
import type { AttendantReportShift } from '@pump/shared';
import { creditChitRows, shiftShowsCreditBreakdown } from './attendantCreditLines.js';

/**
 * The drawer and the exported PDF are two renderers of one statement. They
 * drifted: the PDF printed a placeholder row for a shift carrying a credit
 * total with no chits under it, so its section still summed to the shift line;
 * the drawer rendered nothing at all and quietly dropped that money out of the
 * breakdown. They also disagreed on how a quantity reads.
 *
 * The values, the fallbacks and the formatting are settled here so neither
 * renderer gets a vote.
 */
const shift = (over: Partial<AttendantReportShift> = {}): AttendantReportShift =>
  ({
    shiftId: 'sh-1',
    businessDate: '2026-03-01',
    shiftTemplateName: 'Morning',
    closedAt: '2026-03-01T14:00:00.000Z',
    dispensers: [],
    cashHandedOver: 0,
    cardHandedOver: 0,
    upiHandedOver: 0,
    creditHandedOver: 0,
    expectedFuelSales: 0,
    billedSales: 0,
    handoverProductSales: 0,
    creditSales: 0,
    creditSaleLines: [],
    varianceAmount: 0,
    testingVolume: 0,
    ...over,
  }) as AttendantReportShift;

const chit = (over: Record<string, unknown> = {}) =>
  ({
    transactionId: 'ct-1',
    customerId: 'cust-1',
    customerName: 'Sharma Transport',
    vehicleRegistration: 'KL07AB1234',
    productName: 'Petrol',
    quantity: 12.5,
    unit: 'L',
    unitPrice: 100,
    amount: 1250,
    ...over,
  }) as AttendantReportShift['creditSaleLines'][number];

describe('shiftShowsCreditBreakdown', () => {
  it('shows a shift that has chits', () => {
    expect(shiftShowsCreditBreakdown(shift({ creditSaleLines: [chit()], creditSales: 1250 }))).toBe(
      true,
    );
  });

  it('shows a shift with a credit total but no chits, which the drawer used to hide', () => {
    // A back-office entry raised against the shift outside any handover. The
    // shift line already accounted for it; hiding it here loses the money.
    expect(shiftShowsCreditBreakdown(shift({ creditSales: 900, creditSaleLines: [] }))).toBe(true);
  });

  it('hides a shift with neither', () => {
    expect(shiftShowsCreditBreakdown(shift({ creditSales: 0, creditSaleLines: [] }))).toBe(false);
  });

  it('shows a negative credit total, which is still money to account for', () => {
    expect(shiftShowsCreditBreakdown(shift({ creditSales: -500, creditSaleLines: [] }))).toBe(true);
  });
});

describe('creditChitRows', () => {
  it('renders one row per chit', () => {
    const rows = creditChitRows(
      shift({
        creditSales: 1500,
        creditSaleLines: [chit(), chit({ transactionId: 'ct-2', amount: 250 })],
      }),
    );
    expect(rows.map((r) => r.amount)).toEqual([1250, 250]);
    expect(rows.every((r) => !r.isPlaceholder)).toBe(true);
  });

  it('formats the quantity with its unit, which the drawer printed bare', () => {
    expect(creditChitRows(shift({ creditSaleLines: [chit({ quantity: 12.5 })] }))[0].quantity).toBe(
      '12.500 L',
    );
  });

  it('uses the chit’s own unit, so a CNG sale is not asserted to be litres', () => {
    // Reaching for the PDF's `vol3` here would have hardcoded ' L'. Quantities
    // must never be read across units.
    expect(
      creditChitRows(shift({ creditSaleLines: [chit({ quantity: 8, unit: 'kg' })] }))[0].quantity,
    ).toBe('8.000 kg');
  });

  it('falls back to litres when the chit records no unit', () => {
    expect(
      creditChitRows(shift({ creditSaleLines: [chit({ quantity: 8, unit: null })] }))[0].quantity,
    ).toBe('8.000 L');
  });

  it('dashes a chit that recorded no quantity rather than printing a formatted zero', () => {
    expect(creditChitRows(shift({ creditSaleLines: [chit({ quantity: null })] }))[0].quantity).toBe(
      '—',
    );
  });

  it('names an unidentified customer rather than leaving the cell blank', () => {
    expect(
      creditChitRows(shift({ creditSaleLines: [chit({ customerName: null })] }))[0].customerName,
    ).toBe('Unknown customer');
  });

  it.each([
    ['vehicleRegistration', 'vehicle'],
    ['productName', 'product'],
  ] as const)('dashes a missing %s', (field, cell) => {
    expect(creditChitRows(shift({ creditSaleLines: [chit({ [field]: null })] }))[0][cell]).toBe(
      '—',
    );
  });

  it('synthesizes one placeholder row for a credit total with no chits', () => {
    const rows = creditChitRows(shift({ creditSales: 900, creditSaleLines: [] }));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      isPlaceholder: true,
      customerName: '—',
      vehicle: '—',
      product: '—',
      quantity: '—',
      amount: 900,
    });
  });

  it('gives the placeholder a key that cannot collide with a chit id', () => {
    const rows = creditChitRows(shift({ shiftId: 'sh-9', creditSales: 900, creditSaleLines: [] }));
    expect(rows[0].key).toContain('sh-9');
  });

  it('returns nothing for a shift with no credit at all', () => {
    expect(creditChitRows(shift())).toEqual([]);
  });

  it('sums the rows to the shift credit total in both shapes', () => {
    // The property that makes the section trustworthy: the breakdown and the
    // shift line are the same money, chits or not.
    const withChits = shift({
      creditSales: 1500,
      creditSaleLines: [chit({ amount: 1250 }), chit({ transactionId: 'ct-2', amount: 250 })],
    });
    const withoutChits = shift({ creditSales: 1500, creditSaleLines: [] });
    for (const s of [withChits, withoutChits]) {
      expect(creditChitRows(s).reduce((sum, r) => sum + r.amount, 0)).toBe(s.creditSales);
    }
  });

  /**
   * The folded cell, for a renderer too narrow for separate product and
   * quantity columns. Composed here rather than in the PDF: doing it there
   * meant re-spelling this module's private "missing" sentinel in another file
   * to branch on, so changing the sentinel would silently corrupt the export.
   */
  describe('productWithQuantity', () => {
    it('joins the product and its quantity', () => {
      expect(creditChitRows(shift({ creditSaleLines: [chit()] }))[0].productWithQuantity).toBe(
        'Petrol \u00b7 12.500 L',
      );
    });

    it('is the product alone when the chit recorded no quantity', () => {
      expect(
        creditChitRows(shift({ creditSaleLines: [chit({ quantity: null })] }))[0]
          .productWithQuantity,
      ).toBe('Petrol');
    });

    it('is a single dash when there is no product, not a dash with a quantity after it', () => {
      expect(
        creditChitRows(shift({ creditSaleLines: [chit({ productName: null })] }))[0]
          .productWithQuantity,
      ).toBe('\u2014');
    });

    it('does not mistake a product named like the missing sentinel for missing data', () => {
      // The bug the old PDF branch had: it compared the *rendered* cell to the
      // sentinel, so a product actually named '—' lost its quantity.
      expect(
        creditChitRows(shift({ creditSaleLines: [chit({ productName: '\u2014' })] }))[0]
          .productWithQuantity,
      ).toBe('\u2014 \u00b7 12.500 L');
    });

    it('is a dash on the placeholder row', () => {
      expect(
        creditChitRows(shift({ creditSales: 900, creditSaleLines: [] }))[0].productWithQuantity,
      ).toBe('\u2014');
    });
  });
});
