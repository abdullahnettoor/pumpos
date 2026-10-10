import { describe, expect, it } from 'vitest';
import type { BusinessDayListStatus } from '@pump/shared';
import { deriveShiftRows, deriveTankMovement, stepTargets } from './dssr.js';

const day = (businessDate: string, status: BusinessDayListStatus) => ({ businessDate, status });
// Newest first, as the Reports list returns them.
const list = [
  day('2026-10-09', 'LIVE'),
  day('2026-10-08', 'DRAFT'),
  day('2026-10-07', 'REPORT_MISSING'),
  day('2026-10-06', 'SEALED'),
  day('2026-10-05', 'SEALED'),
];
const opts = { hasOlderMonths: false, canGoHome: true };

describe('stepTargets', () => {
  it('steps newer into the Live day as Home, never as a DSSR', () => {
    expect(stepTargets(list, '2026-10-08', opts).newer).toEqual({ kind: 'home' });
  });
  it('has no newer step when Home is not reachable or nothing is newer', () => {
    expect(stepTargets(list, '2026-10-08', { ...opts, canGoHome: false }).newer).toBeNull();
    expect(stepTargets(list, '2026-10-09', opts).newer).toBeNull();
  });
  it('skips a Report-missing day in both directions', () => {
    expect(stepTargets(list, '2026-10-08', opts).older).toEqual({
      kind: 'day',
      date: '2026-10-06',
    });
    expect(stepTargets(list, '2026-10-06', opts).newer).toEqual({
      kind: 'day',
      date: '2026-10-08',
    });
  });
  it('asks to load an older month at the end of the loaded list, only when there is one', () => {
    expect(stepTargets(list, '2026-10-05', opts).older).toBeNull();
    expect(stepTargets(list, '2026-10-05', { ...opts, hasOlderMonths: true }).older).toEqual({
      kind: 'load',
    });
  });
  it('keeps loading when the loaded tail holds only days without a DSSR', () => {
    const tail = [day('2026-10-08', 'SEALED'), day('2026-10-07', 'REPORT_MISSING')];
    expect(stepTargets(tail, '2026-10-08', { ...opts, hasOlderMonths: true }).older).toEqual({
      kind: 'load',
    });
  });
  it('has no neighbours for a date outside the loaded list', () => {
    expect(stepTargets(list, '2026-01-01', { ...opts, hasOlderMonths: true })).toEqual({
      older: null,
      newer: null,
    });
  });
});

describe('deriveShiftRows', () => {
  const snap = {
    shifts: [
      {
        shiftId: 's2',
        shiftSequence: 2,
        templateName: 'Evening',
        closedAt: '2026-10-08T16:34:00Z',
        cashVariance: 0,
        netVolume: 2542,
        fuelSalesValue: 259010,
      },
      {
        shiftId: 's1',
        shiftSequence: 1,
        templateName: null,
        closedAt: '2026-10-08T08:28:00Z',
        cashVariance: -120,
        netVolume: 2210.4,
        fuelSalesValue: null,
      },
    ],
  };
  it('lists Shifts in order with chip, close time, litres and the office-count badge', () => {
    const rows = deriveShiftRows(snap, 'Asia/Kolkata');
    expect(rows.map((r) => r.shiftId)).toEqual(['s1', 's2']);
    expect(rows[0]).toMatchObject({
      chip: 'S1',
      title: 'Shift 1',
      meta: 'Closed 1:58 pm · 2,210 L',
      fuelValue: null,
      badge: { tone: 'bad', balanced: false },
    });
    expect(rows[1]).toMatchObject({
      title: 'Evening',
      fuelValue: 259010,
      badge: { balanced: true },
    });
  });
  it('is empty for a snapshot with no Shifts', () => {
    expect(deriveShiftRows({}, 'Asia/Kolkata')).toEqual([]);
  });
});

