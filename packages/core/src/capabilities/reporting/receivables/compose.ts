import {
  RECEIVABLES_MIN_SETTLED_SALES,
  round2,
  type CustomerReceivable,
  type CustomerReceivableSummary,
  type ReceivablesAging,
  type ReceivablesSummary,
} from '@pump/shared';
import { ageInDays } from '../age.js';
import type { CustomerReceivableSource, ReceivableSourceRow, ReceivablesSource } from './ports.js';

const roundAging = (a: ReceivablesAging): ReceivablesAging => ({
  d0_7: round2(a.d0_7),
  d8_30: round2(a.d8_30),
  d30plus: round2(a.d30plus),
});

function composeRow(row: ReceivableSourceRow, currentBusinessDate: string): CustomerReceivable {
  return {
    customerId: row.customerId,
    balance: round2(row.balance),
    oldestUnpaidDate: row.oldestUnpaidDate,
    oldestUnpaidDays: row.oldestUnpaidDate
      ? ageInDays(row.oldestUnpaidDate, currentBusinessDate)
      : null,
    aging: roundAging(row.aging),
  };
}

export function composeReceivables(
  source: ReceivablesSource,
  currentBusinessDate: string,
): ReceivablesSummary {
  const aging = roundAging(source.aging);
  return {
    total: round2(aging.d0_7 + aging.d8_30 + aging.d30plus),
    customerCount: source.customerCount,
    aging,
    customers: source.customers.map((row) => composeRow(row, currentBusinessDate)),
  };
}

/**
 * "Usually pays in N days": the mean over their last settled Credit Sales,
 * shown only once there are enough of them to say anything. Whole days.
 */
export function usuallyPaysInDays(settled: { count: number; meanDays: number }): number | null {
  return settled.count >= RECEIVABLES_MIN_SETTLED_SALES ? Math.round(settled.meanDays) : null;
}

/**
 * `currentEntryDate` is today's Entry Date (station calendar date, no Day
 * Start): a Collection is an Office Record dated by it, so "last payment N days
 * ago" is measured between two Entry Dates. Open debits are Business-Day dated
 * and age against the Current Business Date.
 */
export function composeCustomerReceivable(
  source: CustomerReceivableSource,
  currentBusinessDate: string,
  currentEntryDate: string,
): CustomerReceivableSummary {
  const { lastPayment, month } = source;
  return {
    ...composeRow(source.receivable, currentBusinessDate),
    settlementCycle: source.settlementCycle,
    lastPayment: lastPayment
      ? {
          amount: round2(lastPayment.amount),
          entryDate: lastPayment.entryDate,
          method: lastPayment.method,
          daysAgo: ageInDays(lastPayment.entryDate, currentEntryDate),
        }
      : null,
    usuallyPaysInDays: usuallyPaysInDays(source.settled),
    month: {
      credit: round2(month.credit),
      slips: month.slips,
      litres: round2(month.litres),
      paid: round2(month.paid),
    },
    vehicles: source.vehicles.map((v) => ({
      ...v,
      amount: round2(v.amount),
      litres: round2(v.litres),
    })),
  };
}
