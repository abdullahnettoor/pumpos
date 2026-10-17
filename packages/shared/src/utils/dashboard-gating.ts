/**
 * The dashboard gating table: one source of truth mapping each card or action
 * to a Permission (spec #499). A hidden card must not request data.
 * Attendants are mobile-only and see nothing.
 */
import { can, type PermissionId, type Principal } from '../permissions/catalogue.js';

export const DASHBOARD_CARDS = [
  'openDaysNotice',
  'timeline',
  'timelineOfficeEvents',
  'forecourt',
  'fuels',
  'recordDensity',
  'planPurchaseDecant',
  'money',
  'liveMargin',
  'trend',
  'yourShift',
] as const;

export type DashboardCard = (typeof DASHBOARD_CARDS)[number];

const GATES: Record<DashboardCard, readonly PermissionId[]> = {
  openDaysNotice: ['reports.view'],
  timeline: ['dashboard.operations'],
  timelineOfficeEvents: ['reports.view'],
  forecourt: ['dashboard.operations'], // Accountant: view only (see shiftWorkspaceAction)
  fuels: ['dashboard.operations'],
  // Everyone the API lets record density: Owner, Manager, Accountant and Staff.
  recordDensity: ['inventory.density'],
  planPurchaseDecant: ['purchases.record', 'inventory.decantation'],
  money: ['reports.view'],
  liveMargin: ['finance.viewMargin'],
  trend: ['reports.view'],
  yourShift: ['dashboard.yourShift'],
};

export function canSeeDashboardCard(card: DashboardCard, principal: Principal): boolean {
  return GATES[card].every((p) => can(principal, p));
}

export function dashboardCardsFor(principal: Principal): DashboardCard[] {
  return DASHBOARD_CARDS.filter((c) => canSeeDashboardCard(c, principal));
}

/**
 * Header button: 'act' = "Shift workspace" ("Open shift" when none is open),
 * 'view' = "View shift" (Accountant), null = no button.
 */
export function shiftWorkspaceAction(principal: Principal): 'act' | 'view' | null {
  if (can(principal, 'shifts.open')) return 'act';
  if (can(principal, 'pages.shifts')) return 'view';
  return null;
}

/** Whether the dashboard shows the density Record action. The server rule is the gate. */
export const canRecordDensityFromDashboard = (principal: Principal): boolean =>
  canSeeDashboardCard('recordDensity', principal);
