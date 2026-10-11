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

export type DecantationReportInvoiceStatus = 'LINKED' | 'NOT_LINKED' | 'PENDING_MEASUREMENT';

export type DecantationReportVarianceType = 'EXCESS' | 'SHORT' | 'EXACT';

export interface DecantationReportInvoiceLink {
  productId: string;
  productName: string;
  productCode: string;
  purchaseId: string | null;
  invoiceNumber: string | null;
  purchaseDocumentNumber: string | null;
  invoiceQty: number | null;
  /** Litres received in this decantation for this product */
  receivedQty: number | null;
  /** receivedQty - invoiceQty (+ Excess, - Short) when measured; null when pending or unlinked */
  varianceQty: number | null;
  status: DecantationReportInvoiceStatus;
  /** Human-readable status: "Purchase not linked" | "Pending measurement" | "Excess" | "Short" | "Exact" */
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

export interface DecantationReportVisit {
  id: string;
  date: string; // business date (YYYY-MM-DD)
  documentNumber: string;
  tankerNumber: string;
  driverName: string | null;
  unloadStartedAt: string | null;
  unloadEndedAt: string | null;
  status: 'DRAFT' | 'PENDING_MEASUREMENT' | 'MEASURED';
  flags: DecantationReportFlag[];
  notes: string | null;
  chamberSummary: DecantationReportChamberSummary;
  chambers: DecantationReportChamber[];
  tankLines: DecantationReportTankLine[];
  invoiceLinks: DecantationReportInvoiceLink[];
  totalReceivedQty: number;
  totalInvoiceQty: number;
  totalVarianceQty: number | null;
}

export interface DecantationReportProductTotal {
  productId: string;
  productName: string;
  productCode: string;
  totalReceivedQty: number;
  totalInvoiceQty: number;
  totalVarianceQty: number;
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
  totalInvoiceQty: number;
  totalVarianceQty: number;
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
  visits: DecantationReportVisit[];
}

export interface DecantationReportFilters {
  stationId: string;
  from: string;
  to: string;
}
