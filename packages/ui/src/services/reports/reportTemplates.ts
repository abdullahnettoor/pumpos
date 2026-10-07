// Report templates (#332): which sections each printed report shows, in what
// order, and the presets that set them. Plain data + pure functions, no React
// and no PDF engine, so the Templates UI and its tests share one model.
//
// The saved shape does not change: `stations.settings.report_config` holds each
// report's enabled section keys in print order, plus `paper` and `showLogo`.
import {
  ATTENDANT_REPORT_SECTION_LABELS,
  DEFAULT_ATTENDANT_REPORT_CONFIG,
  DEFAULT_DSSR_CONFIG,
  DEFAULT_SHIFT_SUMMARY_CONFIG,
  DSSR_SECTION_LABELS,
  SHIFT_SUMMARY_SECTION_LABELS,
  paperFromStation,
  resolveSections,
} from './reportConfig.js';
import { showLogoFromStation } from './letterhead.js';

/** The key each report's section list is saved under in `report_config`. */
export type ReportTemplateId = 'shiftSummary' | 'dssr' | 'attendantReport';
export type PresetId = 'full' | 'compact' | 'cashDesk';
export type Paper = 'A4' | 'LETTER';

/** How the preview draws a section's representative content. */
export type SectionKind =
  | { kind: 'meta'; lines: string[] }
  | { kind: 'kpis'; tiles: [string, string][] }
  | { kind: 'table'; columns: string[] }
  | { kind: 'note'; text: string }
  | { kind: 'signatures'; roles: string[] };

export interface SectionState {
  key: string;
  enabled: boolean;
}

export interface ReportTemplate {
  id: ReportTemplateId;
  name: string;
  /** When the report prints, shown on the card and in the drawer. */
  when: string;
  /** The title printed in the letterhead band. */
  docTitle: string;
  defaults: readonly string[];
  labels: Record<string, string>;
  /** One line of what the section prints. */
  descriptions: Record<string, string>;
  preview: Record<string, SectionKind>;
  presets: Record<Exclude<PresetId, 'full'>, readonly string[]>;
}

/** The section that always prints first and can't be hidden or moved. */
export const LOCKED_SECTION = 'header';

const header = {
  description: 'Station name, address, GSTIN and logo',
};

const SHIFT_SUMMARY: ReportTemplate = {
  id: 'shiftSummary',
  name: 'Shift Summary',
  when: 'Printed when a shift is closed',
  docTitle: 'Shift Summary Record',
  defaults: DEFAULT_SHIFT_SUMMARY_CONFIG.sections,
  labels: SHIFT_SUMMARY_SECTION_LABELS,
  descriptions: {
    header: header.description,
    meta: 'Shift number, business day, who opened and closed it, times',
    warnings: 'Unresolved readings, open drawers and other anomalies',
    nozzles: 'Opening and closing reading, litres and amount per nozzle',
    handovers: "Each attendant's declared cash and variance",
    terminals: 'Card and UPI settlement by terminal',
    creditSales: 'Customer, vehicle, litres and amount',
    cashRecon: 'Expected vs counted cash and the office variance',
    drawers: 'Float, sales, drops and declared cash per drawer',
    signatures: 'Manager and attendant sign-off lines',
  },
  preview: {
    meta: { kind: 'meta', lines: ['Shift 2 · 29 Sep 2026', 'Opened 06:00 by Ravi · Closed 14:05'] },
    warnings: { kind: 'note', text: '1 nozzle reading needs review' },
    nozzles: { kind: 'table', columns: ['Nozzle', 'Opening', 'Closing', 'Litres', 'Amount'] },
    handovers: { kind: 'table', columns: ['Attendant', 'Declared', 'Expected', 'Variance'] },
    terminals: { kind: 'table', columns: ['Terminal', 'Card', 'UPI', 'Total'] },
    creditSales: { kind: 'table', columns: ['Customer', 'Vehicle', 'Litres', 'Amount'] },
    cashRecon: {
      kind: 'kpis',
      tiles: [
        ['Expected', '48,250'],
        ['Counted', '48,200'],
        ['Variance', '−50'],
      ],
    },
    drawers: { kind: 'table', columns: ['Drawer', 'Float', 'Sales', 'Drops', 'Declared'] },
    signatures: { kind: 'signatures', roles: ['Manager', 'Attendant'] },
  },
  presets: {
    compact: ['header', 'meta', 'nozzles', 'cashRecon', 'signatures'],
    cashDesk: ['header', 'meta', 'handovers', 'cashRecon', 'drawers', 'signatures'],
  },
};

