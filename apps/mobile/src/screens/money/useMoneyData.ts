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
import { businessDateSettings, resolveBusinessDate, type Station } from '@pump/shared';
import type { CustomerReceivable, SupplierPayable } from '@pump/shared';
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
 * The statement window: the last `months` calendar months up to the open end.
 * The start is the first of a month, so the query key is stable until the month
 * rolls over. Shared by the customer and supplier statements.
 */
function useStatementRange(station: Station | null | undefined, months: number) {
  const { timeZone, dayStartsAt } = businessDateSettings(station?.settings);
  const now = useNow(60 * 60_000);
  const today = resolveBusinessDate({ now: new Date(now), timeZone, dayStartsAt });
  return { from: statementWindowStart(today, months), to: STATEMENT_END };
}

/**
 * A customer's statement over the last `months` calendar months (the ranged
 * ledger: server opening balance, enriched rows).
 */
export function useCustomerStatementData(
  customerId: string,
  station: Station | null | undefined,
  months: number,
) {
  const { from, to } = useStatementRange(station, months);
  const q = useCustomerStatement(customerId, { from, to });
  return {
    from,
    ledger: q.data ?? null,
    isLoading: q.isLoading,
    /** A wider window is on its way; `ledger` still holds the previous one. */
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

/** A supplier's statement over the last `months` calendar months, like the customer's. */
export function useSupplierStatementData(
  supplierId: string,
  station: Station | null | undefined,
  months: number,
) {
  const { from, to } = useStatementRange(station, months);
  const q = useSupplierStatement(supplierId, { from, to });
  return {
    from,
    ledger: q.data ?? null,
    isLoading: q.isLoading,
    /** A wider window is on its way; `ledger` still holds the previous one. */
    isFetchingMore: q.isPlaceholderData,
    isError: q.isError,
    refetch: q.refetch,
  };
}
