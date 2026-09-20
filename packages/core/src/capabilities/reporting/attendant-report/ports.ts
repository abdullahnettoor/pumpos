import type {
  AttendantHandoverReport,
  AttendantReportDispenser,
  AttendantReportEntry,
  AttendantReportFilters,
  AttendantReportNozzle,
  AttendantReportShift,
  AttendantReportTerminal,
  AttendantReportTotals,
} from '@pump/shared';

/**
 * Attendant Handover Report — source data ports.
 *
 * The report composes an Attendant's Handovers across CLOSED Shifts within a
 * Business-Date range. It reads operational rows rather than Shift Summary
 * snapshots: snapshots are shift-shaped, this report is attendant-shaped.
 *
 * The composed shape is the shared wire contract, re-exported here so core
 * callers need not reach past the capability for it.
 */
export type {
  AttendantHandoverReport,
  AttendantReportDispenser,
  AttendantReportEntry,
  AttendantReportFilters,
  AttendantReportNozzle,
  AttendantReportShift,
  AttendantReportTerminal,
  AttendantReportTotals,
};

export interface AttendantHandoverReportQuery extends AttendantReportFilters {
  organizationId: string;
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
  /** Per-Payment-Terminal card/UPI detail, keyed to its parent Handover. */
  terminalEntries: AttendantTerminalEntrySourceRow[];
  /** Nozzle Readings of the Shifts in range, keyed to the Nozzle's Dispenser. */
  nozzleReadings: AttendantNozzleReadingSourceRow[];
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
  /**
   * Dispenser the fuel-on-credit was dispensed from. Null for a chit recorded
   * outside a Dispenser handover, which still counts toward the Shift.
   */
  duId: string | null;
  amount: number;
}

export interface AttendantTerminalEntrySourceRow {
  handoverId: string;
  terminalId: string;
  terminalName: string;
  cardAmount: number;
  upiAmount: number;
  batchRef: string | null;
}

export interface AttendantNozzleReadingSourceRow {
  shiftId: string;
  duId: string;
  nozzleId: string;
  nozzleName: string;
  productName: string | null;
  openingReading: number;
  closingReading: number;
  volumeSold: number;
  testingVolume: number;
  unitPrice: number | null;
}

export interface AttendantHandoverReportReader {
  /** Handovers of CLOSED (or LOCKED) Shifts whose Business Date falls in range. */
  read(query: AttendantHandoverReportQuery): Promise<AttendantHandoverReportSource>;
}
