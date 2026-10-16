import { BusinessEvents } from '@pump/core';
import {
  businessDayWindow as sharedBusinessDayWindow,
  can,
  canSeeDashboardCard,
  principalOf,
  type Principal,
  type Role,
} from '@pump/shared';

const E = BusinessEvents;

/** Shift, forecourt and stock events: what Staff may see on the dashboard timeline. */
export const FORECOURT_ACTIVITY_EVENTS: readonly string[] = [
  E.BUSINESS_DAY_OPENED,
  E.BUSINESS_DAY_CLOSED,
  E.SHIFT_OPENED,
  E.SHIFT_CLOSED,
  E.SHIFT_REOPENED,
  E.SHIFT_LOCKED,
  E.ATTENDANT_ASSIGNED,
  E.HANDOVER_RECORDED,
  E.CASH_DECLARED,
  E.DECANTATION_RECORDED,
  E.DECANTATION_FLAGGED,
  E.DECANTATION_DISCARDED,
  E.DECANTATION_PURCHASE_LINKED,
  E.DECANTATION_PURCHASE_UNLINKED,
  E.FUEL_RECEIVED,
  E.TANK_DIP_RECORDED,
  E.TANK_TRANSFER_COMPLETED,
  E.DENSITY_RECORDED,
  E.INVENTORY_ADJUSTED,
  E.PHYSICAL_COUNT_COMPLETED,
  E.VARIANCE_RECORDED,
];

/**
 * Events hidden from Staff: Office Records (entry-date world) plus the sales
 * and Product Purchase money events of the forecourt. Manager and Accountant
 * see these on top of the forecourt set.
 */
export const STAFF_HIDDEN_ACTIVITY_EVENTS: readonly string[] = [
  E.EXPENSE_RECORDED,
  E.EXPENSE_VOIDED,
  E.INCOME_RECORDED,
  E.INCOME_VOIDED,
  E.PAYMENT_RECEIVED,
  E.PAYMENT_MADE,
  E.SUPPLIER_PAID,
  E.CREDIT_PAYMENT_RECEIVED,
  E.PURCHASE_CREATED,
  E.CREDIT_SALE_CREATED,
  E.CREDIT_SALE_VOIDED,
  E.RETAIL_SALE_CREATED,
  E.RETAIL_SALE_VOIDED,
  E.DSSR_GENERATED,
];

/**
 * Office Record events (ADR 0005): placed by ENTRY DATE (the station-timezone
 * calendar date, no Day Start rollback), never by the Business Day window.
 */
export const OFFICE_ACTIVITY_EVENTS: readonly string[] = [
  E.EXPENSE_RECORDED,
  E.EXPENSE_VOIDED,
  E.INCOME_RECORDED,
  E.INCOME_VOIDED,
  E.PAYMENT_RECEIVED,
  E.PAYMENT_MADE,
  E.SUPPLIER_PAID,
  E.CREDIT_PAYMENT_RECEIVED,
];

/** Event types a role may read through the dated feed; Owner gets everything. */
export function dashboardEventTypesForRole(who: Role | Principal): readonly string[] | null {
  const principal = typeof who === 'string' ? principalOf(who) : who;
  if (!canSeeDashboardCard('timeline', principal)) return [];
  if (can(principal, 'activity.view')) return null; // sees every event
  if (canSeeDashboardCard('timelineOfficeEvents', principal)) {
    return [...FORECOURT_ACTIVITY_EVENTS, ...STAFF_HIDDEN_ACTIVITY_EVENTS];
  }
  return FORECOURT_ACTIVITY_EVENTS;
}

/**
 * The half-open UTC interval `[from, to)` of one Business Day: it starts at the
 * station's Day Start on `businessDate` (station-local) and runs to the next
 * Day Start.
 */
export function businessDayWindow(
  businessDate: string,
  clock: { timeZone: string; businessDayStartsAt: string },
): { from: Date; to: Date } {
  const w = sharedBusinessDayWindow(businessDate, {
    timeZone: clock.timeZone,
    dayStartsAt: clock.businessDayStartsAt,
  });
  return { from: new Date(w.from), to: new Date(w.to) };
}

/**
 * The half-open UTC interval of one station-timezone calendar day: where Office
 * Record events of `entryDate` sit. Same as a Business Day window with Day Start
 * 00:00, so an office entry at 02:00 belongs to its own calendar date even when
 * the Day Start is 06:00.
 */
export function entryDateWindow(
  entryDate: string,
  clock: { timeZone: string },
): { from: Date; to: Date } {
  return businessDayWindow(entryDate, { timeZone: clock.timeZone, businessDayStartsAt: '00:00' });
}
