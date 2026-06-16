import { describe, it, expect } from 'vitest';
import {
  canOpenShift,
  canCloseShift,
  canReopenShift,
  canEditExpense,
  canCreatePurchase,
  isAuthorizedForStation,
  UserContext,
  ResourceContext
} from './guards.js';

describe('Role and Shift Permissions Guards', () => {
  describe('isAuthorizedForStation', () => {
    it('should allow Owners to access any station', () => {
      const owner: UserContext = { role: 'Owner', assignedStationIds: [] };
      const resource: ResourceContext = { organizationId: 'org-1', stationId: 'station-A' };
      expect(isAuthorizedForStation(owner, resource)).toBe(true);
    });

    it('should allow Staff to access their assigned station', () => {
      const staff: UserContext = { role: 'Staff', assignedStationIds: ['station-A'] };
      const resource: ResourceContext = { organizationId: 'org-1', stationId: 'station-A' };
      expect(isAuthorizedForStation(staff, resource)).toBe(true);
    });

    it('should deny Staff from accessing unassigned stations', () => {
      const staff: UserContext = { role: 'Staff', assignedStationIds: ['station-A'] };
      const resource: ResourceContext = { organizationId: 'org-1', stationId: 'station-B' };
      expect(isAuthorizedForStation(staff, resource)).toBe(false);
    });
  });

  describe('Shift Lifecycle Guards', () => {
    it('should allow Owners, Managers, and Staff to open shifts', () => {
      expect(canOpenShift('Owner')).toBe(true);
      expect(canOpenShift('Manager')).toBe(true);
      expect(canOpenShift('Staff')).toBe(true);
      expect(canOpenShift('Accountant')).toBe(false);
    });

    it('should restrict reopening shifts to Owners and Managers only', () => {
      expect(canReopenShift('Owner')).toBe(true);
      expect(canReopenShift('Manager')).toBe(true);
      expect(canReopenShift('Staff')).toBe(false);
      expect(canReopenShift('Accountant')).toBe(false);
    });
  });

  describe('Expense Modification Guards', () => {
    it('should allow editing expense in OPEN shifts', () => {
      expect(canEditExpense('Staff', 'OPEN')).toBe(true);
      expect(canEditExpense('Accountant', 'OPEN')).toBe(true);
    });

    it('should deny editing expense in CLOSED or LOCKED shifts', () => {
      expect(canEditExpense('Owner', 'CLOSED')).toBe(false);
      expect(canEditExpense('Owner', 'LOCKED')).toBe(false);
    });
  });

  describe('Purchase Management Guards', () => {
    it('should deny Staff from creating purchases', () => {
      expect(canCreatePurchase('Staff')).toBe(false);
    });

    it('should allow Owners, Managers, and Accountants to create purchases', () => {
      expect(canCreatePurchase('Owner')).toBe(true);
      expect(canCreatePurchase('Manager')).toBe(true);
      expect(canCreatePurchase('Accountant')).toBe(true);
    });
  });
});
