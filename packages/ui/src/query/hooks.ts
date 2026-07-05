import { useQueryClient, useQuery, type UseQueryOptions } from '@tanstack/react-query';
import {
  CloudShiftService,
  CloudTransactionService,
  CloudProductService,
  CloudTankService,
  CloudStationService,
  CloudDispenserService,
  CloudNozzleService,
  CloudUserAssignmentService,
  CloudShiftTemplateService,
  CloudPricingService,
  CloudOrganizationService,
  CloudEventsService,
  CloudFinanceService,
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
const stationSvc = new CloudStationService();
const dispenserSvc = new CloudDispenserService();
const nozzleSvc = new CloudNozzleService();
const userSvc = new CloudUserAssignmentService();
const templateSvc = new CloudShiftTemplateService();
const pricingSvc = new CloudPricingService();
const orgSvc = new CloudOrganizationService();
const eventsSvc = new CloudEventsService();
const financeSvc = new CloudFinanceService();

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
  stations: () => ['stations'] as const,
  dispensers: (stationId: string) => ['dispensers', stationId] as const,
  nozzles: (stationId: string) => ['nozzles', stationId] as const,
  users: () => ['users'] as const,
  shiftTemplates: () => ['shift-templates'] as const,
  pricing: (stationId: string) => ['pricing', stationId] as const,
  organization: () => ['organization'] as const,
  events: (stationId: string, type: string) => ['events', stationId, type] as const,
  moneyMovements: (stationId: string, from: string, to: string) => ['money-movements', stationId, from, to] as const,
  invoices: (stationId: string, from: string, to: string) => ['invoices', stationId, from, to] as const,
  sales: (stationId: string, from: string, to: string) => ['sales', stationId, from, to] as const,
  financialAccounts: (stationId: string) => ['financial-accounts', stationId] as const,
  accountLedger: (accountId: string, from: string, to: string) => ['account-ledger', accountId, from, to] as const,
  financeMovements: (stationId: string, from: string, to: string) => ['finance-movements', stationId, from, to] as const,
} as const;

type Options<T> = Omit<UseQueryOptions<T, Error, T, readonly unknown[]>, 'queryKey' | 'queryFn'>;

/**
 * Cache policy tiered by how often the data changes (Phase P):
 *  - static: infrastructure (tanks/DUs/nozzles/terminals/templates) — rarely edited.
 *  - semi: master data (products/customers/suppliers/categories) — changes occasionally.
 *  - operational: live shift/sales/inventory — changes constantly.
 * Hooks spread the tier BEFORE caller options so callers can still override.
 */
export const TIER = {
  static: { staleTime: 24 * 60 * 60_000, gcTime: 24 * 60 * 60_000, refetchOnWindowFocus: false } as const,
  semi: { staleTime: 10 * 60_000, gcTime: 60 * 60_000, refetchOnWindowFocus: false } as const,
  operational: { staleTime: 15_000, gcTime: 5 * 60_000, refetchOnWindowFocus: true } as const,
};

export function useProducts(options?: Options<any[]>) {
  return useQuery({ queryKey: queryKeys.products(), queryFn: () => productSvc.listProducts(), ...TIER.semi, ...options });
}

export function useStations(options?: Options<any[]>) {
  return useQuery({ queryKey: queryKeys.stations(), queryFn: () => stationSvc.getStations(), ...TIER.static, ...options });
}

export function useUsers(options?: Options<any[]>) {
  return useQuery({ queryKey: queryKeys.users(), queryFn: () => userSvc.listUsers(), ...TIER.static, ...options });
}

export function useDispensers(stationId: string | null | undefined, options?: Options<any[]>) {
  return useQuery({
    queryKey: queryKeys.dispensers(stationId ?? ''),
    queryFn: () => dispenserSvc.listDispensers(stationId!),
    enabled: !!stationId,
    ...TIER.static,
    ...options,
  });
}

export function useNozzles(stationId: string | null | undefined, options?: Options<any[]>) {
  return useQuery({
    queryKey: queryKeys.nozzles(stationId ?? ''),
    queryFn: () => nozzleSvc.listNozzles(stationId!),
    enabled: !!stationId,
    ...TIER.static,
    ...options,
  });
}

