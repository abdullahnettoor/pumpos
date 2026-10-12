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

const roles: Role[] = ['Owner', 'Manager', 'Accountant', 'Staff'];
// Spec table (#499): columns Owner, Manager, Accountant, Staff.
const spec: Record<DashboardCard, [boolean, boolean, boolean, boolean]> = {
  openDaysNotice: [true, true, true, false],
  timeline: [true, true, true, true],
  timelineOfficeEvents: [true, true, true, false],
  forecourt: [true, true, true, true],
  fuels: [true, true, true, true],
  recordDensity: [true, true, false, true],
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
      expect(roles.map((r) => canSeeDashboardCard(card, r))).toEqual(row);
    });
  }
  it('Attendant sees nothing (mobile-only)', () => {
    for (const c of DASHBOARD_CARDS) expect(canSeeDashboardCard(c, 'Attendant')).toBe(false);
  });
  it('dashboardCardsFor lists the visible cards', () => {
    expect(dashboardCardsFor('Staff')).toContain('yourShift');
    expect(dashboardCardsFor('Staff')).not.toContain('money');
  });
});

describe('shiftWorkspaceAction', () => {
  it('acts for Owner/Manager/Staff, views for Accountant', () => {
    expect(shiftWorkspaceAction('Owner')).toBe('act');
    expect(shiftWorkspaceAction('Manager')).toBe('act');
    expect(shiftWorkspaceAction('Staff')).toBe('act');
    expect(shiftWorkspaceAction('Accountant')).toBe('view');
    expect(shiftWorkspaceAction('Attendant')).toBeNull();
  });
});

describe('canRecordDensityFromDashboard', () => {
  it('only Owner and Manager (gating table AND server guard)', () => {
    expect(roles.map(canRecordDensityFromDashboard)).toEqual([true, true, false, false]);
  });
});
