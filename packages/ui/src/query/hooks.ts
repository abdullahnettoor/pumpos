import {
  useQueryClient,
  useQuery,
  useInfiniteQuery,
  type UseQueryOptions,
} from '@tanstack/react-query';
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
  CloudPaymentTerminalService,
  CloudAccessService,
} from '../services/cloud.js';
import type { AccessDocument } from '@pump/shared';

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
const terminalSvc = new CloudPaymentTerminalService();
const accessSvc = new CloudAccessService();

export const queryKeys = {
  shiftStatus: (stationId: string, lite = false) => ['shift-status', stationId, lite] as const,
  // Prefix keys for station-wide invalidation (TanStack matches by prefix).
  shiftStatusPrefix: (stationId: string) => ['shift-status', stationId] as const,
  dssrPreviewPrefix: (stationId: string) => ['dssr-preview', stationId] as const,
  activityGroupsPrefix: (stationId: string) => ['activity-groups', stationId] as const,
  businessDayStatus: (stationId: string, businessDate = '') =>
    ['business-day-status', stationId, businessDate] as const,
  businessDayStatusPrefix: (stationId: string) => ['business-day-status', stationId] as const,
  myAssignment: () => ['my-assignment'] as const,
  shiftSummaries: (stationId: string) => ['shift-summaries', stationId] as const,
  dashboardSummary: (stationId: string) => ['dashboard-summary', stationId] as const,
  shiftTransactions: (shiftId: string) => ['shift-transactions', shiftId] as const,
  merchandiseHandovers: (shiftId: string) => ['merchandise-handovers', shiftId] as const,
  merchandiseSales: (shiftId: string) => ['merchandise-sales', shiftId] as const,
  expenses: () => ['expenses'] as const,
  income: (stationId = '', from = '', to = '') => ['income', stationId, from, to] as const,
  purchases: () => ['purchases'] as const,
  collections: () => ['collections'] as const,
  creditSales: () => ['credit-sales'] as const,
  vehicles: (activeOnly = false) => ['vehicles', activeOnly] as const,
  customers: (activeOnly = true) => ['customers', activeOnly] as const,
  suppliers: (activeOnly = true) => ['suppliers', activeOnly] as const,
  customerLedger: (customerId: string) => ['customer-ledger', customerId] as const,
  supplierLedger: (supplierId: string) => ['supplier-ledger', supplierId] as const,
  inventoryStatus: (stationId: string) => ['inventory-status', stationId] as const,
  inventoryItems: (stationId: string) => ['inventory-items', stationId] as const,
  inventoryMovements: (stationId: string) => ['inventory-movements', stationId] as const,
  inventoryVariances: (stationId: string) => ['inventory-variances', stationId] as const,
  dssr: (stationId: string, date: string) => ['dssr', stationId, date] as const,
  dssrPreview: (stationId: string, date: string) => ['dssr-preview', stationId, date] as const,
  dssrRange: (stationId: string, from: string, to: string) =>
    ['dssr-range', stationId, from, to] as const,
  expenseCategories: () => ['expense-categories'] as const,
  incomeCategories: () => ['income-categories'] as const,
  products: () => ['products'] as const,
  tanks: (stationId: string) => ['tanks', stationId] as const,
  stations: () => ['stations'] as const,
  dispensers: (stationId: string) => ['dispensers', stationId] as const,
  nozzles: (stationId: string) => ['nozzles', stationId] as const,
  users: () => ['users'] as const,
  shiftTemplates: () => ['shift-templates'] as const,
  paymentTerminals: (stationId: string) => ['payment-terminals', stationId] as const,
  pricing: (stationId: string) => ['pricing', stationId] as const,
  pricingHistory: (stationId: string) => ['pricing-history', stationId] as const,
  organization: () => ['organization'] as const,
  access: () => ['access'] as const,
  activityGroups: (stationId: string, type: string, limit: number) =>
    ['activity-groups', stationId, type, limit] as const,
  activityGroup: (groupId: string) => ['activity-group', groupId] as const,
  moneyMovements: (stationId: string, from: string, to: string) =>
    ['money-movements', stationId, from, to] as const,
  invoices: (stationId: string, from: string, to: string) =>
    ['invoices', stationId, from, to] as const,
  sales: (stationId: string, from: string, to: string) => ['sales', stationId, from, to] as const,
  salesTaxRegister: (stationId: string, from: string, to: string) =>
    ['sales-tax-register', stationId, from, to] as const,
  purchaseGstRegister: (from: string, to: string) => ['purchase-gst-register', from, to] as const,
  incomeGstRegister: (stationId: string, from: string, to: string) =>
    ['income-gst-register', stationId, from, to] as const,
  financialAccounts: (stationId: string) => ['financial-accounts', stationId] as const,
  accountLedger: (accountId: string, from: string, to: string) =>
    ['account-ledger', accountId, from, to] as const,
  financeMovements: (stationId: string, from: string, to: string) =>
    ['finance-movements', stationId, from, to] as const,
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
  static: {
    staleTime: 24 * 60 * 60_000,
    gcTime: 24 * 60 * 60_000,
    refetchOnWindowFocus: false,
  } as const,
  semi: { staleTime: 10 * 60_000, gcTime: 60 * 60_000, refetchOnWindowFocus: false } as const,
  operational: { staleTime: 15_000, gcTime: 5 * 60_000, refetchOnWindowFocus: true } as const,
};

