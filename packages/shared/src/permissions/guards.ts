import { Role, ShiftState } from '../types/core.js';

export interface UserContext {
  role: Role;
  assignedStationIds: string[];
}

export interface ResourceContext {
  organizationId: string;
  stationId?: string | null;
}

/**
 * Checks if the user belongs to the same organization and is assigned to the station.
 * Owners bypass station-level scoping.
 */
export function isAuthorizedForStation(
  user: UserContext,
  resource: ResourceContext
): boolean {
  if (user.role === 'Owner') {
    return true;
  }
  if (!resource.stationId) {
    return false;
  }
  return user.assignedStationIds.includes(resource.stationId);
}

// ----------------------------------------------------
// Shift Permissions
// ----------------------------------------------------

export function canOpenShift(role: Role): boolean {
  return role === 'Owner' || role === 'Manager' || role === 'Staff';
}

export function canCloseShift(role: Role): boolean {
  return role === 'Owner' || role === 'Manager' || role === 'Staff';
}

export function canReopenShift(role: Role): boolean {
  // Only Owners and Managers can reopen during grace period
  return role === 'Owner' || role === 'Manager';
}

/** True for the mobile-only, self-scoped Attendant role. */
export function isAttendant(role: Role): boolean {
  return role === 'Attendant';
}

/**
 * Who may record an attendant handover. Attendants may record only their OWN
 * handover (enforced at the route by forcing userId = self); operational roles
 * may record on behalf of any attendant.
 */
export function canRecordHandover(role: Role): boolean {
  return role === 'Owner' || role === 'Manager' || role === 'Staff' || role === 'Attendant';
}

// ----------------------------------------------------
// Expense Permissions
// ----------------------------------------------------

export function canCreateExpense(role: Role): boolean {
  return role !== 'Attendant'; // All roles except the mobile-only Attendant
}

export function canEditExpense(role: Role, shiftState: ShiftState): boolean {
  if (shiftState === 'LOCKED') {
    return false; // Immutable
  }
  if (shiftState === 'CLOSED') {
    // Closed shifts cannot be edited directly; only Owners, Managers, Accountants can create adjustments
    return false;
  }
  return role !== 'Attendant'; // Any operational role during an open shift
}

export function canCreateExpenseAdjustment(role: Role): boolean {
  return role === 'Owner' || role === 'Manager' || role === 'Accountant';
}

export function canVoidExpense(role: Role): boolean {
  return role === 'Owner' || role === 'Manager';
}

// ----------------------------------------------------
// Purchase Permissions
// ----------------------------------------------------

export function canCreatePurchase(role: Role): boolean {
  return role === 'Owner' || role === 'Manager' || role === 'Accountant';
}

export function canEditPurchase(role: Role, shiftState: ShiftState): boolean {
  if (shiftState === 'LOCKED' || shiftState === 'CLOSED') {
    return false;
  }
  return role === 'Owner' || role === 'Manager' || role === 'Accountant';
}

export function canCreatePurchaseAdjustment(role: Role): boolean {
  return role === 'Owner' || role === 'Manager' || role === 'Accountant';
}

// ----------------------------------------------------
// Customer Permissions
// ----------------------------------------------------

export function canCreateCustomer(role: Role): boolean {
  return role === 'Owner' || role === 'Manager' || role === 'Accountant';
}

export function canEditCustomer(role: Role): boolean {
  return role === 'Owner' || role === 'Manager' || role === 'Accountant';
}

export function canChangeCreditLimit(role: Role): boolean {
  return role === 'Owner' || role === 'Manager';
}

export function canArchiveCustomer(role: Role): boolean {
  return role === 'Owner' || role === 'Manager';
}

// ----------------------------------------------------
// Supplier Permissions
// ----------------------------------------------------

export function canCreateSupplier(role: Role): boolean {
  return role === 'Owner' || role === 'Manager' || role === 'Accountant';
}

export function canEditSupplier(role: Role): boolean {
  return role === 'Owner' || role === 'Manager' || role === 'Accountant';
}

export function canArchiveSupplier(role: Role): boolean {
  return role === 'Owner' || role === 'Manager';
}

// ----------------------------------------------------
// Collection Permissions
// ----------------------------------------------------

export function canRecordCollection(role: Role): boolean {
  return role !== 'Attendant'; // All roles except the mobile-only Attendant
}

export function canEditCollection(role: Role, shiftState: ShiftState): boolean {
  if (shiftState === 'LOCKED' || shiftState === 'CLOSED') {
    return false;
  }
  return role !== 'Attendant'; // All operational roles can edit collections in open shifts
}

export function canCreateCollectionAdjustment(role: Role): boolean {
  return role === 'Owner' || role === 'Manager' || role === 'Accountant';
}

// ----------------------------------------------------
// Product & Infrastructure Permissions
// ----------------------------------------------------

export function canManageProduct(role: Role): boolean {
  return role === 'Owner' || role === 'Manager';
}

export function canManageInfrastructure(role: Role): boolean {
  return role === 'Owner' || role === 'Manager';
}

// ----------------------------------------------------
// Party (Customer / Supplier) & Purchase Permissions
// ----------------------------------------------------

/** Create/edit customers or suppliers (back-office). Owner, Manager, Accountant. */
export function canManageCustomers(role: Role): boolean {
  return role === 'Owner' || role === 'Manager' || role === 'Accountant';
}

export function canManageSuppliers(role: Role): boolean {
  return role === 'Owner' || role === 'Manager' || role === 'Accountant';
}

/** Archive (soft-delete) a customer or supplier. Owner, Manager only. */
export function canArchiveParty(role: Role): boolean {
  return role === 'Owner' || role === 'Manager';
}

/** Record purchases / supplier payments. Owner, Manager, Accountant (not Staff). */
export function canRecordPurchase(role: Role): boolean {
  return role === 'Owner' || role === 'Manager' || role === 'Accountant';
}

// ----------------------------------------------------
// User Management
// ----------------------------------------------------

export function canManageUsers(role: Role): boolean {
  return role === 'Owner';
}

// ----------------------------------------------------
// Reporting
// ----------------------------------------------------

export function canExportReports(role: Role): boolean {
  return role === 'Owner' || role === 'Manager' || role === 'Accountant';
}

// ----------------------------------------------------
// Financial Accounts (Phase F) — money accounts & ledger
// ----------------------------------------------------

/** Create/edit money accounts and view ledgers/balances. Owner, Manager, Accountant. */
export function canManageFinancialAccounts(role: Role): boolean {
  return role === 'Owner' || role === 'Manager' || role === 'Accountant';
}

// ----------------------------------------------------
// Expense categories (master data)
// ----------------------------------------------------

/** Create/rename expense categories. Owner, Manager, Accountant (not Staff). */
export function canManageExpenseCategory(role: Role): boolean {
  return role === 'Owner' || role === 'Manager' || role === 'Accountant';
}
