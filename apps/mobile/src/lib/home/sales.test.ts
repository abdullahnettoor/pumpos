import { describe, expect, it } from 'vitest';
import {
  deriveComparison,
  deriveSales,
  deriveSplitBar,
  deriveTrend,
  readSnapshot,
  sparklinePath,
} from './sales.js';

/** A live preview of an open day: Shift 1 is closed, Shift 2 is still running. */
const preview = {
  businessDate: '2026-10-09',
  snapshotData: {
    fuel: {
      totalSalesValue: 212880,
      byProduct: [
        {
          productId: 'p-hsd',
          productName: 'Diesel',
          productCode: 'HSD',
          unit: 'L',
          netVolume: 1120,
          salesValue: 100330,
        },
        {
          productId: 'p-ms',
          productName: 'Petrol',
          productCode: 'MS',
          unit: 'L',
          netVolume: 1060,
          salesValue: 109095,
        },
        {
          productId: 'p-xp',
          productName: 'Premium',
          productCode: 'XP95',
          unit: 'L',
          netVolume: 31,
          salesValue: 3455,
        },
      ],
    },
    merchandise: { salesValue: 6840 },
    pnl: {
      byProduct: [
        { productId: 'p-fuel', kind: 'fuel', name: 'Petrol', quantity: 1060, revenue: 109095 },
        {
          productId: 'm1',
          kind: 'merchandise',
          name: 'Engine oil 1L',
          quantity: 14,
          revenue: 4920,
        },
        { productId: 'm2', kind: 'merchandise', name: 'Coolant', quantity: 6, revenue: 1140 },
        { productId: 'm3', kind: 'merchandise', name: 'Wiper', quantity: 3, revenue: 780 },
      ],
    },
    shifts: [
      {
        shiftId: 's1',
        shiftSequence: 1,
        templateName: 'Shift 1',
        netVolume: 2211,
        fuelSalesValue: 212880,
      },
    ],
  },
};

describe('readSnapshot', () => {
  it('reads the payload of a preview, a bare snapshot, or nothing', () => {
    expect(readSnapshot(preview).fuel).toBe(preview.snapshotData.fuel);
    expect(readSnapshot(preview.snapshotData).merchandise).toBe(preview.snapshotData.merchandise);
    expect(readSnapshot(null)).toEqual({});
  });
});

describe('deriveSales: fuel from closed Shifts, Product Sales live', () => {
  const s = deriveSales(readSnapshot(preview));

  it('totals the headline as closed-Shift fuel plus every Product Sale', () => {
    expect(s.fuelValue).toBe(212880);
    expect(s.productsValue).toBe(6840);
    expect(s.total).toBe(219720);
  });

  it('lists fuel grades by value and splits litres per unit', () => {
    expect(s.fuel.map((f) => f.code)).toEqual(['MS', 'HSD', 'XP95']);
    expect(s.fuelVolumeLabel).toBe('2,211 L');
  });

  it('never adds litres to kilograms', () => {
    const mixed = deriveSales({
      fuel: {
        totalSalesValue: 1,
        byProduct: [
          { productName: 'Petrol', unit: 'L', netVolume: 100, salesValue: 1 },
          { productName: 'CNG', unit: 'kg', netVolume: 40, salesValue: 1 },
        ],
      },
    });
    expect(mixed.fuelVolumeLabel).toBe('100 L · 40 kg');
  });

  it('keeps only merchandise as product lines, biggest first', () => {
    expect(s.products.map((p) => [p.name, p.value])).toEqual([
      ['Engine oil 1L', 4920],
      ['Coolant', 1140],
      ['Wiper', 780],
    ]);
    expect(s.productUnits).toBe(23);
  });

  it('rolls a long tail into one line', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({
      productId: `m${i}`,
      kind: 'merchandise',
      name: `Item ${i}`,
      quantity: 1,
      revenue: 100 - i,
    }));
    const r = deriveSales({ merchandise: { salesValue: 900 }, pnl: { byProduct: many } });
    expect(r.products).toHaveLength(6);
    expect(r.products[5]).toMatchObject({
      name: '4 other products',
      quantity: 4,
      value: 95 + 94 + 93 + 92,
    });
  });

  it('shows one Products line when sales exist but no line detail does', () => {
    const r = deriveSales({ merchandise: { salesValue: 500 } });
    expect(r.products).toEqual([{ key: 'products', name: 'Products', quantity: 0, value: 500 }]);
  });

  it('names the closed Shifts and handles a day with none', () => {
    expect(s.closedShifts).toEqual([
      { key: 's1', label: 'Shift 1', sequence: 1, fuelValue: 212880 },
    ]);
    const none = deriveSales({});
    expect(none).toMatchObject({ total: 0, fuel: [], products: [], closedShifts: [] });
  });
});

