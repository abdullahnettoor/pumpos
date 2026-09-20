import type {
  AttendantHandoverReport,
  AttendantHandoverReportEntry,
  AttendantHandoverReportShift,
  AttendantHandoverSourceRow,
} from './ports.js';

/**
 * Fold Handover source rows into one entry per Attendant.
 *
 * Pure: all report arithmetic lives here so it can be tested without a
 * database. Totals are summed per component — the Handover's stored expected
 * sales is fuel-only, so no grand total is derived from it.
 */
export function composeAttendantHandoverReport(
  rows: AttendantHandoverSourceRow[],
  meta: { stationId: string; from: string; to: string; generatedAt: string },
): AttendantHandoverReport {
  const byAttendant = new Map<string, AttendantHandoverReportEntry>();

  for (const row of rows) {
    let entry = byAttendant.get(row.attendantId);
    if (!entry) {
      entry = {
        attendantId: row.attendantId,
        attendantName: row.attendantName,
        shiftsWorked: 0,
        handoverCount: 0,
        totals: {
          cashHandedOver: 0,
          cardHandedOver: 0,
          upiHandedOver: 0,
          creditHandedOver: 0,
          expectedFuelSales: 0,
          varianceAmount: 0,
        },
        shifts: [],
      };
      byAttendant.set(row.attendantId, entry);
    }

    const shift: AttendantHandoverReportShift = {
      handoverId: row.handoverId,
      shiftId: row.shiftId,
      businessDate: row.businessDate,
      shiftTemplateName: row.shiftTemplateName,
      closedAt: row.closedAt,
      duId: row.duId,
      duName: row.duName,
      cashHandedOver: row.cashHandedOver,
      cardHandedOver: row.cardHandedOver,
      upiHandedOver: row.upiHandedOver,
      creditHandedOver: row.creditHandedOver,
      expectedFuelSales: row.expectedFuelSales,
      varianceAmount: row.varianceAmount,
      testingVolume: row.testingVolume,
    };
    entry.shifts.push(shift);
    entry.handoverCount += 1;
    entry.totals.cashHandedOver += row.cashHandedOver;
    entry.totals.cardHandedOver += row.cardHandedOver;
    entry.totals.upiHandedOver += row.upiHandedOver;
    entry.totals.creditHandedOver += row.creditHandedOver;
    entry.totals.expectedFuelSales += row.expectedFuelSales;
    entry.totals.varianceAmount += row.varianceAmount;
  }

  const attendants = [...byAttendant.values()].map((entry) => ({
    ...entry,
    // One Attendant may hand over several Dispensers in one Shift; the Shift is
    // still one shift worked.
    shiftsWorked: new Set(entry.shifts.map((s) => s.shiftId)).size,
    shifts: [...entry.shifts].sort(
      (a, b) => a.businessDate.localeCompare(b.businessDate) || a.duName.localeCompare(b.duName),
    ),
  }));
  attendants.sort((a, b) => a.attendantName.localeCompare(b.attendantName));

  return { ...meta, attendants };
}
