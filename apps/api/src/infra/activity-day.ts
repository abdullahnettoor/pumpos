import { BusinessEvents } from '@pump/core';
import { shiftBusinessDate, type Role } from '@pump/shared';

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
  E.FUEL_RECEIVED,
  E.TANK_DIP_RECORDED,
  E.TANK_TRANSFER_COMPLETED,
  E.DENSITY_RECORDED,
  E.INVENTORY_ADJUSTED,
  E.PHYSICAL_COUNT_COMPLETED,
  E.VARIANCE_RECORDED,
];

/** Office Records (entry-date world) added for Manager and Accountant. */
export const OFFICE_ACTIVITY_EVENTS: readonly string[] = [
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

/** Event types a role may read through the dated feed; Owner gets everything. */
export function dashboardEventTypesForRole(role: Role): readonly string[] | null {
  if (role === 'Owner') return null;
  if (role === 'Manager' || role === 'Accountant') {
    return [...FORECOURT_ACTIVITY_EVENTS, ...OFFICE_ACTIVITY_EVENTS];
  }
  if (role === 'Staff') return FORECOURT_ACTIVITY_EVENTS;
  return [];
}

function zoneOffsetMs(instant: number, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
      .formatToParts(new Date(instant))
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - instant;
}

function localToInstant(date: string, hhmm: string, timeZone: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = hhmm.split(':').map((n) => Number(n) || 0);
  const wall = Date.UTC(y, m - 1, d, h, min);
  let instant = wall - zoneOffsetMs(wall, timeZone);
  instant = wall - zoneOffsetMs(instant, timeZone);
  return new Date(instant);
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
  return {
    from: localToInstant(businessDate, clock.businessDayStartsAt, clock.timeZone),
    to: localToInstant(
      shiftBusinessDate(businessDate, 1),
      clock.businessDayStartsAt,
      clock.timeZone,
    ),
  };
}
