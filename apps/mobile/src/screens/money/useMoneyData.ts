import { useMemo } from 'react';
import {
  useCustomerReceivable,
  useCustomerStatement,
  useCustomers,
  useReceivables,
  useSuppliers,
} from '@pump/ui';
import { businessDateSettings, resolveBusinessDate, type Station } from '@pump/shared';
import type { CustomerReceivable } from '@pump/shared';
import type { MoneyCustomer, MoneySupplier } from '../../lib/money/parties.js';
import { STATEMENT_END, statementWindowStart } from '../../lib/money/statement.js';
import { useNow } from '../../lib/useNow.js';

/**
 * The only place the Money tab's queries are read: the customers and suppliers
 * lists (semi tier, shared with the rest of the app, invalidated by
 * `useInvalidateOperational` whenever a balance moves) and the receivables
 * summary and statement (operational tier). The lists' `currentBalance` is
 * already Σ credit sales − Σ collections (customers) and Σ purchases − Σ
 * payments (suppliers), so no ledger is fetched for them.
 */
export function useCustomersData() {
  const q = useCustomers();
  return { customers: (q.data ?? []) as MoneyCustomer[], isLoading: q.isLoading };
}

export function useSuppliersData() {
  const q = useSuppliers();
  return { suppliers: (q.data ?? []) as MoneySupplier[], isLoading: q.isLoading };
}

/**
 * What customers owe: the aging split and, per customer, the oldest unpaid
 * date. Settled FIFO by the server in one statement; there is no summary
 * without a Station (the aging is measured with its clock), so the Money list
 * then shows its plain balances.
 */
export function useReceivablesData(stationId: string | null | undefined) {
  const q = useReceivables(stationId);
  const summary = q.data ?? null;
  const byCustomer = useMemo(
    () =>
      new Map<string, CustomerReceivable>((summary?.customers ?? []).map((c) => [c.customerId, c])),
    [summary],
  );
  return { summary, byCustomer, isLoading: q.isLoading, isError: q.isError };
}

/** One customer's receivable, last payment, usually-pays-in, this month and vehicles. */
export function useCustomerReceivableData(
  stationId: string | null | undefined,
  customerId: string | null | undefined,
) {
  const q = useCustomerReceivable(stationId, customerId);
  return { summary: q.data ?? null, isLoading: q.isLoading, isError: q.isError };
}

/**
 * A customer's statement over the last `months` calendar months (the ranged
 * ledger: server opening balance, enriched rows). The window start is the first
 * of a month, so the key is stable until the month rolls over.
 */
export function useCustomerStatementData(
  customerId: string,
  station: Station | null | undefined,
  months: number,
) {
  const { timeZone, dayStartsAt } = businessDateSettings(station?.settings);
  const now = useNow(60 * 60_000);
  const today = resolveBusinessDate({ now: new Date(now), timeZone, dayStartsAt });
  const from = statementWindowStart(today, months);
  const q = useCustomerStatement(customerId, { from, to: STATEMENT_END });
  return {
    from,
    ledger: q.data ?? null,
    isLoading: q.isLoading,
    isError: q.isError,
    refetch: q.refetch,
  };
}
