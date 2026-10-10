import type { TabKey } from '../../shell/tabs.js';
import type { AlertCategory, MobileAlert } from './types.js';

export interface AlertKind {
  /** The page's group heading. */
  label: string;
  /** The button text on a row that opens a page; stock opens none. */
  actionLabel?: string;
  /** The tab the opened page belongs to: a Role without it may not open it. */
  tab: TabKey | null;
}

/**
 * Everything the app knows per kind of alert, in one place. Exhaustive over
 * `AlertCategory` (which follows `AlertAction['kind']`), so a new kind fails to
 * compile until it is described here. Declaration order is the page's group order.
 */
export const ALERT_KINDS: Record<AlertCategory, AlertKind> = {
  stock: { label: 'Stock', tab: null },
  day: { label: 'Day close', actionLabel: 'View', tab: 'reports' },
  credit: { label: 'Credit', actionLabel: 'View', tab: 'money' },
  variance: { label: 'Cash variance', actionLabel: 'Open', tab: 'shifts' },
  handover: { label: 'Handover', actionLabel: 'Continue', tab: null },
};

const PAGE_ORDER = Object.keys(ALERT_KINDS) as AlertCategory[];

export interface AlertGroup extends AlertKind {
  category: AlertCategory;
  alerts: MobileAlert[];
}

/** The page's groups: one per kind that has alerts, each keeping the list's order. */
export function groupAlerts(alerts: readonly MobileAlert[]): AlertGroup[] {
  return PAGE_ORDER.map((category) => ({
    ...ALERT_KINDS[category],
    category,
    alerts: alerts.filter((a) => a.category === category),
  })).filter((g) => g.alerts.length > 0);
}

/**
 * Home's top alerts. The user's own unsaved handover is left out: the pinned
 * handover card above already shows it. It stays in the bell count and on the
 * Needs attention page.
 */
export function homeAlerts(alerts: readonly MobileAlert[], limit: number): MobileAlert[] {
  return alerts.filter((a) => a.category !== 'handover').slice(0, limit);
}
