// Report section configuration — plain data + types, no @react-pdf/renderer
// import. The heavy PDF document modules (shiftSummaryDoc / dssrDoc) and the
// settings/section-config UI all read from here, so importing config does not
// pull the PDF engine into the main bundle.
import { letterheadFromStation, showLogoFromStation, type Letterhead } from './letterhead.js';

export type ShiftSummarySection =
  | 'header'
  | 'meta'
  | 'warnings'
  | 'nozzles'
  | 'handovers'
  | 'terminals'
  | 'creditSales'
  | 'cashRecon'
  | 'drawers'
  | 'signatures';

export type DssrSection =
  | 'header'
  | 'meta'
  | 'kpis'
  | 'financial'
  | 'fuelByProduct'
  | 'nozzles'
  | 'fuelStockVariance'
  | 'merchandiseStockVariance'
  | 'shifts';

export type AttendantReportSection =
  | 'header'
  | 'summary'
  | 'fuelSales'
  | 'merchandise'
  | 'creditSales'
  | 'terminals'
  | 'variance'
  | 'signature';

export interface ReportConfig {
  sections: ShiftSummarySection[];
  showLogo?: boolean;
  stationName?: string;
  letterhead?: Letterhead;
  paper: 'A4' | 'LETTER';
}

export interface DssrReportConfig {
  sections: DssrSection[];
  showLogo?: boolean;
  stationName?: string;
  letterhead?: Letterhead;
  paper: 'A4' | 'LETTER';
}

export interface AttendantReportConfig {
  sections: AttendantReportSection[];
  showLogo?: boolean;
  stationName?: string;
  letterhead?: Letterhead;
  paper: 'A4' | 'LETTER';
}

export const DEFAULT_SHIFT_SUMMARY_CONFIG: ReportConfig = {
  sections: [
    'header',
    'meta',
    'warnings',
    'nozzles',
    'handovers',
    'terminals',
    'creditSales',
    'cashRecon',
    'drawers',
    'signatures',
  ],
  showLogo: true,
  paper: 'A4',
};

export const DEFAULT_DSSR_CONFIG: DssrReportConfig = {
  sections: [
    'header',
    'meta',
    'kpis',
    'financial',
    'fuelByProduct',
    'nozzles',
    'fuelStockVariance',
    'merchandiseStockVariance',
    'shifts',
  ],
  showLogo: true,
  paper: 'A4',
};

export const DEFAULT_ATTENDANT_REPORT_CONFIG: AttendantReportConfig = {
  sections: [
    'header',
    'summary',
    'fuelSales',
    'merchandise',
    'creditSales',
    'terminals',
    'variance',
    'signature',
  ],
  showLogo: true,
  paper: 'A4',
};

/** Human labels for the section-config UI (R2). `header` is always rendered. */
export const SHIFT_SUMMARY_SECTION_LABELS: Record<ShiftSummarySection, string> = {
  header: 'Header / Letterhead',
  meta: 'Shift Meta',
  warnings: 'Warnings',
  nozzles: 'Nozzle Reconciliation',
  handovers: 'Attendant Handovers',
  terminals: 'POS Terminals',
  creditSales: 'Fuel-on-Credit Sales',
  cashRecon: 'Cash Reconciliation',
  drawers: 'Drawers (per attendant)',
  signatures: 'Signatures',
};

export const DSSR_SECTION_LABELS: Record<DssrSection, string> = {
  header: 'Header / Letterhead',
  meta: 'Day Meta',
  kpis: 'KPIs',
  financial: 'Financial Summary',
  fuelByProduct: 'Fuel Sales by Product',
  nozzles: 'Nozzle Aggregation',
  fuelStockVariance: 'Tank Dip & Fuel Variance',
  merchandiseStockVariance: 'Product Stock Variance',
  shifts: 'Included Shifts',
};

