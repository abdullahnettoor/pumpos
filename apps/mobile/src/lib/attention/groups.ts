import type { AlertCategory, MobileAlert } from './types.js';

export interface AlertKind {
  category: AlertCategory;
  label: string;
  /** The button text on a row that opens a page. */
  actionLabel: string;
}

/** Page order of the groups. */
export const ALERT_KINDS: readonly AlertKind[] = [
  { category: 'stock', label: 'Stock', actionLabel: '' },
  { category: 'day', label: 'Day close', actionLabel: 'View' },
  { category: 'credit', label: 'Credit', actionLabel: 'View' },
  { category: 'variance', label: 'Cash variance', actionLabel: 'Open' },
  { category: 'handover', label: 'Handover', actionLabel: 'Continue' },
];

export interface AlertGroup extends AlertKind {
  alerts: MobileAlert[];
}

/** The page's groups: one per kind that has alerts, each keeping the list's order. */
export function groupAlerts(alerts: readonly MobileAlert[]): AlertGroup[] {
  return ALERT_KINDS.map((kind) => ({
    ...kind,
    alerts: alerts.filter((a) => a.category === kind.category),
  })).filter((g) => g.alerts.length > 0);
}

export const actionLabelFor = (category: AlertCategory): string =>
  ALERT_KINDS.find((k) => k.category === category)?.actionLabel ?? '';