export function useShiftTemplates(options?: Options<any[]>) {
  return useQuery({ queryKey: queryKeys.shiftTemplates(), queryFn: () => templateSvc.listTemplates(), ...TIER.static, ...options });
}

export function usePricing(stationId: string | null | undefined, options?: Options<any[]>) {
  return useQuery({
    queryKey: queryKeys.pricing(stationId ?? ''),
    queryFn: () => pricingSvc.getPricing(stationId!),
    enabled: !!stationId,
    ...TIER.semi,
    ...options,
  });
}

export function useOrganization(options?: Options<any>) {
  return useQuery({ queryKey: queryKeys.organization(), queryFn: () => orgSvc.getOrganization(), ...TIER.static, ...options });
}

export function useEvents(params?: { stationId?: string; type?: string; limit?: number }, options?: Options<any[]>) {
  return useQuery({
    queryKey: queryKeys.events(params?.stationId ?? '', params?.type ?? ''),
    queryFn: () => eventsSvc.getEvents(params),
    ...TIER.operational,
    ...options,
  });
}

export function useMoneyMovements(params: { stationId?: string | null; from?: string; to?: string }, options?: Options<any[]>) {
  return useQuery({
    queryKey: queryKeys.moneyMovements(params.stationId ?? '', params.from ?? '', params.to ?? ''),
    queryFn: () => txService.getMoneyMovements({ stationId: params.stationId!, from: params.from, to: params.to }),
    enabled: !!params.stationId,
    ...TIER.operational,
    ...options,
  });
}

export function useInvoices(params: { stationId?: string | null; from?: string; to?: string }, options?: Options<any[]>) {
  return useQuery({
    queryKey: queryKeys.invoices(params.stationId ?? '', params.from ?? '', params.to ?? ''),
    queryFn: () => txService.getInvoices({ stationId: params.stationId ?? undefined, from: params.from, to: params.to }),
    enabled: !!params.stationId,
    ...TIER.operational,
    ...options,
  });
}

export function useSales(params: { stationId?: string | null; from?: string; to?: string }, options?: Options<any[]>) {
  return useQuery({
    queryKey: queryKeys.sales(params.stationId ?? '', params.from ?? '', params.to ?? ''),
    queryFn: () => txService.getSales({ stationId: params.stationId!, from: params.from, to: params.to }),
    enabled: !!params.stationId,
    ...TIER.operational,
    ...options,
  });
}

export function useFinancialAccounts(stationId: string | null | undefined, options?: Options<any[]>) {
  return useQuery({
    queryKey: queryKeys.financialAccounts(stationId ?? ''),
    queryFn: () => financeSvc.listAccounts(stationId ?? undefined),
    ...TIER.operational,
    ...options,
  });
}

export function useAccountLedger(accountId: string | null | undefined, params?: { from?: string; to?: string }, options?: Options<any>) {
  return useQuery({
    queryKey: queryKeys.accountLedger(accountId ?? '', params?.from ?? '', params?.to ?? ''),
    queryFn: () => financeSvc.getAccountLedger(accountId!, params?.from, params?.to),
    enabled: !!accountId,
    ...TIER.operational,
    ...options,
  });
}

export function useFinanceMovements(params: { stationId?: string | null; from?: string; to?: string }, options?: Options<any[]>) {
  return useQuery({
    queryKey: queryKeys.financeMovements(params.stationId ?? '', params.from ?? '', params.to ?? ''),
    queryFn: () => financeSvc.getMovements({ stationId: params.stationId!, from: params.from, to: params.to }),
    enabled: !!params.stationId,
    ...TIER.operational,
    ...options,
  });
}

export function useTanks(stationId: string | null | undefined, options?: Options<any[]>) {
  return useQuery({
    queryKey: queryKeys.tanks(stationId ?? ''),
    queryFn: () => tankSvc.listTanks(stationId!),
    enabled: !!stationId,
    ...TIER.static,
    ...options,
  });
}


export function useShiftStatus(stationId: string | null | undefined, lite = false, options?: Options<any>) {
  return useQuery({
    queryKey: queryKeys.shiftStatus(stationId ?? '', lite),
    queryFn: () => shiftService.getShiftStatus(stationId!, lite),
    enabled: !!stationId,
    ...TIER.operational,
    ...options,
  });
}

