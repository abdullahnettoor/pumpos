import { useCustomers, useSuppliers } from '@pump/ui';
import type { MoneyCustomer, MoneySupplier } from '../../lib/money/parties.js';

/**
 * The only place the Money tab's queries are read: the customers and suppliers
 * lists (semi tier, shared with the rest of the app, invalidated by
 * `useInvalidateOperational` whenever a balance moves). Their `currentBalance`
 * is already Σ credit sales − Σ collections (customers) and Σ purchases − Σ
 * payments (suppliers), so no ledger is fetched for the lists.
 *
 * Seam for #398 (receivables summary): the aging buckets, oldest-due and last
 * payment per customer arrive as extra fields on this same read; derive from
 * them here, not in the row components.
 */
export function useCustomersData() {
  const q = useCustomers();
  return { customers: (q.data ?? []) as MoneyCustomer[], isLoading: q.isLoading };
}

export function useSuppliersData() {
  const q = useSuppliers();
  return { suppliers: (q.data ?? []) as MoneySupplier[], isLoading: q.isLoading };
}