export const stationsQueryOptions = () => ({
  queryKey: queryKeys.stations(),
  queryFn: () => stationSvc.getStations(),
  ...TIER.static,
});

export const onboardingProvisionedQueryKeys = (stationId: string) => [
  queryKeys.stations(),
  queryKeys.users(),
  queryKeys.products(),
  queryKeys.tanks(stationId),
  queryKeys.dispensers(stationId),
  queryKeys.nozzles(stationId),
  queryKeys.shiftTemplates(),
  queryKeys.paymentTerminals(stationId),
  queryKeys.pricing(stationId),
  queryKeys.financialAccounts(stationId),
  queryKeys.businessDayStatusPrefix(stationId),
  queryKeys.inventoryStatus(stationId),
  queryKeys.inventoryItems(stationId),
  queryKeys.inventoryMovements(stationId),
];

export function useProducts(options?: Options<any[]>) {
  return useQuery({
    queryKey: queryKeys.products(),
    queryFn: () => productSvc.listProducts(),
    ...TIER.semi,
    ...options,
  });
}

export function useStations(options?: Options<any[]>) {
  return useQuery({
    ...stationsQueryOptions(),
    ...options,
  });
}

export function useUsers(options?: Options<any[]>) {
  return useQuery({
    queryKey: queryKeys.users(),
    queryFn: () => userSvc.listUsers(),
    ...TIER.static,
    ...options,
  });
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
  return useQuery({
    queryKey: queryKeys.shiftTemplates(),
    queryFn: () => templateSvc.listTemplates(),
    ...TIER.static,
    ...options,
  });
}