export function useShiftSummaries(stationId: string | null | undefined, options?: Options<any[]>) {
  return useQuery({
    queryKey: queryKeys.shiftSummaries(stationId ?? ''),
    queryFn: () => shiftService.getShiftSummaries(stationId!),
    enabled: !!stationId,
    ...TIER.operational,
    ...options,
  });
}

export function useExpenses(options?: Options<any[]>) {
  return useQuery({ queryKey: queryKeys.expenses(), queryFn: () => txService.getExpenses(), ...TIER.operational, ...options });
}

export function usePurchases(options?: Options<any[]>) {
  return useQuery({ queryKey: queryKeys.purchases(), queryFn: () => txService.getPurchases(), ...TIER.operational, ...options });
}

export function useCollections(options?: Options<any[]>) {
  return useQuery({ queryKey: queryKeys.collections(), queryFn: () => txService.getCollections(), ...TIER.operational, ...options });
}

export function useCustomers(activeOnly = true, options?: Options<any[]>) {
  return useQuery({ queryKey: queryKeys.customers(activeOnly), queryFn: () => txService.getCustomers(activeOnly), ...TIER.semi, ...options });
}

export function useSuppliers(activeOnly = true, options?: Options<any[]>) {
  return useQuery({ queryKey: queryKeys.suppliers(activeOnly), queryFn: () => txService.getSuppliers(activeOnly), ...TIER.semi, ...options });
}

export function useCustomerLedger(customerId: string | null | undefined, options?: Options<any[]>) {
  return useQuery({
    queryKey: queryKeys.customerLedger(customerId ?? ''),
    queryFn: () => txService.getCustomerLedger(customerId!),
    enabled: !!customerId,
    ...TIER.operational,
    ...options,
  });
}

export function useSupplierLedger(supplierId: string | null | undefined, options?: Options<any[]>) {
  return useQuery({
    queryKey: queryKeys.supplierLedger(supplierId ?? ''),
    queryFn: () => txService.getSupplierLedger(supplierId!),
    enabled: !!supplierId,
    ...TIER.operational,
    ...options,
  });
}

export function useExpenseCategories(options?: Options<any[]>) {
  return useQuery({ queryKey: queryKeys.expenseCategories(), queryFn: () => txService.getExpenseCategories(), ...TIER.semi, ...options });
}

export function useInventoryStatus(stationId: string | null | undefined, options?: Options<any[]>) {
  return useQuery({
    queryKey: queryKeys.inventoryStatus(stationId ?? ''),
    queryFn: () => txService.getInventoryStatus(stationId!),
    enabled: !!stationId,
    ...TIER.operational,
    ...options,
  });
}

export function useInventoryItems(stationId: string | null | undefined, options?: Options<any[]>) {
  return useQuery({
    queryKey: queryKeys.inventoryItems(stationId ?? ''),
    queryFn: () => txService.getInventoryItems(stationId!),
    enabled: !!stationId,
    ...TIER.operational,
    ...options,
  });
}

export function useInventoryMovements(stationId: string | null | undefined, options?: Options<any[]>) {
  return useQuery({
    queryKey: queryKeys.inventoryMovements(stationId ?? ''),
    queryFn: () => txService.getInventoryMovements(stationId!),
    enabled: !!stationId,
    ...TIER.operational,
    ...options,
  });
}

export function useInventoryVariances(stationId: string | null | undefined, options?: Options<any[]>) {
  return useQuery({
    queryKey: queryKeys.inventoryVariances(stationId ?? ''),
    queryFn: () => txService.getInventoryVariances(stationId!),
    enabled: !!stationId,
    ...TIER.operational,
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
    // Suppliers carry computed payable balances that move with purchases/payments,
    // and new suppliers are created from PurchasesList — keep them fresh too.
    qc.invalidateQueries({ queryKey: ['suppliers'] });
    if (stationId) {
      qc.invalidateQueries({ queryKey: ['inventory-status', stationId] });
      qc.invalidateQueries({ queryKey: ['inventory-items', stationId] });
      qc.invalidateQueries({ queryKey: ['inventory-movements', stationId] });
      qc.invalidateQueries({ queryKey: ['inventory-variances', stationId] });
    }
  };
}
