/**
 * Attendant Handover Report — source data ports.
 *
 * The report composes an Attendant's Handovers across CLOSED Shifts within a
 * Business-Date range. It reads operational rows rather than Shift Summary
 * snapshots: snapshots are shift-shaped, this report is attendant-shaped.
 */

export interface AttendantHandoverReportQuery {
  organizationId: string;
  stationId: string;
  /** Inclusive Business Date (YYYY-MM-DD). */
  from: string;
  /** Inclusive Business Date (YYYY-MM-DD). */
  to: string;
  /** Narrow to a single Attendant. Omitted = every Attendant at the station. */
  attendantId?: string;
}

/** One persisted Handover row joined to its Shift, Attendant and Dispenser. */
export interface AttendantHandoverSourceRow {
  handoverId: string;
  shiftId: string;
  businessDate: string;
  shiftTemplateName: string | null;
  closedAt: string | null;
  attendantId: string;
  attendantName: string;
  duId: string;
  duName: string;
  cashHandedOver: number;
  cardHandedOver: number;
  upiHandedOver: number;
  creditHandedOver: number;
  /**
   * The Handover's stored expected sales. Fuel only by design — merchandise
   * cash reaches only `varianceAmount` at record time, so this is never
   * presented as a grand total.
   */
  expectedFuelSales: number;
  varianceAmount: number;
  testingVolume: number;
}

export interface AttendantHandoverReportSource {
  handovers: AttendantHandoverSourceRow[];
  /**
   * Non-fuel Sales attributed to an Attendant within a Shift. Classified by
   * capture mechanism: `MERCH_HANDOVER` is the one bulk Handover Product Sale,
   * everything else is a Billed Sale.
   */
  sales: AttendantSaleSourceRow[];
  /** Fuel-on-credit chits attributed to an Attendant within a Shift. */
  creditSales: AttendantCreditSaleSourceRow[];
}

export interface AttendantSaleSourceRow {
  shiftId: string;
  attendantId: string;
  captureMechanism: string;
  totalAmount: number;
}

export interface AttendantCreditSaleSourceRow {
  shiftId: string;
  attendantId: string;
  amount: number;
}

export interface AttendantHandoverReportReader {
  /** Handovers of CLOSED (or LOCKED) Shifts whose Business Date falls in range. */
  read(query: AttendantHandoverReportQuery): Promise<AttendantHandoverReportSource>;
}

/** One Dispenser's Handover within a Shift. */
export interface AttendantHandoverReportDispenser {
  handoverId: string;
  duId: string;
  duName: string;
  cashHandedOver: number;
  cardHandedOver: number;
  upiHandedOver: number;
  creditHandedOver: number;
  expectedFuelSales: number;
  varianceAmount: number;
  testingVolume: number;
}

/**
 * One Shift in an Attendant's period.
 *
 * Handovers are per (Shift, Dispenser); the sales components are attributed
 * per (Shift, Attendant) and therefore live here rather than on a Dispenser.
 */
export interface AttendantHandoverReportShift {
  shiftId: string;
  businessDate: string;
  shiftTemplateName: string | null;
  closedAt: string | null;
  dispensers: AttendantHandoverReportDispenser[];
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
 * Period totals for one Attendant.
 *
 * Components are summed separately and never rolled into a single "sales"
 * figure: the Handover's stored expected sales is fuel-only, so any grand
 * total derived from it would mislead.
 */
export interface AttendantHandoverReportTotals {
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

export interface AttendantHandoverReportEntry {
  attendantId: string;
  attendantName: string;
  /** Distinct Shifts the Attendant handed over in during the period. */
  shiftsWorked: number;
  /** Handover rows — one per (Shift, Dispenser), so ≥ shiftsWorked. */
  handoverCount: number;
  totals: AttendantHandoverReportTotals;
  shifts: AttendantHandoverReportShift[];
}
export interface AttendantHandoverReport {
  stationId: string;
  from: string;
  to: string;
  generatedAt: string;
  attendants: AttendantHandoverReportEntry[];
}
