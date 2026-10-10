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
  const tank = (over: Record<string, unknown>) => ({
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
      tank({}),
      tank({
        tankName: 'Tank 2',
        productName: 'Diesel',
        expectedQuantity: 8620,
        actualQuantity: 8620,
        varianceQuantity: 0,
      }),
      tank({
        tankName: 'Tank 3',
        productName: 'Diesel',
        expectedQuantity: 100,
        actualQuantity: 105,
        varianceQuantity: 5,
      }),
    ],
  };
  it('shows book against dip, the variance in litres and its tone', () => {
    const [a, , c] = deriveTankMovement(snap);
    expect(a).toMatchObject({
      title: 'Tank 1 · Petrol',
      movement: 'Book 14,820 → Dip 14,802 L',
      variance: '−18 L',
      tone: 'bad',
    });
    expect(c).toMatchObject({ variance: '+5 L', tone: 'warn' });
  });
  it('is level within tolerance', () => {
    const [row] = deriveTankMovement({
      fuelStockVariance: [tank({ varianceQuantity: -0.5 })],
    });
    expect(row.tone).toBe('default');
    expect(
      deriveTankMovement({ fuelStockVariance: [tank({ varianceQuantity: 0 })] })[0].variance,
    ).toBe('0 L');
  });
  it('shows Sold only when the product has a single tank', () => {
    const rows = deriveTankMovement(snap);
    expect(rows[0].sold).toBe('Sold 2,210 L');
    expect(rows[1].sold).toBeUndefined();
    expect(rows[2].sold).toBeUndefined();
  });
  it('is empty without tank reconciliation (no dips that day)', () => {
    expect(deriveTankMovement({})).toEqual([]);
  });
});
