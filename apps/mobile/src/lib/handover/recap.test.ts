import { formatRecordedTime, describe, expect, it } from 'vitest';
import type { RecordHandoverResult } from '@pump/ui';
import type { AssignedDu, HandoverRow } from './model.js';
import { buildRecap, minutesOnShift, formatOnShift } from './recap.js';

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
      netVolume: 95,
      unitPrice: 100,
    },
  ],
  terminals: [],
  creditSales: [],
  omcSales: [],
  handover: null,
  ...over,
});

const row = (over: Partial<HandoverRow> = {}): HandoverRow => ({
  duId: 'du-1',
  cashHandedOver: '12254',
  cardHandedOver: '8400',
  upiHandedOver: '14200',
  creditHandedOver: '19260',
  expectedSales: '9500',
  openingFloat: '2000',
  cashDrops: '20000',
  expectedCash: '12254',
  varianceAmount: '0',
  createdAt: '2026-10-09T16:34:00.000Z',
  ...over,
});

/** The server's answer to a save, built from the stored row. */
const resultFor = (r: HandoverRow, over: Partial<RecordHandoverResult> = {}) =>
  ({
    handover: r,
    terminalEntries: [],
    nozzleReadings: [{ nozzleId: 'n3', netVolume: 95 }],
    expectedFuelSales: Number(r.expectedSales),
    creditSales: Number(r.creditHandedOver),
    omcCardSales: 0,
    varianceAmount: Number(r.varianceAmount),
    ...over,
  }) as unknown as RecordHandoverResult;

describe('buildRecap from the recorded Handover (reload)', () => {
  it('reads fuel, credit and money straight from the stored handover', () => {
    const recap = buildRecap({
      dus: [du({ handover: row(), creditSales: [{ id: 'c1', amount: 19260 } as never] })],
      merchandise: { totalAmount: '1080', items: [{ quantity: '2' }, { quantity: '1' }] },
    })!;
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

  it('does not recompute the fuel value from the nozzles', () => {
    // The stored figure wins even if the readings would say otherwise.
    const recap = buildRecap({
      dus: [du({ handover: row({ expectedSales: '1234' }) })],
      merchandise: undefined,
    })!;
    expect(recap.fuelAmount).toBe(1234);
  });

  it('has no products when nothing was declared', () => {
    const recap = buildRecap({ dus: [du({ handover: row() })], merchandise: undefined })!;
    expect(recap.productQuantity).toBe(0);
    expect(recap.productAmount).toBe(0);
  });
});

describe('buildRecap: save and reload agree', () => {
  const omc = { id: 'o1', amount: 700, customerId: null } as never;
  const slip = { id: 'c1', amount: 19260, customerId: 'cu' } as never;
  const stored = row({ creditHandedOver: '19260', cardHandedOver: '5000', upiHandedOver: '400' });
  const terminals = [
    { terminalId: 't1', label: 'T1' },
    { terminalId: 't2', label: 'T2' },
  ];
  const entries = [
    { terminalId: 't1', cardAmount: '5000', upiAmount: '400', batchRef: null },
    { terminalId: 't2', cardAmount: '0', upiAmount: '0', batchRef: null },
  ];
  const merchandise = { totalAmount: '1080', items: [{ quantity: '2' }, { quantity: '1' }] };

  // The same Handover, once as the save's answer and once as the reloaded assignment.
  const saved = buildRecap({
    dus: [du({ terminals, creditSales: [slip], omcSales: [omc] })],
    results: [
      resultFor(stored, {
        omcCardSales: 700,
        terminalEntries: entries as never,
      }),
    ],
    merchandise,
  });
  const reloaded = buildRecap({
    dus: [
      du({
        terminals,
        creditSales: [slip],
        omcSales: [omc],
        handover: stored,
        terminalEntries: entries,
      }),
    ],
    merchandise,
  });

  it('produces identical figures', () => {
    expect(saved).not.toBeNull();
    expect(reloaded).toEqual(saved);
  });

  it('includes OMC card sales on both paths', () => {
    expect(reloaded!.creditAndCardAmount).toBe(19260 + 700 + 5000 + 400);
    expect(saved!.creditAndCardAmount).toBe(19260 + 700 + 5000 + 400);
  });

  it('counts slips and names only the terminals that took money', () => {
    expect(reloaded!.creditSlips).toBe(2);
    expect(reloaded!.terminalLabels).toEqual(['T1']);
    expect(reloaded!.hasAggregateCardUpi).toBe(false);
  });

  it('flags aggregate card/UPI when the Station has no terminals', () => {
    const recap = buildRecap({
      dus: [du({ handover: stored })],
      merchandise: undefined,
    })!;
    expect(recap.terminalLabels).toEqual([]);
    expect(recap.hasAggregateCardUpi).toBe(true);
  });

  it('prefers the accepted result over the (possibly stale) assignment', () => {
    const recap = buildRecap({
      dus: [du({ handover: row() })],
      results: [
        resultFor(row({ cashHandedOver: '5000', cashDrops: '1000', varianceAmount: '-250' })),
      ],
      merchandise: undefined,
    })!;
    expect(recap.cashHandedOver).toBe(5000);
    expect(recap.cashDrops).toBe(1000);
    expect(recap.variance).toBe(-250);
  });
});

describe('buildRecap completeness', () => {
  const two = [du(), du({ duId: 'du-2', duName: 'DU3' })];

  it('is null while no DU is recorded, or none at all', () => {
    expect(buildRecap({ dus: [], merchandise: undefined })).toBeNull();
    expect(buildRecap({ dus: [du()], merchandise: undefined })).toBeNull();
  });

  it('is null while any DU is still unrecorded', () => {
    const partial = [du({ handover: row() }), two[1]];
    expect(buildRecap({ dus: partial, merchandise: undefined })).toBeNull();
  });

  it('is null when the session saved only some of the DUs', () => {
    expect(
      buildRecap({ dus: two, results: [resultFor(row())], merchandise: undefined }),
    ).toBeNull();
  });

  it('sums every DU once all are recorded, mixing results and the assignment', () => {
    const recap = buildRecap({
      dus: [du({ handover: row({ duId: 'du-1' }) }), two[1]],
      results: [resultFor(row({ duId: 'du-2', cashHandedOver: '1000' }))],
      merchandise: undefined,
    })!;
    expect(recap.duNames).toEqual(['DU2', 'DU3']);
    expect(recap.cashHandedOver).toBe(12254 + 1000);
    expect(recap.fuelLitres).toBe(190);
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

describe('formatRecordedTime', () => {
  it('reads in the station timezone, not the device one', () => {
    expect(formatRecordedTime('2026-10-09T12:10:00.000Z', 'Asia/Kolkata')).toBe('5:40 pm');
    expect(formatRecordedTime('2026-10-09T12:10:00.000Z', 'UTC')).toBe('12:10 pm');
  });
  it('is null for a missing or unreadable time', () => {
    expect(formatRecordedTime(null, 'UTC')).toBeNull();
    expect(formatRecordedTime('nope', 'UTC')).toBeNull();
  });
});
