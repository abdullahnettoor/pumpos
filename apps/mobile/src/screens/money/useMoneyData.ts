import { useMemo } from 'react';
import {
  useCustomerReceivable,
  useCustomerStatement,
  useCustomers,
  usePayables,
  useReceivables,
  useSupplierPayable,
  useSupplierStatement,
  useSuppliers,
} from '@pump/ui';
import type { CustomerReceivable, SupplierPayable } from '@pump/shared';
import type { MoneyCustomer, MoneySupplier } from '../../lib/money/parties.js';
import type { DateRange } from '../../lib/money/statementRange.js';

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
 * A customer's statement over a date range (the ranged ledger: server opening
 * balance, enriched rows).
 */
export function useCustomerStatementData(customerId: string, range: DateRange) {
  const q = useCustomerStatement(customerId, range);
  return {
    ledger: q.data ?? null,
    isLoading: q.isLoading,
    /** A window reaching further back is on its way; `ledger` still holds the previous one. */
    isFetchingMore: q.isPlaceholderData,
    isError: q.isError,
    refetch: q.refetch,
  };
}

/**
 * What suppliers are owed: this month's purchased vs paid and, per supplier,
 * how many Purchases are unpaid and since when. Settled FIFO by the server in one
 * statement; there is no summary without a Station (the month and age are
 * measured with its clock), so the To pay list then shows its plain balances.
 */
export function usePayablesData(stationId: string | null | undefined) {
  const q = usePayables(stationId);
  const summary = q.data ?? null;
  const bySupplier = useMemo(
    () =>
      new Map<string, SupplierPayable>((summary?.suppliers ?? []).map((s) => [s.supplierId, s])),
    [summary],
  );
  return { summary, bySupplier, isLoading: q.isLoading, isError: q.isError };
}

/** One supplier's payable, last payment, this month and purchases by product. */
export function useSupplierPayableData(
  stationId: string | null | undefined,
  supplierId: string | null | undefined,
) {
  const q = useSupplierPayable(stationId, supplierId);
  return { summary: q.data ?? null, isLoading: q.isLoading, isError: q.isError };
}

/** A supplier's statement over a date range, like the customer's. */
export function useSupplierStatementData(supplierId: string, range: DateRange) {
  const q = useSupplierStatement(supplierId, range);
  return {
    ledger: q.data ?? null,
    isLoading: q.isLoading,
    /** A window reaching further back is on its way; `ledger` still holds the previous one. */
    isFetchingMore: q.isPlaceholderData,
    isError: q.isError,
    refetch: q.refetch,
  };
}
