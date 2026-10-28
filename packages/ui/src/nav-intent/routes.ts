import type { PermissionId } from '@pump/shared';
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

/** The steps of the Close shift page (#534), in order; `done` is its success state. */
export const SHIFT_CLOSE_STEPS = ['readings', 'handovers', 'cash', 'confirm'] as const;
export type ShiftCloseStep = (typeof SHIFT_CLOSE_STEPS)[number] | 'done';

const isCloseStep = (value: string | null): value is ShiftCloseStep =>
  value === 'done' || (SHIFT_CLOSE_STEPS as readonly string[]).includes(value ?? '');

/**
 * One shift's Close shift page (#534): `/shifts/<id>/close`, and its step as
 * `?step=` past the first. A real address, so a reload resumes the step.
 */
export function shiftCloseRoute(shiftId: string, step: ShiftCloseStep = 'readings'): string {
  const path = `${ROUTES.shifts}/${encodeURIComponent(shiftId)}/close`;
  return step === 'readings' ? path : `${path}?step=${step}`;
}

/**
 * The shift and step a Close shift route names, or null for any other path.
 * An unknown step reads as the first.
 */
export function parseShiftCloseRoute(
  path: string,
): { shiftId: string; step: ShiftCloseStep } | null {
  const [bare, query = ''] = path.split('?');
  const match = /^\/shifts\/([^/]+)\/close$/.exec(bare);
  if (!match) return null;
  let shiftId: string;
  try {
    shiftId = decodeURIComponent(match[1]);
  } catch {
    return null;
  }
  const step = new URLSearchParams(query).get('step');
  return { shiftId, step: isCloseStep(step) ? step : 'readings' };
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
  /** The "View <page>" Permission that shows the page. */
  permission: PermissionId;
}

/**
 * The operational sidebar, in order. Labels are the page titles (sentence
 * case). Insights is planned (Insights milestone) and stays out until built.
 */
export const NAV_PAGES: readonly NavPage[] = [
  {
    label: 'Dashboard',
    path: ROUTES.dashboard,
    permission: 'pages.dashboard',
    icon: CONCEPT_ICON.dashboard,
  },
  {
    label: 'Shifts',
    path: ROUTES.shifts,
    permission: 'pages.shifts',
    icon: CONCEPT_ICON.shifts,
  },
  {
    label: 'Inventory',
    path: ROUTES.inventory,
    permission: 'pages.inventory',
    icon: CONCEPT_ICON.inventory,
  },
  {
    label: 'Pricing',
    path: ROUTES.pricing,
    permission: 'pages.pricing',
    icon: CONCEPT_ICON.pricing,
  },
  {
    label: 'Customers',
    path: ROUTES.customers,
    permission: 'pages.customers',
    icon: CONCEPT_ICON.customers,
  },
  {
    label: 'Suppliers',
    path: ROUTES.suppliers,
    permission: 'pages.suppliers',
    icon: CONCEPT_ICON.suppliers,
  },
  {
    label: 'Accounts',
    path: ROUTES.accounts,
    permission: 'pages.accounts',
    icon: CONCEPT_ICON.accounts,
  },
  {
    label: 'Expenses',
    path: ROUTES.expenses,
    permission: 'pages.expenses',
    icon: CONCEPT_ICON.expenses,
  },
  { label: 'Income', path: ROUTES.income, permission: 'pages.income', icon: CONCEPT_ICON.income },
  {
    label: 'Reports',
    path: ROUTES.reports,
    permission: 'pages.reports',
    icon: CONCEPT_ICON.reports,
  },
  {
    label: 'Station',
    path: ROUTES.station,
    permission: 'pages.station',
    icon: CONCEPT_ICON.station,
  },
  {
    label: 'Organization',
    path: ROUTES.organization,
    permission: 'pages.organization',
    icon: CONCEPT_ICON.organization,
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

/**
 * Goes to a page from outside the shell's navigate (a toast's "View" action,
 * #606): through the hash, so the shell's leave guard still asks first.
 */
export function goToRoute(path: string): void {
  if (typeof window !== 'undefined') window.location.hash = path;
}

/** The page the window shows now (from the hash), or null outside a browser. */
export function currentPage(): string | null {
  if (typeof window === 'undefined') return null;
  const raw = window.location.hash.replace(/^#/, '');
  return raw.startsWith('/') ? pageRoute(resolveRoute(raw)) : null;
}
