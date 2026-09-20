import type {
  AttendantCreditSaleSourceRow,
  AttendantHandoverReportNozzle,
  AttendantHandoverReportTerminal,
  AttendantNozzleReadingSourceRow,
  AttendantTerminalEntrySourceRow,
  AttendantHandoverReport,
  AttendantHandoverReportEntry,
  AttendantHandoverReportShift,
  AttendantHandoverReportSource,
  AttendantSaleSourceRow,
} from './ports.js';

/** The bulk end-of-shift merchandise declaration; everything else is billed. */
const HANDOVER_CAPTURE = 'MERCH_HANDOVER';

const key = (shiftId: string, attendantId: string) => `${shiftId}::${attendantId}`;

function emptyTotals() {
  return {
    cashHandedOver: 0,
    cardHandedOver: 0,
    upiHandedOver: 0,
    creditHandedOver: 0,
    expectedFuelSales: 0,
    billedSales: 0,
    handoverProductSales: 0,
    creditSales: 0,
    varianceAmount: 0,
  };
}

/** Sum non-fuel sales per (Shift, Attendant), split by capture mechanism. */
function indexSales(sales: AttendantSaleSourceRow[]) {
  const billed = new Map<string, number>();
  const handoverProduct = new Map<string, number>();
  for (const sale of sales) {
    const target = sale.captureMechanism === HANDOVER_CAPTURE ? handoverProduct : billed;
    const k = key(sale.shiftId, sale.attendantId);
    target.set(k, (target.get(k) ?? 0) + sale.totalAmount);
  }
  return { billed, handoverProduct };
}

/** Terminal detail hangs off the Handover it was declared in. */
function indexTerminals(rows: AttendantTerminalEntrySourceRow[]) {
  const byHandover = new Map<string, AttendantHandoverReportTerminal[]>();
  for (const row of rows) {
    const list = byHandover.get(row.handoverId) ?? [];
    list.push({
      terminalId: row.terminalId,
      terminalName: row.terminalName,
      cardAmount: row.cardAmount,
      upiAmount: row.upiAmount,
      batchRef: row.batchRef,
    });
    byHandover.set(row.handoverId, list);
  }
  return byHandover;
}

/** Readings reach a Handover through its Dispenser: (Shift, Dispenser). */
function indexNozzleReadings(rows: AttendantNozzleReadingSourceRow[]) {
  const byShiftDu = new Map<string, AttendantHandoverReportNozzle[]>();
  for (const row of rows) {
    const k = key(row.shiftId, row.duId);
    const list = byShiftDu.get(k) ?? [];
    list.push({
      nozzleId: row.nozzleId,
      nozzleName: row.nozzleName,
      productName: row.productName,
      openingReading: row.openingReading,
      closingReading: row.closingReading,
      volumeSold: row.volumeSold,
      testingVolume: row.testingVolume,
      unitPrice: row.unitPrice,
    });
    byShiftDu.set(k, list);
  }
  return byShiftDu;
}

function indexCreditSales(rows: AttendantCreditSaleSourceRow[]) {
  const byKey = new Map<string, number>();
  for (const row of rows) {
    const k = key(row.shiftId, row.attendantId);
    byKey.set(k, (byKey.get(k) ?? 0) + row.amount);
  }
  return byKey;
}

/**
 * Fold Handover source rows into one entry per Attendant.
 *
 * Pure: all report arithmetic lives here so it can be tested without a
 * database. Handovers nest under the Shift they belong to, because one
 * Attendant may hand over several Dispensers in a Shift while the sales
 * components are attributed to the (Shift, Attendant) pair once.
 */
export function composeAttendantHandoverReport(
  source: AttendantHandoverReportSource,
  meta: { stationId: string; from: string; to: string; generatedAt: string },
): AttendantHandoverReport {
  const { billed, handoverProduct } = indexSales(source.sales ?? []);
  const creditByKey = indexCreditSales(source.creditSales ?? []);
  const terminalsByHandover = indexTerminals(source.terminalEntries ?? []);
  const nozzlesByShiftDu = indexNozzleReadings(source.nozzleReadings ?? []);

  const byAttendant = new Map<string, AttendantHandoverReportEntry>();
  const shiftsByKey = new Map<string, AttendantHandoverReportShift>();

  for (const row of source.handovers) {
    let entry = byAttendant.get(row.attendantId);
    if (!entry) {
      entry = {
        attendantId: row.attendantId,
        attendantName: row.attendantName,
        shiftsWorked: 0,
        handoverCount: 0,
        totals: emptyTotals(),
        shifts: [],
      };
      byAttendant.set(row.attendantId, entry);
    }

    const k = key(row.shiftId, row.attendantId);
    let shift = shiftsByKey.get(k);
    if (!shift) {
      shift = {
        shiftId: row.shiftId,
        businessDate: row.businessDate,
        shiftTemplateName: row.shiftTemplateName,
        closedAt: row.closedAt,
        dispensers: [],
        cashHandedOver: 0,
        cardHandedOver: 0,
        upiHandedOver: 0,
        creditHandedOver: 0,
        expectedFuelSales: 0,
        // Attributed once per (Shift, Attendant), not per Dispenser.
        billedSales: billed.get(k) ?? 0,
        handoverProductSales: handoverProduct.get(k) ?? 0,
        creditSales: creditByKey.get(k) ?? 0,
        varianceAmount: 0,
        testingVolume: 0,
      };
      shiftsByKey.set(k, shift);
      entry.shifts.push(shift);
      entry.totals.billedSales += shift.billedSales;
      entry.totals.handoverProductSales += shift.handoverProductSales;
      entry.totals.creditSales += shift.creditSales;
    }

    shift.dispensers.push({
      handoverId: row.handoverId,
      duId: row.duId,
      duName: row.duName,
      cashHandedOver: row.cashHandedOver,
      cardHandedOver: row.cardHandedOver,
      upiHandedOver: row.upiHandedOver,
      creditHandedOver: row.creditHandedOver,
      expectedFuelSales: row.expectedFuelSales,
      varianceAmount: row.varianceAmount,
      testingVolume: row.testingVolume,
      terminals: terminalsByHandover.get(row.handoverId) ?? [],
      nozzles: [...(nozzlesByShiftDu.get(key(row.shiftId, row.duId)) ?? [])].sort((a, b) =>
        a.nozzleName.localeCompare(b.nozzleName),
      ),
    });

    shift.cashHandedOver += row.cashHandedOver;
    shift.cardHandedOver += row.cardHandedOver;
    shift.upiHandedOver += row.upiHandedOver;
    shift.creditHandedOver += row.creditHandedOver;
    shift.expectedFuelSales += row.expectedFuelSales;
    shift.varianceAmount += row.varianceAmount;
    shift.testingVolume += row.testingVolume;

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
    shiftsWorked: entry.shifts.length,
    shifts: [...entry.shifts]
      .sort((a, b) => a.businessDate.localeCompare(b.businessDate))
      .map((shift) => ({
        ...shift,
        dispensers: [...shift.dispensers].sort((a, b) => a.duName.localeCompare(b.duName)),
      })),
  }));
  attendants.sort((a, b) => a.attendantName.localeCompare(b.attendantName));

  return { ...meta, attendants };
}
