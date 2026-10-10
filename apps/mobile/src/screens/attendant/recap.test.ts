import { describe, expect, it } from 'vitest';
import type { RecordHandoverResult } from '@pump/ui';
import type { AssignedDu } from '../../components/handover/model.js';
import {
  allDusRecorded,
  buildRecap,
  minutesOnShift,
  formatOnShift,
  varianceBadge,
} from './recap.js';

const du = (over: Partial<AssignedDu> = {}): AssignedDu => ({
  duId: 'du-1',
  duName: 'DU2',
  openingFloat: 2000,
  nozzles: [
    {
      nozzleId: 'n3',
      nozzleName: 'N3',
      productId: 'p',
      productName: 'Petrol',
      unit: 'L',
      openingReading: 1000,
      closingReading: 1100,
      testingVolume: 5,
      unitPrice: 100,
    },
  ],
  terminals: [],
  creditSales: [],
  omcSales: [],
  handover: null,
  ...over,
});

const recorded = (over: Record<string, unknown> = {}) => ({
  cashHandedOver: '12254',
  cardHandedOver: '8400',
  upiHandedOver: '14200',
  creditHandedOver: '19260',
  openingFloat: '2000',
  cashDrops: '20000',
  expectedCash: '12254',
  varianceAmount: '0',
  createdAt: '2026-10-09T16:34:00.000Z',
  ...over,
});

describe('allDusRecorded', () => {
  it('is true only when every DU holds a recorded Handover', () => {
    expect(allDusRecorded([du({ handover: recorded() })])).toBe(true);
    expect(allDusRecorded([du({ handover: recorded() }), du({ duId: 'du-2' })])).toBe(false);
    expect(allDusRecorded([])).toBe(false);
  });
});

describe('buildRecap from the recorded Handover (reload)', () => {
  it('summarises fuel from the nozzles and money from the handover row', () => {
    const recap = buildRecap({
      dus: [
        du({
          handover: recorded(),
          creditSales: [{ id: 'c1', amount: 19260 } as never],
        }),
      ],
      merchandise: { totalAmount: '1080', items: [{ quantity: '2' }, { quantity: '1' }] },
    });
    expect(recap.fuelLitres).toBe(95);
    expect(recap.fuelAmount).toBe(9500);
    expect(recap.productQuantity).toBe(3);
    expect(recap.productAmount).toBe(1080);
    expect(recap.creditSlips).toBe(1);
    expect(recap.creditAndCardAmount).toBe(19260 + 8400 + 14200);
    expect(recap.cashDrops).toBe(20000);
    expect(recap.cashHandedOver).toBe(12254);
    expect(recap.openingFloat).toBe(2000);
    expect(recap.variance).toBe(0);
    expect(recap.duNames).toEqual(['DU2']);
  });

  it('has no products when nothing was declared', () => {
    const recap = buildRecap({ dus: [du({ handover: recorded() })], merchandise: undefined });
    expect(recap.productQuantity).toBe(0);
    expect(recap.productAmount).toBe(0);
  });
});

describe('buildRecap from the accepted results', () => {
  const result = (over: Partial<RecordHandoverResult> = {}): RecordHandoverResult =>
    ({
      handover: recorded({
        duId: 'du-1',
        cashHandedOver: '5000',
        cashDrops: '1000',
        varianceAmount: '-250',
      }),
      terminalEntries: [],
      nozzleReadings: [{ nozzleId: 'n3', netVolume: 40 }],
      expectedFuelSales: 4000,
      creditSales: 300,
      omcCardSales: 200,
      varianceAmount: -250,
      ...over,
    }) as never;

  it('prefers the accepted result over the (possibly stale) assignment', () => {
    const recap = buildRecap({
      dus: [du({ handover: recorded() })],
      results: [result()],
      merchandise: undefined,
    });
    expect(recap.fuelLitres).toBe(40);
    expect(recap.fuelAmount).toBe(4000);
    expect(recap.cashHandedOver).toBe(5000);
    expect(recap.cashDrops).toBe(1000);
    expect(recap.creditAndCardAmount).toBe(300 + 200 + 8400 + 14200);
    expect(recap.variance).toBe(-250);
  });
});

describe('varianceBadge', () => {
  it('labels balanced, short and over', () => {
    expect(varianceBadge(0).label).toBe('Balanced');
    expect(varianceBadge(0.4).label).toBe('Balanced');
    expect(varianceBadge(-125).label).toMatch(/^Short/);
    expect(varianceBadge(60).label).toMatch(/^Over/);
  });
});

describe('time on shift', () => {
  it('counts whole minutes from the shift opening, never negative', () => {
    const opened = '2026-10-10T08:00:00.000Z';
    expect(minutesOnShift(opened, new Date('2026-10-10T11:12:30.000Z').getTime())).toBe(192);
    expect(minutesOnShift(opened, new Date('2026-10-10T07:00:00.000Z').getTime())).toBe(0);
    expect(minutesOnShift(null, Date.now())).toBeNull();
  });
  it('formats as hours and minutes', () => {
    expect(formatOnShift(192)).toBe('3h 12m');
    expect(formatOnShift(45)).toBe('45m');
    expect(formatOnShift(120)).toBe('2h 00m');
  });
});
