import { REPORTS_ROLES, type Role } from '@pump/shared';
import type { IconName } from '../pump-ds/icon/registry.js';
import { CONCEPT_ICON } from '../pump-ds/icon/concepts.js';
import type { NavIntent } from './store.js';

/**
 * The shell's page routes (#540). One topic, one home: every in-app link and
 * nav intent names a route from here rather than a string literal, so a page
 * that moves only moves here.
 */
export const ROUTES = {
  dashboard: '/dashboard',
  shifts: '/shifts',
  inventory: '/inventory',
  pricing: '/pricing',
  customers: '/customers',
  suppliers: '/suppliers',
  accounts: '/accounts',
  expenses: '/expenses',
  income: '/income',
  reports: '/reports',
  station: '/setup/station',
  organization: '/organization',
} as const;

export type RoutePath = (typeof ROUTES)[keyof typeof ROUTES];

/**
 * Routes that were renamed. An old bookmark, a reload of an old hash
 * (`#/purchases`) or a stale link resolves to the page's new home.
 */
export const LEGACY_ROUTES: Readonly<Record<string, RoutePath>> = {
  '/purchases': ROUTES.suppliers,
};

/** The current route for `path`: a renamed route resolves to its new home. */
export function resolveRoute(path: string): string {
  return LEGACY_ROUTES[path] ?? path;
}

/**
 * The page a path belongs to, for the shell's page switch and the sidebar: a
 * detail route under a page (`/accounts/<id>?from=…`) belongs to that page.
 * A path under no page comes back without its query.
 */
export function pageRoute(path: string): string {
  const bare = path.split('?')[0];
  const pages: readonly string[] = Object.values(ROUTES);
  if (pages.includes(bare)) return bare;
  return pages.find((page) => bare.startsWith(`${page}/`)) ?? bare;
}

/** A statement period in a route: business dates `YYYY-MM-DD`, `to` inclusive. */
export interface RouteRange {
  from: string;
  to: string;
}

/** A real calendar date `YYYY-MM-DD` (not `2026-02-31`). */
const isCalendarDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
};

/**
 * One Financial Account's page (#576): `/accounts/<id>`, and its statement
 * period as `?from=&to=` when it is not the default. A real address, so
 * back, forward, reload and a shared link all land on it.
 */
export function accountRoute(accountId: string, range?: RouteRange | null): string {
  const path = `${ROUTES.accounts}/${encodeURIComponent(accountId)}`;
  if (!range) return path;
  return `${path}?${new URLSearchParams({ from: range.from, to: range.to }).toString()}`;
}

/**
 * The account and period an account route names, or null for any other path.
 * A period that is not two dates in order is dropped (the page shows its
 * default), never half-applied.
 */
export function parseAccountRoute(
  path: string,
): { accountId: string; range: RouteRange | null } | null {
  const [bare, query = ''] = path.split('?');
  const prefix = `${ROUTES.accounts}/`;
  if (!bare.startsWith(prefix)) return null;
  const rest = bare.slice(prefix.length);
  if (!rest || rest.includes('/')) return null;
  let accountId: string;
  try {
    accountId = decodeURIComponent(rest);
  } catch {
    return null;
  }
  const params = new URLSearchParams(query);
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const range = isCalendarDate(from) && isCalendarDate(to) && from <= to ? { from, to } : null;
  return { accountId, range };
}

/**
 * Where a navigation lands once its intent is applied. `{ openAccountId }`
 * names an address of its own (#576), so it becomes a navigation to the
 * account's route rather than an intent the Accounts page takes.
 */
export function navTarget(
  path: string,
  intent?: NavIntent | null,
): { path: string; intent: NavIntent | null } {
  if (!intent?.openAccountId) return { path, intent: intent ?? null };
  const { openAccountId, ...rest } = intent;
  return {
    path: accountRoute(openAccountId),
    intent: Object.keys(rest).length ? rest : null,
  };
}

export interface NavPage {
  label: string;
  path: RoutePath;
  icon: IconName;
  /** Roles that see the page. Omitted = every role. */
  roles?: Role[];
}

/**
 * The operational sidebar, in order. Labels are the page titles (sentence
 * case). Insights is planned (Insights milestone) and stays out until built.
 */
export const NAV_PAGES: readonly NavPage[] = [
  { label: 'Dashboard', path: ROUTES.dashboard, icon: CONCEPT_ICON.dashboard },
  {
    label: 'Shifts',
    path: ROUTES.shifts,
    icon: CONCEPT_ICON.shifts,
    roles: ['Owner', 'Manager', 'Accountant', 'Staff'],
  },
  {
    label: 'Inventory',
    path: ROUTES.inventory,
    icon: CONCEPT_ICON.inventory,
    roles: ['Owner', 'Manager', 'Accountant'],
  },
  {
    label: 'Pricing',
    path: ROUTES.pricing,
    icon: CONCEPT_ICON.pricing,
    roles: ['Owner', 'Manager'],
  },
  { label: 'Customers', path: ROUTES.customers, icon: CONCEPT_ICON.customers },
  {
    label: 'Suppliers',
    path: ROUTES.suppliers,
    icon: CONCEPT_ICON.suppliers,
    roles: ['Owner', 'Manager', 'Accountant'],
  },
  {
    label: 'Accounts',
    path: ROUTES.accounts,
    icon: CONCEPT_ICON.accounts,
    roles: ['Owner', 'Manager', 'Accountant'],
  },
  { label: 'Expenses', path: ROUTES.expenses, icon: CONCEPT_ICON.expenses },
  { label: 'Income', path: ROUTES.income, icon: CONCEPT_ICON.income },
  {
    label: 'Reports',
    path: ROUTES.reports,
    icon: CONCEPT_ICON.reports,
    roles: [...REPORTS_ROLES],
  },
  {
    label: 'Station',
    path: ROUTES.station,
    icon: CONCEPT_ICON.station,
    roles: ['Owner', 'Manager'],
  },
  {
    label: 'Organization',
    path: ROUTES.organization,
    icon: CONCEPT_ICON.organization,
    roles: ['Owner'],
  },
];

/** A page's title: its sidebar label (#523). Undefined off the sidebar. */
export function pageTitle(path: RoutePath): string | undefined {
  return NAV_PAGES.find((p) => p.path === path)?.label;
}

/**
 * Sidebar groups. Items are matched by path; order within a group follows
 * `paths`. Anything unmatched falls into a trailing group.
 */
export const NAV_GROUPS: readonly { heading: string; paths: readonly string[] }[] = [
  {
    heading: 'Operate',
    paths: [ROUTES.dashboard, ROUTES.shifts, ROUTES.inventory, ROUTES.pricing],
  },
  { heading: 'Parties', paths: [ROUTES.customers, ROUTES.suppliers] },
  { heading: 'Books', paths: [ROUTES.accounts, ROUTES.expenses, ROUTES.income] },
  { heading: 'Insight', paths: [ROUTES.reports] },
  { heading: 'Setup', paths: [ROUTES.station, ROUTES.organization] },
];
