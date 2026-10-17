import { describe, expect, it } from 'vitest';
import {
  comparisonView,
  deriveComparison,
  deriveSales,
  deriveSplitBar,
  deriveTrend,
  sparklinePath,
  businessWeekday,
} from './sales-headline.js';
import { readSnapshot } from './dssr-snapshot.js';
import { unitLabel, volumeLabel, wholeQuantityLabel } from './quantity-label.js';

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
      ],
    },
    merchandise: { salesValue: 6840 },
    pnl: {
      byProduct: [
        {
          productId: 'm1',
          kind: 'merchandise',
          name: 'Engine oil 1L',
          quantity: 14,
          revenue: 6840,
        },
      ],
    },
    shifts: [
      {
        shiftId: 's1',
        shiftSequence: 1,
        templateName: 'Shift 1',
        netVolume: 2180,
        fuelSalesValue: 212880,
      },
    ],
  },
};

describe('sales-headline shared utilities', () => {
  it('reads snapshot data safely', () => {
    expect(readSnapshot(preview).fuel).toBe(preview.snapshotData.fuel);
    expect(readSnapshot(null)).toEqual({});
  });

  it('formats units and whole quantities', () => {
    expect(unitLabel('ltr')).toBe('L');
    expect(unitLabel('kilograms')).toBe('kg');
    expect(wholeQuantityLabel(2211, 'L')).toBe('2,211 L');
    expect(
      volumeLabel(
        new Map([
          ['L', 100],
          ['kg', 40],
        ]),
      ),
    ).toBe('100 L · 40 kg');
    expect(volumeLabel({ L: 2211 })).toBe('2,211 L');
    expect(volumeLabel({})).toBe('0 L');
    expect(businessWeekday('2026-10-09')).toBe('Fri');
  });

  it('derives sales correctly from closed shifts only for fuel', () => {
    const s = deriveSales(readSnapshot(preview));
    expect(s.fuelValue).toBe(212880);
    expect(s.productsValue).toBe(6840);
    expect(s.total).toBe(219720);
    expect(s.fuelVolumeLabel).toBe('2,180 L');
  });

  it('compares with previous day shift', () => {
    const today = deriveSales(readSnapshot(preview));
    const comp = deriveComparison(
      today,
      {
        shifts: [{ shiftSequence: 1, templateName: 'Shift 1', fuelSalesValue: 200000 }],
      },
      '2026-10-08',
    );
    expect(comp?.direction).toBe('up');
    expect(comp?.against).toBe('Thu Shift 1');
    const view = comparisonView(comp!);
    expect(view.arrow).toBe('▲');
    expect(view.text).toContain('Thu Shift 1');
  });
});
