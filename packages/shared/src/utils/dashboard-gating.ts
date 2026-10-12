/**
 * The dashboard gating table: one source of truth mapping each card or action
 * to the shared role checks (spec #499). A hidden card must not request data.
 * Attendants are mobile-only and see nothing.
 */
import {
  canOpenShift,
  canRecordDecantation,
  canRecordPurchase,
  canViewReports,
} from '../permissions/guards.js';
import type { Role } from '../types/core.js';

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

const isOperator = (role: Role) => role !== 'Attendant';
const isStaff = (role: Role) => role === 'Staff';

const GATES: Record<DashboardCard, (role: Role) => boolean> = {
  openDaysNotice: canViewReports,
  timeline: isOperator,
  timelineOfficeEvents: canViewReports,
  forecourt: isOperator, // Accountant: view only (see shiftWorkspaceAction)
  fuels: isOperator,
  // Spec: Owner, Manager and Staff record density; Accountant reads only.
  recordDensity: (r) => r === 'Owner' || r === 'Manager' || r === 'Staff',
  planPurchaseDecant: (r) => canRecordPurchase(r) && canRecordDecantation(r),
  money: canViewReports,
  liveMargin: (r) => r === 'Owner',
  trend: canViewReports,
  yourShift: isStaff,
};

export function canSeeDashboardCard(card: DashboardCard, role: Role): boolean {
  return GATES[card](role);
}

export function dashboardCardsFor(role: Role): DashboardCard[] {
  return DASHBOARD_CARDS.filter((c) => canSeeDashboardCard(c, role));
}

/**
 * Header button: 'act' = "Shift workspace" ("Open shift" when none is open),
 * 'view' = "View shift" (Accountant), null = no button.
 */
export function shiftWorkspaceAction(role: Role): 'act' | 'view' | null {
  if (canOpenShift(role)) return 'act';
  if (role === 'Accountant') return 'view';
  return null;
}
