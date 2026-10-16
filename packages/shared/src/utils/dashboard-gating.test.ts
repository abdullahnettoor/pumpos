import { describe, expect, it } from 'vitest';
import type { Role } from '../types/core.js';
import {
  DASHBOARD_CARDS,
  canRecordDensityFromDashboard,
  canSeeDashboardCard,
  dashboardCardsFor,
  shiftWorkspaceAction,
  type DashboardCard,
} from './dashboard-gating.js';
import { principalOf } from '../permissions/catalogue.js';

const roles: Role[] = ['Owner', 'Manager', 'Accountant', 'Staff'];
// Spec table (#499): columns Owner, Manager, Accountant, Staff.
const spec: Record<DashboardCard, [boolean, boolean, boolean, boolean]> = {
  openDaysNotice: [true, true, true, false],
  timeline: [true, true, true, true],
  timelineOfficeEvents: [true, true, true, false],
  forecourt: [true, true, true, true],
  fuels: [true, true, true, true],
  // Accountants record density here too, as the API already allows (#551).
  recordDensity: [true, true, true, true],
  planPurchaseDecant: [true, true, true, false],
  money: [true, true, true, false],
  liveMargin: [true, false, false, false],
  trend: [true, true, true, false],
  yourShift: [false, false, false, true],
};

describe('dashboard gating table', () => {
  it('covers every card in the spec', () => {
    expect([...DASHBOARD_CARDS].sort()).toEqual(Object.keys(spec).sort());
  });
  for (const [card, row] of Object.entries(spec) as [DashboardCard, boolean[]][]) {
    it(`${card} matches the spec for all four roles`, () => {
      expect(roles.map((r) => canSeeDashboardCard(card, principalOf(r)))).toEqual(row);
    });
  }
  it('Attendant sees nothing (mobile-only)', () => {
    for (const c of DASHBOARD_CARDS)
      expect(canSeeDashboardCard(c, principalOf('Attendant'))).toBe(false);
  });
  it('dashboardCardsFor lists the visible cards', () => {
    expect(dashboardCardsFor(principalOf('Staff'))).toContain('yourShift');
    expect(dashboardCardsFor(principalOf('Staff'))).not.toContain('money');
  });
});

describe('shiftWorkspaceAction', () => {
  it('acts for Owner/Manager/Staff, views for Accountant', () => {
    expect(shiftWorkspaceAction(principalOf('Owner'))).toBe('act');
    expect(shiftWorkspaceAction(principalOf('Manager'))).toBe('act');
    expect(shiftWorkspaceAction(principalOf('Staff'))).toBe('act');
    expect(shiftWorkspaceAction(principalOf('Accountant'))).toBe('view');
    expect(shiftWorkspaceAction(principalOf('Attendant'))).toBeNull();
  });
});

describe('canRecordDensityFromDashboard', () => {
  it('Owner, Manager, Accountant and Staff, matching the server guard', () => {
    expect(roles.map((r) => canRecordDensityFromDashboard(principalOf(r)))).toEqual([
      true,
      true,
      true,
      true,
    ]);
  });
});