export const ATTENDANT_REPORT_SECTION_LABELS: Record<AttendantReportSection, string> = {
  header: 'Header / Letterhead',
  summary: 'Period Summary',
  fuelSales: 'Fuel Sales by Shift',
  merchandise: 'Product Sales (Billed + Handover)',
  creditSales: 'Fuel-on-Credit Sales',
  terminals: 'Payment Terminals',
  variance: 'Variance by Shift',
  signature: 'Acknowledgement & Signatures',
};

/**
 * The sections to render from a station's saved list: keeps its order, drops
 * keys that no longer exist (e.g. the Shift Summary 'purchases' section removed
 * in #308), and falls back to the defaults when nothing valid is left.
 */
export function resolveSections<S extends string>(
  saved: readonly unknown[] | null | undefined,
  defaults: readonly S[],
): S[] {
  const known = (saved ?? []).filter((k): k is S => defaults.includes(k as S));
  return known.length > 0 ? known : [...defaults];
}

/** Resolve the configured paper size from a station's settings (default A4). */
export function paperFromStation(station: any): 'A4' | 'LETTER' {
  return station?.settings?.report_config?.paper === 'LETTER' ? 'LETTER' : 'A4';
}

/**
 * What a document prints with, overriding the station's saved layout: the
 * template preview (#605) prints the layout being edited, not the saved one.
 */
export interface DocConfigOverrides {
  /** The enabled section keys, in print order. */
  sections?: readonly string[];
  paper?: 'A4' | 'LETTER';
  showLogo?: boolean;
}

interface StationForReports {
  name?: string;
  settings?: Record<string, any> | null;
}

/** The letterhead, with the logo choice the document prints with. */
function docLetterhead(station: StationForReports | null | undefined, over: DocConfigOverrides) {
  const letterhead = letterheadFromStation(station);
  return letterhead && over.showLogo !== undefined
    ? { ...letterhead, showLogo: over.showLogo }
    : letterhead;
}

const savedSections = (station: StationForReports | null | undefined, key: string) =>
  station?.settings?.report_config?.[key] as readonly unknown[] | undefined;

/**
 * The Shift Summary's document config from a station: its saved sections,
 * letterhead and paper. The PDF export and the template preview build it here,
 * so the preview prints what the export prints.
 */
export function shiftSummaryDocConfig(
  station: StationForReports | null | undefined,
  over: DocConfigOverrides = {},
  fallbackName?: string,
): ReportConfig {
  return {
    ...DEFAULT_SHIFT_SUMMARY_CONFIG,
    sections: resolveSections(
      over.sections ?? savedSections(station, 'shiftSummary'),
      DEFAULT_SHIFT_SUMMARY_CONFIG.sections,
    ),
    stationName: station?.name || fallbackName,
    letterhead: docLetterhead(station, over),
    paper: over.paper ?? paperFromStation(station),
  };
}

/** The DSR's document config from a station (see `shiftSummaryDocConfig`). */
export function dssrDocConfig(
  station: StationForReports | null | undefined,
  over: DocConfigOverrides = {},
): DssrReportConfig {
  return {
    ...DEFAULT_DSSR_CONFIG,
    sections: resolveSections(
      over.sections ?? savedSections(station, 'dssr'),
      DEFAULT_DSSR_CONFIG.sections,
    ),
    stationName: station?.name,
    letterhead: docLetterhead(station, over),
    paper: over.paper ?? paperFromStation(station),
  };
}

/** The Attendant Handover Report's document config from a station. */
export function attendantReportDocConfig(
  station: StationForReports | null | undefined,
  over: DocConfigOverrides = {},
): AttendantReportConfig {
  return {
    ...DEFAULT_ATTENDANT_REPORT_CONFIG,
    sections: resolveSections(
      over.sections ?? savedSections(station, 'attendantReport'),
      DEFAULT_ATTENDANT_REPORT_CONFIG.sections,
    ),
    stationName: station?.name,
    letterhead: docLetterhead(station, over),
    paper: over.paper ?? paperFromStation(station),
    // A station that turned its logo off must not get one back.
    showLogo: over.showLogo ?? showLogoFromStation(station),
  };
}