describe('deriveSplitBar: closed solid, open hatched', () => {
  it('adds a hatched segment only while a Shift is open', () => {
    const closed = [{ key: 's1', label: 'Shift 1', sequence: 1, fuelValue: 200 }];
    expect(deriveSplitBar(closed, true).map((x) => x.kind)).toEqual(['closed', 'open']);
    expect(deriveSplitBar(closed, false).map((x) => x.kind)).toEqual(['closed']);
  });

  it('sizes the open segment like an average closed Shift', () => {
    const closed = [
      { key: 'a', label: 'A', sequence: 1, fuelValue: 100 },
      { key: 'b', label: 'B', sequence: 2, fuelValue: 300 },
    ];
    expect(deriveSplitBar(closed, true).map((x) => x.weight)).toEqual([100, 300, 200]);
  });

  it('is all hatched before the first Shift closes, and empty with nothing to show', () => {
    expect(deriveSplitBar([], true)).toEqual([{ key: 'open', kind: 'open', weight: 1 }]);
    expect(deriveSplitBar([], false)).toEqual([]);
  });
});

describe('deriveComparison: same Shift position on the previous Business Day', () => {
  const today = readSnapshot(preview);
  const prev = (shifts: unknown[]) => ({
    shifts,
  });

  it('compares the closed Shifts with the same number of the previous day', () => {
    const c = deriveComparison(
      deriveSales(today),
      prev([
        { shiftSequence: 1, templateName: 'Shift 1', fuelSalesValue: 204300 },
        { shiftSequence: 2, templateName: 'Shift 2', fuelSalesValue: 259010 },
      ]),
      '2026-10-08',
    );
    expect(c).toMatchObject({ direction: 'up', against: 'Thu Shift 1' });
    expect(c!.pct).toBeCloseTo(4.2, 1);
  });

  it('goes down and names several Shifts', () => {
    const two = deriveSales({
      fuel: { totalSalesValue: 400 },
      shifts: [
        { shiftSequence: 1, fuelSalesValue: 150 },
        { shiftSequence: 2, fuelSalesValue: 250 },
      ],
    });
    const c = deriveComparison(
      two,
      prev([
        { shiftSequence: 1, fuelSalesValue: 250 },
        { shiftSequence: 2, fuelSalesValue: 250 },
        { shiftSequence: 3, fuelSalesValue: 999 },
      ]),
      '2026-10-08',
    );
    expect(c).toMatchObject({ direction: 'down', against: 'Thu Shifts 1–2' });
    expect(c!.pct).toBe(-20);
  });

  it('is hidden, not zero, without comparable data', () => {
    const t = deriveSales(today);
    expect(deriveComparison(t, null, '2026-10-08')).toBeNull();
    expect(deriveComparison(t, prev([]), '2026-10-08')).toBeNull();
    // Snapshots frozen before per-Shift fuel value existed cannot be compared.
    expect(
      deriveComparison(t, prev([{ shiftSequence: 1, netVolume: 10 }]), '2026-10-08'),
    ).toBeNull();
    // The previous day had fewer Shifts than have closed today.
    expect(
      deriveComparison(
        deriveSales({
          shifts: [
            { shiftSequence: 1, fuelSalesValue: 1 },
            { shiftSequence: 2, fuelSalesValue: 1 },
          ],
        }),
        prev([{ shiftSequence: 1, fuelSalesValue: 5 }]),
        '2026-10-08',
      ),
    ).toBeNull();
    expect(
      deriveComparison(t, prev([{ shiftSequence: 1, fuelSalesValue: 0 }]), '2026-10-08'),
    ).toBeNull();
    // Nothing closed yet today: nothing to compare.
    expect(
      deriveComparison(
        deriveSales({}),
        prev([{ shiftSequence: 1, fuelSalesValue: 5 }]),
        '2026-10-08',
      ),
    ).toBeNull();
  });
});

describe('deriveTrend / sparklinePath', () => {
  const day = (businessDate: string, fuel: number, merch: number) => ({
    businessDate,
    snapshotData: { fuel: { totalSalesValue: fuel }, merchandise: { salesValue: merch } },
  });

  it('orders closed days oldest first and totals fuel plus products', () => {
    const t = deriveTrend([
      day('2026-10-08', 100, 5),
      day('2026-10-06', 90, 0),
      day('2026-10-07', 80, 10),
    ]);
    expect(t.map((p) => [p.date, p.total])).toEqual([
      ['2026-10-06', 90],
      ['2026-10-07', 90],
      ['2026-10-08', 105],
    ]);
  });

  it('draws one point per value across the width', () => {
    const d = sparklinePath([1, 2, 3], 84, 40);
    expect(d.startsWith('M0.0 ')).toBe(true);
    expect(d.split('L')).toHaveLength(3);
    expect(d).toContain('L84.0 ');
  });

  it('draws a flat line for equal values', () => {
    expect(sparklinePath([5, 5], 10, 10)).toBe('M0.0 5.0 L10.0 5.0');
  });
});
