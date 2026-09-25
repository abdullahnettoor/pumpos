import { describe, expect, it } from 'vitest';
import type { AttendantReportShift } from '@pump/shared';
import { sliceAttendantStatementByDay } from './attendantStatementDays.js';
import type { AttendantStatementData } from './attendantReportDoc.js';

function shift(over: Partial<AttendantReportShift> = {}): AttendantReportShift {
  return {
    shiftId: 'sh-1',
    businessDate: '2026-03-01',
    shiftTemplateName: 'Morning',
    closedAt: '2026-03-01T14:00:00.000Z',
    dispensers: [],
    cashHandedOver: 1000,
    cardHandedOver: 200,
    upiHandedOver: 300,
    creditHandedOver: 100,
    expectedFuelSales: 1650,
    billedSales: 400,
    handoverProductSales: 900,
    creditSales: 800,
    creditSaleLines: [],
    varianceAmount: -50,
    testingVolume: 5,
    ...over,
  };
}

function statement(shifts: AttendantReportShift[]): AttendantStatementData {
  const totals = shifts.reduce(
    (acc, sh) => ({
      cashHandedOver: acc.cashHandedOver + sh.cashHandedOver,
      cardHandedOver: acc.cardHandedOver + sh.cardHandedOver,
      upiHandedOver: acc.upiHandedOver + sh.upiHandedOver,
      creditHandedOver: acc.creditHandedOver + sh.creditHandedOver,
      expectedFuelSales: acc.expectedFuelSales + sh.expectedFuelSales,
      billedSales: acc.billedSales + sh.billedSales,
      handoverProductSales: acc.handoverProductSales + sh.handoverProductSales,
      creditSales: acc.creditSales + sh.creditSales,
      varianceAmount: acc.varianceAmount + sh.varianceAmount,
    }),
    {
      cashHandedOver: 0,
      cardHandedOver: 0,
      upiHandedOver: 0,
      creditHandedOver: 0,
      expectedFuelSales: 0,
      billedSales: 0,
      handoverProductSales: 0,
      creditSales: 0,
      varianceAmount: 0,
    },
  );
  return {
    attendantId: 'att-1',
    attendantName: 'Ravi',
    shiftsWorked: shifts.length,
    handoverCount: shifts.reduce((acc, sh) => acc + sh.dispensers.length, 0),
    totals,
    shifts,
    from: '2026-03-01',
    to: '2026-03-03',
    generatedAt: '2026-03-04T06:00:00.000Z',
  };
}

describe('sliceAttendantStatementByDay', () => {
  it('cuts one statement per business day, in date order', () => {
    const days = sliceAttendantStatementByDay(
      statement([
        shift({ shiftId: 'sh-3', businessDate: '2026-03-03' }),
        shift({ shiftId: 'sh-1', businessDate: '2026-03-01' }),
        shift({ shiftId: 'sh-2', businessDate: '2026-03-02' }),
      ]),
    );

    expect(days.map((d) => d.businessDate)).toEqual(['2026-03-01', '2026-03-02', '2026-03-03']);
    expect(days.map((d) => d.data.shifts.map((s) => s.shiftId))).toEqual([
      ['sh-1'],
      ['sh-2'],
      ['sh-3'],
    ]);
  });

  it('keeps both shifts of a day together on that day', () => {
    const days = sliceAttendantStatementByDay(
      statement([
        shift({ shiftId: 'sh-a', businessDate: '2026-03-01', shiftTemplateName: 'Morning' }),
        shift({ shiftId: 'sh-b', businessDate: '2026-03-01', shiftTemplateName: 'Night' }),
      ]),
    );

    expect(days).toHaveLength(1);
    expect(days[0].data.shiftsWorked).toBe(2);
    expect(days[0].data.totals.cashHandedOver).toBe(2000);
  });

  it('never lets the day pages disagree with the cover page', () => {
    const period = statement([
      shift({ shiftId: 'sh-1', businessDate: '2026-03-01', varianceAmount: -50 }),
      shift({ shiftId: 'sh-2', businessDate: '2026-03-02', varianceAmount: 120 }),
      shift({ shiftId: 'sh-3', businessDate: '2026-03-02', varianceAmount: -70.5 }),
    ]);
    const days = sliceAttendantStatementByDay(period);

    const summed = days.reduce(
      (acc, d) => ({
        variance: acc.variance + d.data.totals.varianceAmount,
        cash: acc.cash + d.data.totals.cashHandedOver,
        credit: acc.credit + d.data.totals.creditSales,
        shifts: acc.shifts + d.data.shiftsWorked,
      }),
      { variance: 0, cash: 0, credit: 0, shifts: 0 },
    );

    expect(summed.variance).toBe(period.totals.varianceAmount);
    expect(summed.cash).toBe(period.totals.cashHandedOver);
    expect(summed.credit).toBe(period.totals.creditSales);
    expect(summed.shifts).toBe(period.shiftsWorked);
  });

  it('carries the period meta onto every day page', () => {
    const days = sliceAttendantStatementByDay(
      statement([
        shift({ businessDate: '2026-03-01' }),
        shift({ shiftId: 'sh-2', businessDate: '2026-03-02' }),
      ]),
    );

    // A day page belongs to the statement it was cut from: it must not claim
    // to be a narrower report, nor to have been generated at a later instant.
    for (const day of days) {
      expect(day.data.from).toBe('2026-03-01');
      expect(day.data.to).toBe('2026-03-03');
      expect(day.data.generatedAt).toBe('2026-03-04T06:00:00.000Z');
      expect(day.data.attendantName).toBe('Ravi');
    }
  });

  it('yields no days for an attendant with no shifts, rather than a blank one', () => {
    expect(sliceAttendantStatementByDay(statement([]))).toEqual([]);
  });
});