describe('deriveTankMovement', () => {
  const movement = {
    tankId: 't1',
    openingQuantity: 14450,
    receivedQuantity: 300,
    soldQuantity: 2210.5,
    adjustedQuantity: 20,
    closingQuantity: 12559.5,
  };
  const tank = (over: Record<string, unknown>) => ({
    tankName: 'Tank 1',
    productName: 'Petrol',
    unit: 'Litre',
    expectedQuantity: 12559.5,
    actualQuantity: 12541.5,
    varianceQuantity: -18,
    tankMovement: movement,
    ...over,
  });

  describe('a snapshot that carries the tank movement', () => {
    it('shows opening → closing, sold, received, the dip and the variance in litres', () => {
      const [row] = deriveTankMovement({ fuelStockVariance: [tank({})] });
      expect(row).toMatchObject({
        title: 'Tank 1 · Petrol',
        movement: 'Opening 14,450 → Closing 12,559.5 L',
        detail: 'Sold 2,210.5 L · Received 300 L · Dip 12,541.5 L',
        variance: '−18 L',
        tone: 'bad', // 18 L is 0.81% of 2,210.5 L sold: over the 0.5% tolerance
      });
    });
    it('judges the variance against what THIS tank sold, per the shared tolerance', () => {
      const big = deriveTankMovement({
        fuelStockVariance: [
          tank({ tankMovement: { ...movement, soldQuantity: 4000 } }), // 18 L of 4,000 L = 0.45%
        ],
      })[0];
      expect(big.tone).toBe('default');
      const small = deriveTankMovement({ fuelStockVariance: [tank({})] })[0];
      expect(small.tone).toBe('bad');
      const over = deriveTankMovement({
        fuelStockVariance: [tank({ varianceQuantity: 25 })],
      })[0];
      expect(over).toMatchObject({ variance: '+25 L', tone: 'warn' });
    });
    it('omits Received when nothing was delivered, and tolerates no variance when nothing sold', () => {
      const [row] = deriveTankMovement({
        fuelStockVariance: [
          tank({
            varianceQuantity: -1,
            tankMovement: { ...movement, receivedQuantity: 0, soldQuantity: 0 },
          }),
        ],
      });
      expect(row.detail).toBe('Sold 0 L · Dip 12,541.5 L');
      expect(row.tone).toBe('bad');
    });
  });

  describe('a snapshot frozen before the tank movement was recorded', () => {
    const old = (over: Record<string, unknown>) => ({
      tankName: 'Tank 1',
      productName: 'Petrol',
      unit: 'Litre',
      expectedQuantity: 14820,
      actualQuantity: 14802,
      varianceQuantity: -18,
      ...over,
    });
    const snap = {
      fuel: {
        byProduct: [
          { productName: 'Petrol', netVolume: 2210, grossVolume: 2214 },
          { productName: 'Diesel', netVolume: 2380 },
        ],
      },
      fuelStockVariance: [
        old({}),
        old({
          tankName: 'Tank 2',
          productName: 'Diesel',
          expectedQuantity: 8620,
          actualQuantity: 8620,
          varianceQuantity: 0,
        }),
        old({
          tankName: 'Tank 3',
          productName: 'Diesel',
          expectedQuantity: 100,
          actualQuantity: 105,
          varianceQuantity: 5,
        }),
      ],
    };
    it('falls back to book against dip with the variance and its tone', () => {
      const [a, b, c] = deriveTankMovement(snap);
      expect(a).toMatchObject({
        movement: 'Book 14,820 → Dip 14,802 L',
        variance: '−18 L',
        tone: 'bad',
      });
      expect(b).toMatchObject({ variance: '0 L', tone: 'default' });
      expect(c).toMatchObject({ variance: '+5 L', tone: 'warn' });
    });
    it('shows Sold only when the product has a single tank', () => {
      const rows = deriveTankMovement(snap);
      expect(rows[0].detail).toBe('Sold 2,210 L');
      expect(rows[1].detail).toBeUndefined();
      expect(rows[2].detail).toBeUndefined();
    });
    it('tolerates a variance against the one-tank product sales, else none', () => {
      const one = (varianceQuantity: number) =>
        deriveTankMovement({
          fuel: { byProduct: [{ productName: 'Petrol', netVolume: 4000 }] },
          fuelStockVariance: [old({ varianceQuantity })],
        })[0].tone;
      expect(one(-18)).toBe('default'); // 0.45% of 4,000 L
      expect(one(-25)).toBe('bad');
    });
  });

  it('is empty without tank reconciliation (no dips that day)', () => {
    expect(deriveTankMovement({})).toEqual([]);
  });
});
