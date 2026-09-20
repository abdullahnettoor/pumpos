/**
 * Attendant Handover Report — the wire contract.
 *
 * The report's *composition* is a core concern; its *shape on the wire* is
 * shared, because the console renders exactly what the API returns. Keeping
 * one definition here means a column added in core cannot silently diverge
 * from what the table and the PDF read.
 */

/** Per-Payment-Terminal card/UPI detail declared inside one Handover. */
export interface AttendantReportTerminal {
  terminalId: string;
  terminalName: string;
  cardAmount: number;
  upiAmount: number;
  batchRef: string | null;
}

/** One Nozzle's readings for the Shift, under its Dispenser. */
export interface AttendantReportNozzle {
  nozzleId: string;
  nozzleName: string;
  productName: string | null;
  openingReading: number;
  closingReading: number;
  volumeSold: number;
  testingVolume: number;
  unitPrice: number | null;
}

/** One Dispenser's Handover within a Shift. */
export interface AttendantReportDispenser {
  handoverId: string;
  duId: string;
  duName: string;
  cashHandedOver: number;
  cardHandedOver: number;
  upiHandedOver: number;
  creditHandedOver: number;
  expectedFuelSales: number;
  /** Fuel-on-credit chits dispensed from this Dispenser. */
  creditSales: number;
  varianceAmount: number;
  testingVolume: number;
  /** Empty at a Station that declares aggregate card/UPI instead. */
  terminals: AttendantReportTerminal[];
  nozzles: AttendantReportNozzle[];
}

/**
 * One Shift in an Attendant's period. Handovers are per (Shift, Dispenser);
 * merchandise components are attributed per (Shift, Attendant) and so live
 * here rather than on a Dispenser.
 */
export interface AttendantReportShift {
  shiftId: string;
  businessDate: string;
  shiftTemplateName: string | null;
  closedAt: string | null;
  dispensers: AttendantReportDispenser[];
  cashHandedOver: number;
  cardHandedOver: number;
  upiHandedOver: number;
  creditHandedOver: number;
  expectedFuelSales: number;
  /** Individually billed non-fuel Sales (counter quick entry). */
  billedSales: number;
  /** The bulk end-of-shift merchandise declaration. */
  handoverProductSales: number;
  /** Fuel-on-credit receivables raised by this Attendant in this Shift. */
  creditSales: number;
  varianceAmount: number;
  testingVolume: number;
}

/**
 * Period totals for one Attendant. Components are summed separately and never
 * rolled into a single "sales" figure: the Handover's stored expected sales is
 * fuel-only, so any grand total derived from it would mislead.
 */
export interface AttendantReportTotals {
  cashHandedOver: number;
  cardHandedOver: number;
  upiHandedOver: number;
  creditHandedOver: number;
  expectedFuelSales: number;
  billedSales: number;
  handoverProductSales: number;
  creditSales: number;
  /** Net Variance across the period — the figure a recovery conversation uses. */
  varianceAmount: number;
}

export interface AttendantReportEntry {
  attendantId: string;
  attendantName: string;
  /** Distinct Shifts the Attendant handed over in during the period. */
  shiftsWorked: number;
  /** Handover rows — one per (Shift, Dispenser), so ≥ shiftsWorked. */
  handoverCount: number;
  totals: AttendantReportTotals;
  shifts: AttendantReportShift[];
}

export interface AttendantHandoverReport {
  stationId: string;
  from: string;
  to: string;
  generatedAt: string;
  attendants: AttendantReportEntry[];
}

/** The filters that select one report. */
export interface AttendantReportFilters {
  stationId: string;
  /** Inclusive Business Date (YYYY-MM-DD). */
  from: string;
  /** Inclusive Business Date (YYYY-MM-DD). */
  to: string;
  /** Narrow to a single Attendant. Omitted = every Attendant at the Station. */
  attendantId?: string;
}
