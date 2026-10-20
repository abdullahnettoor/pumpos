/**
 * Decantation Report wire contract (ADR 0007, ticket #473).
 *
 * Operational report of tanker unloads, tank line dips, invoice reconciliation
 * and chamber integrity across a Business Date range.
 *
 * Exposes transit loss (chamber shortages / broken seals / not emptied)
 * vs station decantation loss (underground tank dip variance against invoice).
 */

export interface DecantationReportFlag {
  code: string;
  tankLineId?: string;
  chamberNo?: number;
  message: string;
}

export type DecantationReportTankLineStatus = 'PENDING_MEASUREMENT' | 'MEASURED';
export type DecantationReportMeasuredBy = 'AFTER_DIP' | 'TANK_DIP';

export interface DecantationReportTankLine {
  id: string;
  tankId: string;
  tankName: string;
  productId: string;
  productName: string;
  productCode: string;
  beforeDip: number;
  beforeDipAt: string | null;
  afterDip: number | null;
  afterDipAt: string | null;
  salesDuring: number;
  receivedQty: number | null;
  measuredBy: DecantationReportMeasuredBy | null;
  measuredAt: string | null;
  status: DecantationReportTankLineStatus;
  roDensity: number | null;
  invoiceDensity: number | null;
  /** roDensity - invoiceDensity (null if either is missing) */
  densityDeviation: number | null;
}

/**
 * LINKED = invoice settled (variance computed); SETTLING = this visit is
 * measured but the invoice waits on a sibling Decantation / pending lines.
 */
export type DecantationReportInvoiceStatus =
  | 'LINKED'
  | 'NOT_LINKED'
  | 'PENDING_MEASUREMENT'
  | 'SETTLING';

export type DecantationReportVarianceType = 'EXCESS' | 'SHORT' | 'EXACT';

export interface DecantationReportInvoiceLink {
  productId: string;
  productName: string;
  productCode: string;
  purchaseId: string | null;
  invoiceNumber: string | null;
  purchaseDocumentNumber: string | null;
  /** Invoice-level quantity (the whole invoice, even when split across visits) */
  invoiceQty: number | null;
  /** Litres received in THIS decantation for this product */
  receivedQty: number | null;
  /** Invoice-level variance (Σ received across all visits - invoice qty); null until settled */
  varianceQty: number | null;
  /** How many Decantations this invoice/product is split across (1 = not split) */
  linkedVisitCount: number;
  status: DecantationReportInvoiceStatus;
  /** Human-readable status: "Purchase not linked" | "Pending measurement" | "Settling" | "Excess" | "Short" | "Exact" */
  statusLabel: string;
  varianceType: DecantationReportVarianceType | null;
}

export interface DecantationReportChamber {
  id: string;
  chamberNo: number;
  capacityL: number | null;
  dipMm: number | null;
  sealOk: boolean | null;
  mark: 'OK' | 'SHORT' | 'EXCESS' | null;
  emptied: boolean | null;
  tankLineId: string | null;
  tankName: string | null;
}

export interface DecantationReportChamberSummary {
  totalChambers: number;
  shortCount: number;
  excessCount: number;
  notEmptiedCount: number;
  sealsBrokenCount: number;
  hasTransitDiscrepancy: boolean;
}

/** Transit indicators next to the settled invoice variance (transit vs station loss). */
export interface DecantationReportVisitSummary {
  shortChambers: number;
  excessChambers: number;
  notEmptiedChambers: number;
  sealsBroken: number;
  transitDiscrepancies: number;
  /** Σ variance of the settled invoices this visit belongs to; null when none settled */
  settledInvoiceVarianceQty: number | null;
  settlingInvoiceCount: number;
}

export type DecantationReportInvoiceSectionStatus = 'SETTLED' | 'SETTLING';

/** One invoice (purchase + product), counted once however many visits it spans. */
export interface DecantationReportInvoice {
  purchaseId: string;
  productId: string;
  productName: string;
  productCode: string;
  invoiceNumber: string | null;
  purchaseDocumentNumber: string | null;
  supplierName: string | null;
  invoiceQty: number | null;
  /** Σ received across its visits; null until settled */
  receivedQty: number | null;
  varianceQty: number | null;
  varianceType: DecantationReportVarianceType | null;
  status: DecantationReportInvoiceSectionStatus;
  statusLabel: string;
  visitCount: number;
  visits: { id: string; documentNumber: string }[];
}

export interface DecantationReportVisit {
  id: string;
  date: string; // business date (YYYY-MM-DD)
  documentNumber: string;
  tankerNumber: string;
  driverName: string | null;
  unloadStartedAt: string | null;
  unloadEndedAt: string | null;
  status: 'DRAFT' | 'PENDING_MEASUREMENT' | 'MEASURED' | 'DISCARDED';
  flags: DecantationReportFlag[];
  notes: string | null;
  chamberSummary: DecantationReportChamberSummary;
  chambers: DecantationReportChamber[];
  tankLines: DecantationReportTankLine[];
  invoiceLinks: DecantationReportInvoiceLink[];
  summary: DecantationReportVisitSummary;
  totalReceivedQty: number;
  /** Settled invoices this visit belongs to, each counted once */
  totalInvoiceQty: number;
  /** null unless every linked invoice is settled */
  totalVarianceQty: number | null;
}

export interface DecantationReportProductTotal {
  productId: string;
  productName: string;
  productCode: string;
  /** Measured litres across all lines */
  totalReceivedQty: number;
  /** Measured litres on settled invoices (like-for-like with totalInvoiceQty) */
  settledReceivedQty: number;
  /** Settled invoices only, each counted once */
  totalInvoiceQty: number;
  /** Invoice-level variance of settled invoices only */
  totalVarianceQty: number;
  /** Invoice qty of invoices not yet settled (shown separately) */
  pendingInvoiceQty: number;
  /** Measured litres not on a settled invoice (unlinked or settling) */
  pendingReceivedQty: number;
  shortVarianceQty: number;
  excessVarianceQty: number;
  visitCount: number;
  lineCount: number;
  measuredLineCount: number;
  pendingLineCount: number;
}

export interface DecantationReportTotals {
  totalVisits: number;
  measuredVisits: number;
  pendingVisits: number;
  flaggedVisits: number;
  totalReceivedQty: number;
  settledReceivedQty: number;
  totalInvoiceQty: number;
  totalVarianceQty: number;
  pendingInvoiceQty: number;
  pendingReceivedQty: number;
  settlingInvoiceCount: number;
  /** Server-composed transit total: chambers Short + Excess + not emptied + seals broken */
  transitDiscrepancies: number;
  totalChambersShort: number;
  totalChambersExcess: number;
  totalChambersNotEmptied: number;
  totalSealsBroken: number;
}

export interface DecantationReport {
  stationId: string;
  stationName?: string;
  from: string;
  to: string;
  generatedAt: string;
  totals: DecantationReportTotals;
  productTotals: DecantationReportProductTotal[];
  invoices: DecantationReportInvoice[];
  visits: DecantationReportVisit[];
}

export interface DecantationReportFilters {
  stationId: string;
  from: string;
  to: string;
}
