import type { AttendantReportShift, AttendantReportTotals } from '@pump/shared';
import type { AttendantStatementData } from './attendantStatementData.js';

/**
 * One Business Day of an Attendant's statement.
 *
 * A statement covering a range is read a day at a time — "what happened on the
 * 3rd" is the question, not "what happened across the month". Each day is
 * shaped as a complete statement of its own so every section the document
 * already knows how to render can be pointed at a day without being taught
 * what a day is.
 */
export interface AttendantStatementDay {
  businessDate: string;
  data: AttendantStatementData;
}

const emptyTotals = (): AttendantReportTotals => ({
  cashHandedOver: 0,
  cardHandedOver: 0,
  upiHandedOver: 0,
  creditHandedOver: 0,
  expectedFuelSales: 0,
  billedSales: 0,
  handoverProductSales: 0,
  creditSales: 0,
  varianceAmount: 0,
});

/**
 * Totals of one day, summed from its Shifts.
 *
 * This is a re-partition, not a second source of truth: every figure added
 * here was computed by `composeAttendantHandoverReport` and is only being
 * re-grouped under a narrower heading for the page that shows it. No figure is
 * derived from anything the composer did not already state, which is why the
 * days always add back up to the period the composer computed — asserted in
 * this module's tests.
 *
 * If a day ever needs a figure the composer does not emit, it belongs in core
 * with the rest of the report arithmetic, not here.
 */
function totalsOf(shifts: AttendantReportShift[]): AttendantReportTotals {
  const totals = emptyTotals();
  for (const shift of shifts) {
    totals.cashHandedOver += shift.cashHandedOver;
    totals.cardHandedOver += shift.cardHandedOver;
    totals.upiHandedOver += shift.upiHandedOver;
    totals.creditHandedOver += shift.creditHandedOver;
    totals.expectedFuelSales += shift.expectedFuelSales;
    totals.billedSales += shift.billedSales;
    totals.handoverProductSales += shift.handoverProductSales;
    totals.creditSales += shift.creditSales;
    totals.varianceAmount += shift.varianceAmount;
  }
  return totals;
}

/** One Business Day's Shifts, as the statement groups them. */
export interface AttendantShiftDay {
  businessDate: string;
  shifts: AttendantReportShift[];
}

/**
 * Group an Attendant's Shifts by Business Day, in date order.
 *
 * Shared by the exported statement and the preview drawer so the two never
 * teach the operator two different shapes for one statement.
 */
export function groupShiftsByBusinessDay(shifts: AttendantReportShift[]): AttendantShiftDay[] {
  const byDate = new Map<string, AttendantReportShift[]>();
  for (const shift of shifts) {
    const forDate = byDate.get(shift.businessDate) ?? [];
    forDate.push(shift);
    byDate.set(shift.businessDate, forDate);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([businessDate, forDate]) => ({ businessDate, shifts: forDate }));
}

/**
 * Split a statement into one statement per Business Day, in date order.
 *
 * The period meta (`from`/`to`/`generatedAt`) is carried unchanged onto every
 * day: a day page belongs to the statement it was cut from, and a re-print of
 * one page must not look like a narrower report than it is.
 *
 * An Attendant with no Shifts yields no days — the caller decides what an
 * empty statement looks like, this function does not invent a blank day.
 */
export function sliceAttendantStatementByDay(
  data: AttendantStatementData,
): AttendantStatementDay[] {
  return groupShiftsByBusinessDay(data.shifts).map(({ businessDate, shifts }) => ({
    businessDate,
    data: {
      ...data,
      shifts,
      shiftsWorked: shifts.length,
      handoverCount: shifts.reduce((acc, shift) => acc + shift.dispensers.length, 0),
      totals: totalsOf(shifts),
    },
  }));
}