export function usePaymentTerminals(
  stationId: string | null | undefined,
  options?: Options<any[]>,
) {
  return useQuery({
    queryKey: queryKeys.paymentTerminals(stationId ?? ''),
    queryFn: () => terminalSvc.listTerminals(stationId!),
    enabled: !!stationId,
    ...TIER.static,
    ...options,
  });
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

/** Past price changes for a station. Semi-static: appended to, never edited. */
export function usePricingHistory(stationId: string | null | undefined, options?: Options<any[]>) {
  return useQuery({
    queryKey: queryKeys.pricingHistory(stationId ?? ''),
    queryFn: () => pricingSvc.getPricingHistory(stationId!),
    enabled: !!stationId,
    ...TIER.semi,
    ...options,
  });
}

/**
 * The Organization's Access Document: what it may use, filtered for this
 * user's Role. Semi-static — access changes when PumpOS changes a plan, grant
 * or Limit, not during a shift — plus a focus refresh so a change made while
 * the app sat in the background lands on return.
 *
 * It is persisted, so a warm client keeps working through a network drop. A
 * cold start has no document at all: read it with `capabilityState` (or the
 * `CapabilityGate` components built on it), which hides optional capabilities
 * rather than inventing access.
 */
export function useAccess(options?: Options<AccessDocument>) {
  return useQuery({
    queryKey: queryKeys.access(),
    queryFn: () => accessSvc.getAccess(),
    ...TIER.semi,
    refetchOnWindowFocus: true,
    ...options,
  });
}

export function useOrganization(options?: Options<any>) {
  return useQuery({
    queryKey: queryKeys.organization(),
    queryFn: () => orgSvc.getOrganization(),
    ...TIER.static,
    ...options,
  });
}

export function useActivityGroups(params?: { stationId?: string; type?: string; limit?: number }) {
  const stationId = params?.stationId ?? '';
  const type = params?.type ?? '';
  const limit = params?.limit ?? 50;
  return useInfiniteQuery({
    queryKey: queryKeys.activityGroups(stationId, type, limit),
    queryFn: ({ pageParam }) =>
      eventsSvc.getActivityGroups({
        stationId: params?.stationId,
        type: params?.type,
        limit,
        cursor: pageParam ?? undefined,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    ...TIER.operational,
  });
}

export function useActivityGroup(groupId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.activityGroup(groupId ?? ''),
    queryFn: () => eventsSvc.getActivityGroup(groupId!),
    enabled: Boolean(groupId),
    ...TIER.operational,
  });
}

export function useMoneyMovements(
  params: { stationId?: string | null; from?: string; to?: string },
  options?: Options<any>,
) {
  return useQuery({
    queryKey: queryKeys.moneyMovements(params.stationId ?? '', params.from ?? '', params.to ?? ''),
    queryFn: () =>
      txService.getMoneyMovements({
        stationId: params.stationId!,
        from: params.from,
        to: params.to,
      }),
    enabled: !!params.stationId,
    ...TIER.operational,
    ...options,
  });
}

export function useInvoices(
  params: { stationId?: string | null; from?: string; to?: string },
  options?: Options<any[]>,
) {
  return useQuery({
    queryKey: queryKeys.invoices(params.stationId ?? '', params.from ?? '', params.to ?? ''),
    queryFn: () =>
      txService.getInvoices({
        stationId: params.stationId ?? undefined,
        from: params.from,
        to: params.to,
      }),
    enabled: !!params.stationId,
    ...TIER.operational,
    ...options,
  });
}

export function useMerchandiseHandovers(
  shiftId: string | null | undefined,
  options?: Options<any[]>,
) {
  return useQuery({
    queryKey: queryKeys.merchandiseHandovers(shiftId ?? ''),
    queryFn: () => txService.getMerchandiseHandovers(shiftId!),
    enabled: !!shiftId,
    ...TIER.operational,
    ...options,
  });
}

export function useMerchandiseSales(shiftId: string | null | undefined, options?: Options<any[]>) {
  return useQuery({
    queryKey: queryKeys.merchandiseSales(shiftId ?? ''),
    queryFn: () => txService.getMerchandiseSales(shiftId!).catch(() => []),
    enabled: !!shiftId,
    ...TIER.operational,
    ...options,
  });
}

export function useShiftTransactions(shiftId: string | null | undefined, options?: Options<any>) {
  return useQuery({
    queryKey: queryKeys.shiftTransactions(shiftId ?? ''),
    queryFn: () => txService.getShiftTransactions(shiftId!),
    enabled: !!shiftId,
    ...TIER.operational,
    ...options,
  });
}

export function useSales(
  params: { stationId?: string | null; from?: string; to?: string },
  options?: Options<any[]>,
) {
  return useQuery({
    queryKey: queryKeys.sales(params.stationId ?? '', params.from ?? '', params.to ?? ''),
    queryFn: () =>
      txService.getSales({ stationId: params.stationId!, from: params.from, to: params.to }),
    enabled: !!params.stationId,
    ...TIER.operational,
    ...options,
  });
}

/** T5 — output-tax register (GST on merchandise + VAT on fuel) for a period. */
export function useSalesTaxRegister(
  params: { stationId?: string | null; from?: string; to?: string },
  options?: Options<any[]>,
) {
  return useQuery({
    queryKey: queryKeys.salesTaxRegister(
      params.stationId ?? '',
      params.from ?? '',
      params.to ?? '',
    ),
    queryFn: () =>
      txService.getSalesTaxRegister({
        stationId: params.stationId!,
        from: params.from,
        to: params.to,
      }),
    enabled: !!params.stationId,
    ...TIER.operational,
    ...options,
  });
}

/** Input GST on purchases for a period. */
export function usePurchaseGstRegister(
  params: { from?: string; to?: string },
  options?: Options<any[]>,
) {
  return useQuery({
    queryKey: queryKeys.purchaseGstRegister(params.from ?? '', params.to ?? ''),
    queryFn: () =>
      txService.getPurchaseGstRegister(params.from || undefined, params.to || undefined),
    ...TIER.operational,
    ...options,
  });
}

/** FI4 — GST collected on other/indirect income for a period. */
export function useIncomeGstRegister(
  params: { stationId?: string | null; from?: string; to?: string },
  options?: Options<any[]>,
) {
  return useQuery({
    queryKey: queryKeys.incomeGstRegister(
      params.stationId ?? '',
      params.from ?? '',
      params.to ?? '',
    ),
    queryFn: () =>
      txService.getIncomeGstRegister(params.from, params.to, params.stationId ?? undefined),
    enabled: !!params.stationId,
    ...TIER.operational,
    ...options,
  });
}

export function useFinancialAccounts(
  stationId: string | null | undefined,
  options?: Options<any[]>,
) {
  return useQuery({
    queryKey: queryKeys.financialAccounts(stationId ?? ''),
    queryFn: () => financeSvc.listAccounts(stationId ?? undefined),
    ...TIER.operational,
    ...options,
  });
}

export function useAccountLedger(
  accountId: string | null | undefined,
  params?: { from?: string; to?: string },
  options?: Options<any>,
) {
  return useQuery({
    queryKey: queryKeys.accountLedger(accountId ?? '', params?.from ?? '', params?.to ?? ''),
    queryFn: () => financeSvc.getAccountLedger(accountId!, params?.from, params?.to),
    enabled: !!accountId,
    ...TIER.operational,
    ...options,
  });
}

export function useFinanceMovements(
  params: { stationId?: string | null; from?: string; to?: string },
  options?: Options<any>,
) {
  return useQuery({
    queryKey: queryKeys.financeMovements(
      params.stationId ?? '',
      params.from ?? '',
      params.to ?? '',
    ),
    queryFn: () =>
      financeSvc.getMovements({ stationId: params.stationId!, from: params.from, to: params.to }),
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

export function useShiftStatus(
  stationId: string | null | undefined,
  lite = false,
  options?: Options<any>,
) {
  return useQuery({
    queryKey: queryKeys.shiftStatus(stationId ?? '', lite),
    queryFn: () => shiftService.getShiftStatus(stationId!, lite),
    enabled: !!stationId,
    ...TIER.operational,
    ...options,
  });
}

export function useBusinessDayStatus(
  stationId: string | null | undefined,
  businessDate?: string,
  options?: Options<any>,
) {
  return useQuery({
    queryKey: queryKeys.businessDayStatus(stationId ?? '', businessDate),
    queryFn: () => shiftService.getBusinessDayStatus(stationId!, businessDate),
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

/**
 * The dashboard's single shift read (#147): open/last shift identity, stored
 * last-summary scalars, reopen/grace state, and today's rollup — one bounded
 * request instead of full shift status + every historical shift summary.
 */
export function useDashboardSummary(stationId: string | null | undefined, options?: Options<any>) {
  return useQuery({
    queryKey: queryKeys.dashboardSummary(stationId ?? ''),
    queryFn: () => shiftService.getDashboardSummary(stationId!),
    enabled: !!stationId,
    ...TIER.operational,
    ...options,
  });
}

export function useMyAssignment(options?: Options<any>) {
  return useQuery({
    queryKey: queryKeys.myAssignment(),
    queryFn: () => shiftService.getMyAssignment(),
    ...TIER.operational,
    ...options,
  });
}

export function useExpenses(options?: Options<any[]>) {
  return useQuery({
    queryKey: queryKeys.expenses(),
    queryFn: () => txService.getExpenses(),
    ...TIER.operational,
    ...options,
  });
}

export function usePurchases(options?: Options<any[]>) {
  return useQuery({
    queryKey: queryKeys.purchases(),
    queryFn: () => txService.getPurchases(),
    ...TIER.operational,
    ...options,
  });
}

export function useCollections(options?: Options<any[]>) {
  return useQuery({
    queryKey: queryKeys.collections(),
    queryFn: () => txService.getCollections(),
    ...TIER.operational,
    ...options,
  });
}

export function useCreditSales(options?: Options<any[]>) {
  return useQuery({
    queryKey: queryKeys.creditSales(),
    queryFn: () => txService.getCreditSales(),
    ...TIER.operational,
    ...options,
  });
}

export function useAllVehicles(activeOnly = false, options?: Options<any[]>) {
  return useQuery({
    queryKey: queryKeys.vehicles(activeOnly),
    queryFn: () => txService.getAllVehicles(activeOnly),
    ...TIER.semi,
    ...options,
  });
}

export function useCustomers(activeOnly = true, options?: Options<any[]>) {
  return useQuery({
    queryKey: queryKeys.customers(activeOnly),
    queryFn: () => txService.getCustomers(activeOnly),
    ...TIER.semi,
    ...options,
  });
}

export function useSuppliers(activeOnly = true, options?: Options<any[]>) {
  return useQuery({
    queryKey: queryKeys.suppliers(activeOnly),
    queryFn: () => txService.getSuppliers(activeOnly),
    ...TIER.semi,
    ...options,
  });
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
  return useQuery({
    queryKey: queryKeys.expenseCategories(),
    queryFn: () => txService.getExpenseCategories(),
    ...TIER.semi,
    ...options,
  });
}

export function useIncome(
  params?: { stationId?: string; from?: string; to?: string },
  options?: Options<any[]>,
) {
  return useQuery({
    queryKey: queryKeys.income(params?.stationId ?? '', params?.from ?? '', params?.to ?? ''),
    queryFn: () => txService.getIncome(params),
    ...TIER.operational,
    ...options,
  });
}

export function useIncomeCategories(options?: Options<any[]>) {
  return useQuery({
    queryKey: queryKeys.incomeCategories(),
    queryFn: () => txService.getIncomeCategories(),
    ...TIER.semi,
    ...options,
  });
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

export function useInventoryMovements(
  stationId: string | null | undefined,
  options?: Options<any[]>,
) {
  return useQuery({
    queryKey: queryKeys.inventoryMovements(stationId ?? ''),
    queryFn: () => txService.getInventoryMovements(stationId!),
    enabled: !!stationId,
    ...TIER.operational,
    ...options,
  });
}

export function useInventoryVariances(
  stationId: string | null | undefined,
  options?: Options<any[]>,
) {
  return useQuery({
    queryKey: queryKeys.inventoryVariances(stationId ?? ''),
    queryFn: () => txService.getInventoryVariances(stationId!),
    enabled: !!stationId,
    ...TIER.operational,
    ...options,
  });
}

export function useDailyDssr(
  stationId: string | null | undefined,
  date: string,
  options?: Options<any>,
) {
  return useQuery({
    queryKey: queryKeys.dssr(stationId ?? '', date),
    queryFn: () => shiftService.getDailyDssr(stationId!, date),
    enabled: !!stationId && !!date,
    ...options,
  });
}

// Live (non-persisted) DSSR/P&L for the open day — recomputed on demand.
export function useDailyDssrPreview(
  stationId: string | null | undefined,
  date: string,
  options?: Options<any>,
) {
  return useQuery({
    queryKey: queryKeys.dssrPreview(stationId ?? '', date),
    queryFn: () => shiftService.getDailyDssrPreview(stationId!, date),
    enabled: !!stationId && !!date,
    ...TIER.operational,
    ...options,
  });
}

export function useDailyDssrRange(
  stationId: string | null | undefined,
  from: string,
  to: string,
  options?: Options<any[]>,
) {
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
 *
 * The returned callback resolves once every refetch it triggered has settled, so
 * a caller that must not report success before the screen agrees can `await` it.
 * Callers that only need the refresh to start may ignore the promise.
 *
 * It does NOT reject. `invalidateQueries` swallows fetch errors internally
 * (query-core attaches `.catch(noop)` unless `throwOnError` is set) and surfaces
 * them through each query's own error state, which the consuming screens render.
 * So the promise is a "caches have settled" signal, not an error channel.
 */
export function useInvalidateOperational() {
  const qc = useQueryClient();
  return (stationId?: string | null) => {
    const invalidations = [
      qc.invalidateQueries({ queryKey: ['shift-status'] }),
      qc.invalidateQueries({ queryKey: ['business-day-status'] }),
      qc.invalidateQueries({ queryKey: ['shift-summaries'] }),
      qc.invalidateQueries({ queryKey: ['dashboard-summary'] }),
      qc.invalidateQueries({ queryKey: ['shift-transactions'] }),
      qc.invalidateQueries({ queryKey: ['merchandise-handovers'] }),
      qc.invalidateQueries({ queryKey: ['merchandise-sales'] }),
      // Business Day cockpit + P&L read the live DSSR preview — refresh it too.
      qc.invalidateQueries({ queryKey: ['dssr'] }),
      qc.invalidateQueries({ queryKey: ['dssr-preview'] }),
      qc.invalidateQueries({ queryKey: ['expenses'] }),
      qc.invalidateQueries({ queryKey: ['income'] }),
      qc.invalidateQueries({ queryKey: ['purchases'] }),
      qc.invalidateQueries({ queryKey: ['collections'] }),
      qc.invalidateQueries({ queryKey: ['customers'] }),
      // Money layer: account balances, statements and the Cash & Bank register all
      // move with expenses / income / collections / payments.
      qc.invalidateQueries({ queryKey: ['financial-accounts'] }),
      qc.invalidateQueries({ queryKey: ['account-ledger'] }),
      qc.invalidateQueries({ queryKey: ['finance-movements'] }),
      qc.invalidateQueries({ queryKey: ['money-movements'] }),
      // Suppliers carry computed payable balances that move with purchases/payments,
      // and new suppliers are created from PurchasesList — keep them fresh too.
      qc.invalidateQueries({ queryKey: ['suppliers'] }),
      qc.invalidateQueries({ queryKey: ['activity-groups'] }),
      qc.invalidateQueries({ queryKey: ['activity-group'] }),
    ];
    if (stationId) {
      invalidations.push(
        qc.invalidateQueries({ queryKey: ['inventory-status', stationId] }),
        qc.invalidateQueries({ queryKey: ['inventory-items', stationId] }),
        qc.invalidateQueries({ queryKey: ['inventory-movements', stationId] }),
        qc.invalidateQueries({ queryKey: ['inventory-variances', stationId] }),
      );
    }
    return Promise.all(invalidations).then(() => undefined);
  };
}
