import type {
  AttendantCreditSaleSourceRow,
  AttendantHandoverReport,
  AttendantHandoverReportSource,
  AttendantNozzleReadingSourceRow,
  AttendantReportEntry,
  AttendantReportCreditSale,
  AttendantReportNozzle,
  AttendantReportShift,
  AttendantReportTerminal,
  AttendantSaleSourceRow,
  AttendantTerminalEntrySourceRow,
} from './ports.js';
import { byNaturalField } from '@pump/shared';

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
  const byHandover = new Map<string, AttendantReportTerminal[]>();
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
  const byShiftDu = new Map<string, AttendantReportNozzle[]>();
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

/**
 * Credit chits totalled two ways: per (Shift, Attendant) for the shift line,
 * and per (Shift, Dispenser) so a Dispenser's row shows the credit dispensed
 * from it. A chit recorded outside a Dispenser handover carries no `duId`; it
 * still counts toward the Shift, it simply has no Dispenser to sit under.
 *
 * The chits themselves are kept per (Shift, Attendant) as well: the statement
 * prints who owes the total, and those lines are summed from the very rows the
 * total is summed from, so the breakdown cannot drift from it.
 */
function indexCreditSales(rows: AttendantCreditSaleSourceRow[]) {
  const byShiftAttendant = new Map<string, number>();
  const byShiftDu = new Map<string, number>();
  const linesByShiftAttendant = new Map<string, AttendantReportCreditSale[]>();
  for (const row of rows) {
    const k = key(row.shiftId, row.attendantId);
    byShiftAttendant.set(k, (byShiftAttendant.get(k) ?? 0) + row.amount);
    const lines = linesByShiftAttendant.get(k) ?? [];
    lines.push({
      transactionId: row.transactionId,
      customerId: row.customerId,
      customerName: row.customerName,
      vehicleRegistration: row.vehicleRegistration,
      productName: row.productName,
      quantity: row.quantity,
      unit: row.unit,
      unitPrice: row.unitPrice,
      amount: row.amount,
    });
    linesByShiftAttendant.set(k, lines);
    if (row.duId) {
      const duKey = key(row.shiftId, row.duId);
      byShiftDu.set(duKey, (byShiftDu.get(duKey) ?? 0) + row.amount);
    }
  }
  return { byShiftAttendant, byShiftDu, linesByShiftAttendant };
}

/**
 * Customer order, with the transaction id breaking ties — two chits for the
 * same customer in the same shift are common, and row order out of the
 * database is not stable enough to print.
 */
const byCustomerThenId = (a: AttendantReportCreditSale, b: AttendantReportCreditSale) =>
  (a.customerName ?? '').localeCompare(b.customerName ?? '') ||
  a.transactionId.localeCompare(b.transactionId);

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
  const credit = indexCreditSales(source.creditSales ?? []);
  const terminalsByHandover = indexTerminals(source.terminalEntries ?? []);
  const nozzlesByShiftDu = indexNozzleReadings(source.nozzleReadings ?? []);

  const byAttendant = new Map<string, AttendantReportEntry>();
  const shiftsByKey = new Map<string, AttendantReportShift>();

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
        creditSales: credit.byShiftAttendant.get(k) ?? 0,
        creditSaleLines: [...(credit.linesByShiftAttendant.get(k) ?? [])].sort(byCustomerThenId),
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
      creditSales: credit.byShiftDu.get(key(row.shiftId, row.duId)) ?? 0,
      varianceAmount: row.varianceAmount,
      testingVolume: row.testingVolume,
      terminals: terminalsByHandover.get(row.handoverId) ?? [],
      // Natural, not lexicographic: plain localeCompare files N10 between N1
      // and N2, which is the order the exported PDF used to print.
      nozzles: [...(nozzlesByShiftDu.get(key(row.shiftId, row.duId)) ?? [])].sort(
        byNaturalField((n) => n.nozzleName),
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
        dispensers: [...shift.dispensers].sort(byNaturalField((d) => d.duName)),
      })),
  }));
  attendants.sort((a, b) => a.attendantName.localeCompare(b.attendantName));

  return { ...meta, attendants };
}
