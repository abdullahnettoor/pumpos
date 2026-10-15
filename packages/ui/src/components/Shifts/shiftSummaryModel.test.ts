import { describe, expect, it } from 'vitest';
import {
  businessDayContext,
  creditTotalNotes,
  fuelTotalNotes,
  readShiftSummary,
  totalNote,
  volumeTotalNotes,
} from './shiftSummaryModel.js';
import { creditTotalRow, fuelTotalRow, nozzleTotalRow } from './shiftSummaryColumns.js';

const record = (snap: Record<string, any>, extra: Record<string, any> = {}) => ({
  shiftId: 's1',
  businessDate: '2026-10-14',
  shiftSequence: 2,
  status: 'CLOSED',
  snapshotData: { shiftId: 's1', templateName: 'Morning', ...snap },
  ...extra,
});

const nozzle = (name: string, unit: string, gross: number, testing: number, net?: number) => ({
  nozzleId: name,
  nozzleName: name,
  productName: 'Petrol',
  productCode: 'MS',
  unit,
  openingReading: 100,
  closingReading: 100 + gross,
  volumeSold: gross,
  testingVolume: testing,
  ...(net != null && { netVolume: net }),
});

describe('readShiftSummary', () => {
  it('reads the stored volume totals, never re-adding the rows', () => {
    const s = readShiftSummary(
      record({
        nozzleReadings: [nozzle('N1', 'L', 10, 1, 9), nozzle('N2', 'L', 20, 0)],
        totalVolumeSold: 30.5,
        totalTestingVolume: 1,
        totalNetVolumeSold: 29.5,
      }),
    );
    expect(s.nozzles[1].net).toBe(20);
    expect(s.volumes).toEqual({
      unit: 'L',
      units: ['L'],
      gross: 30.5,
      testing: 1,
      net: 29.5,
    });
    expect(nozzleTotalRow(s)).toEqual({
      label: 'Total of 2 nozzles',
      values: { gross: 30.5, testing: 1, net: 29.5 },
      units: { gross: 'L', testing: 'L', net: 'L' },
      derive: false,
    });
    expect(volumeTotalNotes(s.volumes)).toEqual([]);
  });

  it('never adds volumes across units', () => {
    const s = readShiftSummary(
      record({
        nozzleReadings: [nozzle('N1', 'L', 10, 0), nozzle('C1', 'kg', 5, 0)],
        totalVolumeSold: 15,
      }),
    );
    expect(s.volumes.gross).toBeNull();
    expect(nozzleTotalRow(s).valueOf()).toMatchObject({
      values: { gross: null, testing: null, net: null },
    });
    expect(totalNote(volumeTotalNotes(s.volumes))).toBe(
      'Total: volumes not added across L and kg.',
    );
  });

  it('leaves a total the snapshot does not store blank, with a note', () => {
    const s = readShiftSummary(
      record({
        nozzleReadings: [nozzle('N1', 'L', 10, 0)],
        fuelByProduct: [
          { productName: 'Petrol', grossVolume: 10, netVolume: 10, salesValue: 1000 },
        ],
        totalVolumeSold: 10,
        totalTestingVolume: 0,
        creditSales: [{ id: 'c1', amount: 500 }],
      }),
    );
    expect(s.fuelSalesValue).toBeNull();
    expect(fuelTotalRow(s)).toMatchObject({ values: { gross: 10, testing: 0 } });
    expect(fuelTotalNotes(s)).toEqual([
      'net volume not stored for this shift',
      'sales value total not stored for this shift',
    ]);
    expect(creditTotalRow(s)).toEqual({
      label: 'Total of 1 credit sale',
      values: {},
      derive: false,
    });
    expect(creditTotalNotes(s)).toEqual(['credit sales total not stored for this shift']);
  });

  it('reads stored fuel and credit totals', () => {
    const s = readShiftSummary(
      record({ totalFuelSalesValue: 1234.5, creditSalesTotal: 800, creditSales: [] }),
    );
    expect(s.fuelSalesValue).toBe(1234.5);
    expect(creditTotalRow(s)).toMatchObject({ values: { amount: 800 }, derive: false });
  });

  it('adds card and UPI in paise', () => {
    const s = readShiftSummary(
      record({
        handovers: [{ id: 'h1', attendantName: 'Ravi', cardHandedOver: 0.1, upiHandedOver: 0.2 }],
        terminalBreakdown: [
          {
            terminalId: 't1',
            terminalLabel: 'POS 1',
            card: 0.1,
            upi: 0.2,
            entries: [
              { attendantName: 'Ravi', duCode: 'DU1', card: 0.1, upi: 0 },
              { attendantName: 'Asha', duCode: '', card: 0, upi: 0 },
            ],
          },
        ],
      }),
    );
    expect(s.handovers[0].cardUpi).toBe(0.3);
    expect(s.terminals[0].total).toBe(0.3);
    expect(s.terminals[0].handledBy).toEqual(['Ravi · DU1']);
  });

  it('reads the two-level cash reconciliation with its drops', () => {
    const s = readShiftSummary(
      record({
        cashVarianceModel: 2,
        openingCash: 1000,
        cashSalesSum: 5000,
        handoverCashDrops: 2000,
        closeCashDrops: 0,
        expectedCash: 3000,
        closingCash: 2990,
        attendantVariance: -5,
        cashVariance: -10,
      }),
    );
    expect(s.cash.map((l) => [l.key, l.amount])).toEqual([
      ['opening', 1000],
      ['cashSales', 5000],
      ['handoverDrops', 2000],
      ['expected', 3000],
      ['counted', 2990],
      ['attendantVariance', -5],
      ['cashVariance', -10],
    ]);
    expect(s.cash.find((l) => l.key === 'cashVariance')?.label).toBe('Office count variance');
  });

  it('keeps the single cash variance line for a pre-#287 snapshot', () => {
    const s = readShiftSummary(record({ cashVariance: 0, cashDrops: 50 }));
    expect(s.twoLevel).toBe(false);
    expect(s.cash.map((l) => l.key)).toEqual([
      'opening',
      'cashSales',
      'handoverDrops',
      'expected',
      'counted',
      'cashVariance',
    ]);
    expect(s.cash.at(-1)?.label).toBe('Cash variance');
  });

  it('names the shift and reads its state', () => {
    const s = readShiftSummary(record({}, { status: 'LOCKED' }));
    expect(s.label).toBe('20261014-2');
    expect(s.locked).toBe(true);
    expect(s.template).toBe('Morning');
  });

  it('names each volume total a partial snapshot lacks', () => {
    const s = readShiftSummary(
      record({ nozzleReadings: [nozzle('N1', 'L', 10, 0)], totalNetVolumeSold: 10 }),
    );
    expect(nozzleTotalRow(s)).toMatchObject({ values: { net: 10 } });
    expect(volumeTotalNotes(s.volumes)).toEqual([
      'gross and testing volumes not stored for this shift',
    ]);
    const t = readShiftSummary(
      record({
        nozzleReadings: [nozzle('N1', 'L', 10, 0)],
        totalVolumeSold: 10,
        totalNetVolumeSold: 10,
      }),
    );
    expect(volumeTotalNotes(t.volumes)).toEqual(['testing volume not stored for this shift']);
  });
});

describe('businessDayContext', () => {
  it('says whether the shift is on a past day, without dates', () => {
    expect(businessDayContext('2026-10-13', '2026-10-14')).toMatch(/^A past business day/);
    expect(businessDayContext('2026-10-14', '2026-10-14')).toBe("Today's business day.");
    expect(businessDayContext(null, '2026-10-14')).toBeNull();
  });
});