const DSSR: ReportTemplate = {
  id: 'dssr',
  name: 'Daily DSSR',
  when: 'Printed when a business day is closed',
  docTitle: 'Daily Sales Summary Record',
  defaults: DEFAULT_DSSR_CONFIG.sections,
  labels: DSSR_SECTION_LABELS,
  descriptions: {
    header: header.description,
    meta: 'Business date, shifts and who closed the day',
    kpis: 'Litres, revenue, credit and variance at a glance',
    financial: 'Cash, card/UPI and credit totals',
    fuelByProduct: 'Litres and value for each fuel',
    nozzles: 'Day totals per nozzle',
    fuelStockVariance: 'Book vs dip stock per tank',
    merchandiseStockVariance: 'Lubricant and accessory stock variance',
    shifts: "Each of the day's shifts with its totals",
  },
  preview: {
    meta: { kind: 'meta', lines: ['Business day 29 Sep 2026', '3 shifts · Closed by Anitha'] },
    kpis: {
      kind: 'kpis',
      tiles: [
        ['Litres', '8,420'],
        ['Revenue', '8.6L'],
        ['Credit', '72k'],
        ['Variance', '−120'],
      ],
    },
    financial: { kind: 'table', columns: ['Method', 'Amount'] },
    fuelByProduct: { kind: 'table', columns: ['Product', 'Litres', 'Rate', 'Amount'] },
    nozzles: { kind: 'table', columns: ['Nozzle', 'Product', 'Litres', 'Amount'] },
    fuelStockVariance: { kind: 'table', columns: ['Tank', 'Book', 'Dip', 'Variance'] },
    merchandiseStockVariance: {
      kind: 'table',
      columns: ['Product', 'Book', 'Counted', 'Variance'],
    },
    shifts: { kind: 'table', columns: ['Shift', 'Litres', 'Amount', 'Variance'] },
  },
  presets: {
    compact: ['header', 'meta', 'kpis', 'financial', 'fuelByProduct'],
    cashDesk: ['header', 'meta', 'financial', 'shifts'],
  },
};

const ATTENDANT_REPORT: ReportTemplate = {
  id: 'attendantReport',
  name: 'Attendant Handover Report',
  when: 'Printed per attendant for a period',
  docTitle: 'Attendant Handover Report',
  defaults: DEFAULT_ATTENDANT_REPORT_CONFIG.sections,
  labels: ATTENDANT_REPORT_SECTION_LABELS,
  descriptions: {
    header: header.description,
    summary: 'Shifts worked, litres, cash and variance for the period',
    fuelSales: 'Litres and value per shift',
    merchandise: 'Product sales billed and handed over',
    creditSales: 'Credit sales the attendant recorded',
    terminals: 'Card and UPI taken',
    variance: 'Shortage or excess per shift',
    signature: "The attendant's acknowledgement and sign-off",
  },
  preview: {
    summary: {
      kind: 'kpis',
      tiles: [
        ['Shifts', '12'],
        ['Litres', '9,860'],
        ['Cash', '3.1L'],
        ['Variance', '−240'],
      ],
    },
    fuelSales: { kind: 'table', columns: ['Shift', 'Product', 'Litres', 'Amount'] },
    merchandise: { kind: 'table', columns: ['Product', 'Qty', 'Amount'] },
    creditSales: { kind: 'table', columns: ['Customer', 'Vehicle', 'Amount'] },
    terminals: { kind: 'table', columns: ['Terminal', 'Card', 'UPI'] },
    variance: { kind: 'table', columns: ['Shift', 'Expected', 'Declared', 'Variance'] },
    signature: { kind: 'signatures', roles: ['Attendant', 'Manager'] },
  },
  presets: {
    compact: ['header', 'summary', 'variance', 'signature'],
    cashDesk: ['header', 'summary', 'terminals', 'variance', 'signature'],
  },
};

export const REPORT_TEMPLATES: readonly ReportTemplate[] = [SHIFT_SUMMARY, DSSR, ATTENDANT_REPORT];

export function templateById(id: ReportTemplateId): ReportTemplate {
  return REPORT_TEMPLATES.find((t) => t.id === id) ?? SHIFT_SUMMARY;
}

