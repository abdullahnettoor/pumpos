import { useQueryClient, useQuery, type UseQueryOptions } from '@tanstack/react-query';
import {
  CloudShiftService,
  CloudTransactionService,
  CloudProductService,
  CloudTankService,
} from '../services/cloud.js';

/**
 * Centralised query hooks. These replace the hand-rolled
 * useState+useEffect+fetch loops that were duplicated across every screen.
 * One cache, one source of truth — e.g. the shift status (previously refetched
 * independently by Dashboard, Expenses, Purchases and Customers) is now a single
 * cached entry keyed by station.
 */

const shiftService = new CloudShiftService();
const txService = new CloudTransactionService();
const productSvc = new CloudProductService();
const tankSvc = new CloudTankService();

export const queryKeys = {
  shiftStatus: (stationId: string, lite = false) => ['shift-status', stationId, lite] as const,
  shiftSummaries: (stationId: string) => ['shift-summaries', stationId] as const,
  expenses: () => ['expenses'] as const,
  purchases: () => ['purchases'] as const,
  collections: () => ['collections'] as const,
  customers: (activeOnly = true) => ['customers', activeOnly] as const,
  suppliers: (activeOnly = true) => ['suppliers', activeOnly] as const,
  customerLedger: (customerId: string) => ['customer-ledger', customerId] as const,
  supplierLedger: (supplierId: string) => ['supplier-ledger', supplierId] as const,
  inventoryStatus: (stationId: string) => ['inventory-status', stationId] as const,
  inventoryItems: (stationId: string) => ['inventory-items', stationId] as const,
  inventoryMovements: (stationId: string) => ['inventory-movements', stationId] as const,
  inventoryVariances: (stationId: string) => ['inventory-variances', stationId] as const,
  dssr: (stationId: string, date: string) => ['dssr', stationId, date] as const,
  dssrRange: (stationId: string, from: string, to: string) => ['dssr-range', stationId, from, to] as const,
  expenseCategories: () => ['expense-categories'] as const,
  products: () => ['products'] as const,
  tanks: (stationId: string) => ['tanks', stationId] as const,
} as const;

type Options<T> = Omit<UseQueryOptions<T, Error, T, readonly unknown[]>, 'queryKey' | 'queryFn'>;

export function useProducts(options?: Options<any[]>) {
  return useQuery({ queryKey: queryKeys.products(), queryFn: () => productSvc.listProducts(), ...options });
}

export function useTanks(stationId: string | null | undefined, options?: Options<any[]>) {
  return useQuery({
    queryKey: queryKeys.tanks(stationId ?? ''),
    queryFn: () => tankSvc.listTanks(stationId!),
    enabled: !!stationId,
    ...options,
  });
}


export function useShiftStatus(stationId: string | null | undefined, lite = false, options?: Options<any>) {
  return useQuery({
    queryKey: queryKeys.shiftStatus(stationId ?? '', lite),
    queryFn: () => shiftService.getShiftStatus(stationId!, lite),
    enabled: !!stationId,
    ...options,
  });
}

export function useShiftSummaries(stationId: string | null | undefined, options?: Options<any[]>) {
  return useQuery({
    queryKey: queryKeys.shiftSummaries(stationId ?? ''),
    queryFn: () => shiftService.getShiftSummaries(stationId!),
    enabled: !!stationId,
    ...options,
  });
}

export function useExpenses(options?: Options<any[]>) {
  return useQuery({ queryKey: queryKeys.expenses(), queryFn: () => txService.getExpenses(), ...options });
}

export function usePurchases(options?: Options<any[]>) {
  return useQuery({ queryKey: queryKeys.purchases(), queryFn: () => txService.getPurchases(), ...options });
}

export function useCollections(options?: Options<any[]>) {
  return useQuery({ queryKey: queryKeys.collections(), queryFn: () => txService.getCollections(), ...options });
}

export function useCustomers(activeOnly = true, options?: Options<any[]>) {
  return useQuery({ queryKey: queryKeys.customers(activeOnly), queryFn: () => txService.getCustomers(activeOnly), ...options });
}

export function useSuppliers(activeOnly = true, options?: Options<any[]>) {
  return useQuery({ queryKey: queryKeys.suppliers(activeOnly), queryFn: () => txService.getSuppliers(activeOnly), ...options });
}

export function useExpenseCategories(options?: Options<any[]>) {
  return useQuery({ queryKey: queryKeys.expenseCategories(), queryFn: () => txService.getExpenseCategories(), ...options });
}

export function useInventoryStatus(stationId: string | null | undefined, options?: Options<any[]>) {
  return useQuery({
    queryKey: queryKeys.inventoryStatus(stationId ?? ''),
    queryFn: () => txService.getInventoryStatus(stationId!),
    enabled: !!stationId,
    ...options,
  });
}

export function useInventoryItems(stationId: string | null | undefined, options?: Options<any[]>) {
  return useQuery({
    queryKey: queryKeys.inventoryItems(stationId ?? ''),
    queryFn: () => txService.getInventoryItems(stationId!),
    enabled: !!stationId,
    ...options,
  });
}

export function useInventoryMovements(stationId: string | null | undefined, options?: Options<any[]>) {
  return useQuery({
    queryKey: queryKeys.inventoryMovements(stationId ?? ''),
    queryFn: () => txService.getInventoryMovements(stationId!),
    enabled: !!stationId,
    ...options,
  });
}

export function useInventoryVariances(stationId: string | null | undefined, options?: Options<any[]>) {
  return useQuery({
    queryKey: queryKeys.inventoryVariances(stationId ?? ''),
    queryFn: () => txService.getInventoryVariances(stationId!),
    enabled: !!stationId,
    ...options,
  });
}

export function useDailyDssr(stationId: string | null | undefined, date: string, options?: Options<any>) {
  return useQuery({
    queryKey: queryKeys.dssr(stationId ?? '', date),
    queryFn: () => shiftService.getDailyDssr(stationId!, date),
    enabled: !!stationId && !!date,
    ...options,
  });
}

export function useDailyDssrRange(stationId: string | null | undefined, from: string, to: string, options?: Options<any[]>) {
  return useQuery({
    queryKey: queryKeys.dssrRange(stationId ?? '', from, to),
    queryFn: () => shiftService.getDailyDssrRange(stationId!, from, to),
    enabled: !!stationId && !!from && !!to,
    ...options,
  });
}

/**
 * Returns a callback that invalidates the operational caches for a station after
 * a mutation (open/close shift, record expense/collection/etc.) so screens stay
 * fresh without manual refetch wiring.
 */
export function useInvalidateOperational() {
  const qc = useQueryClient();
  return (stationId?: string | null) => {
    qc.invalidateQueries({ queryKey: ['shift-status'] });
    qc.invalidateQueries({ queryKey: ['shift-summaries'] });
    qc.invalidateQueries({ queryKey: ['expenses'] });
    qc.invalidateQueries({ queryKey: ['purchases'] });
    qc.invalidateQueries({ queryKey: ['collections'] });
    qc.invalidateQueries({ queryKey: ['customers'] });
    if (stationId) {
      qc.invalidateQueries({ queryKey: ['inventory-status', stationId] });
      qc.invalidateQueries({ queryKey: ['inventory-items', stationId] });
      qc.invalidateQueries({ queryKey: ['inventory-movements', stationId] });
      qc.invalidateQueries({ queryKey: ['inventory-variances', stationId] });
    }
  };
}
