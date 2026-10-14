import { REPORTS_ROLES, type Role } from '@pump/shared';
import type { IconName } from '../pump-ds/icon/registry.js';
import { CONCEPT_ICON } from '../pump-ds/icon/concepts.js';

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