export const REPORT_PRESETS: readonly { id: PresetId; name: string; description: string }[] = [
  { id: 'full', name: 'Full', description: 'Every section' },
  { id: 'compact', name: 'Compact', description: 'One page, totals' },
  { id: 'cashDesk', name: 'Cash desk', description: 'Cash and drawers' },
];

/**
 * Every section of the report: the saved (enabled) ones first in saved order,
 * then the rest switched off, with the letterhead pinned first and on.
 */
export function sectionsFromStation(template: ReportTemplate, station: any): SectionState[] {
  const saved = resolveSections(station?.settings?.report_config?.[template.id], template.defaults);
  const enabled = new Set<string>(saved);
  const ordered = [
    LOCKED_SECTION,
    ...saved.filter((k) => k !== LOCKED_SECTION),
    ...template.defaults.filter((k) => !enabled.has(k) && k !== LOCKED_SECTION),
  ];
  return ordered.map((key) => ({ key, enabled: key === LOCKED_SECTION || enabled.has(key) }));
}

/** The default order with the preset's sections switched on. */
export function applyPreset(template: ReportTemplate, preset: PresetId): SectionState[] {
  const picked = preset === 'full' ? null : new Set(template.presets[preset]);
  return template.defaults.map((key) => ({
    key,
    enabled: key === LOCKED_SECTION || !picked || picked.has(key),
  }));
}

/** The preset the list matches exactly (default order and toggles), or null for Custom. */
export function presetOf(template: ReportTemplate, list: readonly SectionState[]): PresetId | null {
  for (const { id } of REPORT_PRESETS) {
    const expected = applyPreset(template, id);
    if (
      expected.length === list.length &&
      expected.every((s, i) => s.key === list[i].key && s.enabled === list[i].enabled)
    ) {
      return id;
    }
  }
  return null;
}

export function presetLabel(template: ReportTemplate, list: readonly SectionState[]): string {
  const id = presetOf(template, list);
  return REPORT_PRESETS.find((p) => p.id === id)?.name ?? 'Custom';
}

/** Switch a section on or off. The letterhead can't be switched off. */
export function toggleSection(list: SectionState[], key: string): SectionState[] {
  if (key === LOCKED_SECTION) return list;
  return list.map((s) => (s.key === key ? { ...s, enabled: !s.enabled } : s));
}

/** Whether a section can move one step up (-1) or down (+1). The letterhead stays first. */
export function canMoveSection(list: readonly SectionState[], key: string, delta: -1 | 1): boolean {
  const from = list.findIndex((s) => s.key === key);
  const to = from + delta;
  return from > 0 && key !== LOCKED_SECTION && to >= 1 && to < list.length;
}

export function moveSection(list: SectionState[], key: string, delta: -1 | 1): SectionState[] {
  if (!canMoveSection(list, key, delta)) return list;
  const from = list.findIndex((s) => s.key === key);
  const next = [...list];
  [next[from], next[from + delta]] = [next[from + delta], next[from]];
  return next;
}

export function enabledCount(list: readonly SectionState[]): number {
  return list.filter((s) => s.enabled).length;
}

export function sameSections(a: readonly SectionState[], b: readonly SectionState[]): boolean {
  return (
    a.length === b.length && a.every((s, i) => s.key === b[i].key && s.enabled === b[i].enabled)
  );
}

export interface ReportConfigChange {
  shiftSummary?: readonly SectionState[];
  dssr?: readonly SectionState[];
  attendantReport?: readonly SectionState[];
  paper?: Paper;
  showLogo?: boolean;
}

/**
 * The station's `settings` with the change applied to `report_config`.
 * Everything else in settings and in `report_config` is kept as saved.
 */
export function reportConfigSettings(
  station: any,
  change: ReportConfigChange,
): Record<string, any> {
  const settings = station?.settings ?? {};
  // `showStationLogo` is the legacy key; it outranks `showLogo` when read, so
  // it is dropped once the logo setting is written again.
  const { showStationLogo: _legacy, ...saved } = settings.report_config ?? {};
  const next: Record<string, any> = { ...saved };
  for (const template of REPORT_TEMPLATES) {
    const list = change[template.id];
    if (list) next[template.id] = list.filter((s) => s.enabled).map((s) => s.key);
  }
  next.paper = change.paper ?? paperFromStation(station);
  next.showLogo = change.showLogo ?? showLogoFromStation(station);
  return { ...settings, report_config: next };
}
