// Report section configuration — plain data + types, no @react-pdf/renderer
// import. The heavy PDF document modules (shiftSummaryDoc / dssrDoc) and the
// settings/section-config UI all read from here, so importing config does not
// pull the PDF engine into the main bundle.
import type { Letterhead } from './letterhead.js';

export type ShiftSummarySection =
  | 'header' | 'meta' | 'warnings' | 'nozzles' | 'handovers' | 'terminals'
  | 'creditSales' | 'dips' | 'stockVariances' | 'cashRecon' | 'nonCash'
  | 'expenses' | 'purchases' | 'collections' | 'signatures';

export type DssrSection =
  | 'header' | 'meta' | 'kpis' | 'financial' | 'fuelByProduct'
  | 'nozzles' | 'fuelStockVariance' | 'merchandiseStockVariance' | 'shifts';

export interface ReportConfig {
  sections: ShiftSummarySection[];
  showLogo: boolean;
  stationName?: string;
  letterhead?: Letterhead;
  paper: 'A4' | 'LETTER';
}

export interface DssrReportConfig {
  sections: DssrSection[];
  stationName?: string;
  letterhead?: Letterhead;
  paper: 'A4' | 'LETTER';
}

export const DEFAULT_SHIFT_SUMMARY_CONFIG: ReportConfig = {
  sections: [
    'header', 'meta', 'warnings', 'nozzles', 'handovers', 'terminals', 'creditSales',
    'dips', 'stockVariances', 'cashRecon', 'nonCash', 'expenses', 'purchases', 'collections', 'signatures',
  ],
  showLogo: true,
  paper: 'A4',
};

export const DEFAULT_DSSR_CONFIG: DssrReportConfig = {
  sections: ['header', 'meta', 'kpis', 'financial', 'fuelByProduct', 'nozzles', 'fuelStockVariance', 'merchandiseStockVariance', 'shifts'],
  paper: 'A4',
};

/** Human labels for the section-config UI (R2). `header` is always rendered. */
export const SHIFT_SUMMARY_SECTION_LABELS: Record<ShiftSummarySection, string> = {
  header: 'Header / Letterhead', meta: 'Shift Meta', warnings: 'Warnings',
  nozzles: 'Nozzle Reconciliation', handovers: 'Attendant Handovers', terminals: 'POS Terminals',
  creditSales: 'Fuel-on-Credit Sales', dips: 'Tank Dips', stockVariances: 'Stock Variances',
  cashRecon: 'Cash Reconciliation', nonCash: 'Non-Cash Collections', expenses: 'Expenses',
  purchases: 'Purchases', collections: 'Collections', signatures: 'Signatures',
};

export const DSSR_SECTION_LABELS: Record<DssrSection, string> = {
  header: 'Header / Letterhead', meta: 'Day Meta', kpis: 'KPIs',
  financial: 'Financial Summary', fuelByProduct: 'Fuel Sales by Product', nozzles: 'Nozzle Aggregation',
  fuelStockVariance: 'Tank Dip & Fuel Variance', merchandiseStockVariance: 'Merchandise Variance', shifts: 'Included Shifts',
};

/** Resolve the configured paper size from a station's settings (default A4). */
export function paperFromStation(station: any): 'A4' | 'LETTER' {
  return station?.settings?.report_config?.paper === 'LETTER' ? 'LETTER' : 'A4';
}
