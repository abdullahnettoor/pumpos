import { describe, expect, it } from 'vitest';
import { deriveDssrRangeKpis, readDssrCashSales, readDssrNetVolume } from './dssr-range-kpis.js';

/** A closed day as `composeDssr` freezes it (#516). */
const closedDay = {
  id: 'd1',
  businessDate: '2026-10-09',
  snapshotData: {
    shiftsIncluded: 2,
    fuel: {
      totalVolume: 2200,
      totalNetVolume: 2180,
      byProduct: [
        { productName: 'Diesel', unit: 'L', grossVolume: 1130, netVolume: 1120 },
        { productName: 'Petrol', unit: 'Litre', grossVolume: 1070, netVolume: 1060 },
      ],
    },
    cashSales: 71275.5,
  },
};

describe('readDssrNetVolume', () => {
  it('reads net volume per unit from the fuel roll-up', () => {
    expect(readDssrNetVolume(closedDay.snapshotData)).toEqual({ L: 2180 });
  });

  it('keeps kilograms apart from litres', () => {
    const snap = {
      fuel: {
        totalNetVolume: 140,
        byProduct: [
          { unit: 'L', netVolume: 100 },
          { unit: 'kg', netVolume: 40 },
        ],
      },
    };
    expect(readDssrNetVolume(snap)).toEqual({ L: 100, kg: 40 });
  });

  it('falls back to the day total, then the old key, for snapshots without a roll-up', () => {
    expect(readDssrNetVolume({ fuel: { totalNetVolume: 980 } })).toEqual({ L: 980 });
    expect(readDssrNetVolume({ totalVolumeSold: 500 })).toEqual({ L: 500 });
    expect(readDssrNetVolume({})).toEqual({});
  });
});

describe('readDssrCashSales', () => {
  it('reads the frozen cash sales figure', () => {
    expect(readDssrCashSales(closedDay.snapshotData)).toBe(71275.5);
  });

  it('is null for a snapshot frozen before cash sales were recorded', () => {
    expect(readDssrCashSales({ fuel: { totalNetVolume: 10 } })).toBeNull();
  });
});

describe('deriveDssrRangeKpis', () => {
  it('sums net volume and cash sales across closed days', () => {
    const kpis = deriveDssrRangeKpis([
      closedDay,
      { ...closedDay, id: 'd2', snapshotData: { ...closedDay.snapshotData, cashSales: 1000 } },
    ]);
    expect(kpis.count).toBe(2);
    expect(kpis.volumeLabel).toBe('4,360 L');
    expect(kpis.cashSales).toBe(72275.5);
    expect(kpis.daysWithoutCash).toBe(0);
  });

  it('counts older days that carry no cash figure instead of reading them as zero', () => {
    const old = { id: 'd0', businessDate: '2026-10-01', snapshotData: { totalVolumeSold: 500 } };
    const kpis = deriveDssrRangeKpis([closedDay, old]);
    expect(kpis.volumeLabel).toBe('2,680 L');
    expect(kpis.cashSales).toBe(71275.5);
    expect(kpis.daysWithoutCash).toBe(1);
  });

  it('reads an empty range as zero litres and no cash figure', () => {
    expect(deriveDssrRangeKpis([])).toEqual({
      count: 0,
      volumeLabel: '0 L',
      cashSales: null,
      daysWithoutCash: 0,
    });
  });
});
