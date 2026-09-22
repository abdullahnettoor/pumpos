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

/**
 * One fuel-on-credit chit raised by the Attendant in the Shift.
 *
 * A receivable, never drawer cash: it is listed so the operator can see *who*
 * owes the Shift's credit total, rather than the single number the statement
 * used to print. Product, quantity and vehicle are shown when the chit
 * recorded them — a back-dated or merchandise-free chit may carry none.
 */
export interface AttendantReportCreditSale {
  transactionId: string;
  customerId: string | null;
  /** "Unknown customer" is the renderer's business; the contract stays honest. */
  customerName: string | null;
  vehicleRegistration: string | null;
  productName: string | null;
  quantity: number | null;
  /**
   * Unit the quantity is measured in — 'L' for liquids, 'kg' for CNG and
   * Auto-LPG. Carried because a renderer that assumes litres prints a CNG
   * chit wrong, and quantities must never be summed across units.
   */
  unit: string | null;
  unitPrice: number | null;
  amount: number;
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
  /**
   * The chits behind `creditSales`, one line each, ordered by customer. Their
   * amounts sum to `creditSales` — the breakdown never disagrees with the
   * total it explains.
   */
  creditSaleLines: AttendantReportCreditSale[];
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
