import type {
  DecantationReport,
  DecantationReportChamber,
  DecantationReportChamberSummary,
  DecantationReportFilters,
  DecantationReportFlag,
  DecantationReportInvoice,
  DecantationReportInvoiceLink,
  DecantationReportProductTotal,
  DecantationReportTankLine,
  DecantationReportTotals,
  DecantationReportVisit,
  DecantationReportVisitSummary,
} from '@pump/shared';

/**
 * Decantation Report — source data ports (ADR 0007, ticket #473).
 *
 * Operational report across tanker unloads in a Business Date range.
 * Correlates tanker chamber integrity (transit loss) against
 * underground tank dip measurements & invoice quantities (station loss).
 */
export type {
  DecantationReport,
  DecantationReportChamber,
  DecantationReportChamberSummary,
  DecantationReportFilters,
  DecantationReportFlag,
  DecantationReportInvoice,
  DecantationReportInvoiceLink,
  DecantationReportProductTotal,
  DecantationReportTankLine,
  DecantationReportTotals,
  DecantationReportVisit,
  DecantationReportVisitSummary,
};

export interface DecantationReportQuery extends DecantationReportFilters {
  organizationId: string;
}

export interface DecantationSourceRow {
  id: string;
  businessDayId: string;
  businessDate: string; // YYYY-MM-DD
  documentNumber: string;
  tankerNumber: string;
  driverName: string | null;
  unloadStartedAt: string | null;
  unloadEndedAt: string | null;
  chambersChecked: boolean;
  status: 'DRAFT' | 'PENDING_MEASUREMENT' | 'MEASURED';
  flags: DecantationReportFlag[];
  notes: string | null;
  createdAt: string;
}

export interface DecantationTankLineSourceRow {
  id: string;
  decantationId: string;
  tankId: string;
  tankName: string;
  productId: string;
  productName: string;
  productCode: string;
  beforeDip: number;
  beforeDipAt: string | null;
  observedDensity: number | null;
  observedTempC: number | null;
  roDensity: number | null;
  afterDip: number | null;
  afterDipAt: string | null;
  salesDuring: number;
  receivedQty: number | null;
  measuredBy: 'AFTER_DIP' | 'TANK_DIP' | null;
  measurementRefId: string | null;
  measuredAt: string | null;
  status: 'PENDING_MEASUREMENT' | 'MEASURED';
  createdAt: string;
}

export interface DecantationChamberSourceRow {
  id: string;
  decantationId: string;
  tankLineId: string | null;
  chamberNo: number;
  capacityL: number | null;
  sealOk: boolean | null;
  mark: 'OK' | 'SHORT' | 'EXCESS' | null;
  dipMm: number | null;
  emptied: boolean | null;
}

export interface DecantationPurchaseLinkSourceRow {
  id: string;
  decantationId: string;
  purchaseId: string;
  productId: string;
  receivedQty: number | null;
  invoiceQty: number | null;
  varianceQty: number | null;
  varianceComputedAt: string | null;
  invoiceNumber: string | null;
  purchaseDocumentNumber: string | null;
  invoiceDensity: number | null;
  supplierName: string | null;
  /** Total Decantations linked to this (purchase, product), in or out of range */
  linkedVisitCount: number;
}

export interface DecantationReportSource {
  stationName?: string;
  decantations: DecantationSourceRow[];
  tankLines: DecantationTankLineSourceRow[];
  chambers: DecantationChamberSourceRow[];
  links: DecantationPurchaseLinkSourceRow[];
}

export interface DecantationReportReader {
  read(query: DecantationReportQuery): Promise<DecantationReportSource>;
}
