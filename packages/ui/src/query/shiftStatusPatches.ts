import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from './hooks.js';
import type { BusinessDayStatusResponse } from '../services/cloud.js';
import { patchQueriesData, patchQueryData } from './patches/applyPatch.js';
import { withClosedBusinessDay, type ClosedBusinessDay } from './patches/businessDay.js';
import {
  withCustomerSale,
  withoutCustomerSale,
  type CustomerSaleEntry,
  type CustomerSaleLabels,
  type ShiftStatusSlice,
} from './patches/shiftStatus.js';

/**
 * Customer sales (fuel on credit, OMC card) recorded or voided in a Handover,
 * written into the cached shift board from the write's answer (#606). The
 * caller still starts the shift-status refresh in the background.
 */
export function patchShiftStatusWithCustomerSale(
  queryClient: QueryClient,
  stationId: string | null | undefined,
  entry: CustomerSaleEntry,
  labels: CustomerSaleLabels,
): void {
  if (!stationId) return;
  patchQueryData<ShiftStatusSlice>(queryClient, queryKeys.shiftStatus(stationId, false), (s) =>
    withCustomerSale(s, entry, labels),
  );
}

export function patchShiftStatusWithoutCustomerSale(
  queryClient: QueryClient,
  stationId: string | null | undefined,
  shiftId: string,
  saleId: string,
): void {
  if (!stationId) return;
  patchQueryData<ShiftStatusSlice>(queryClient, queryKeys.shiftStatus(stationId, false), (s) =>
    withoutCustomerSale(s, shiftId, saleId),
  );
}

/** A closed Business Day into every cached business-day status of the station (#606). */
export function patchBusinessDayClosed(
  queryClient: QueryClient,
  stationId: string,
  day: ClosedBusinessDay | null | undefined,
): void {
  if (!day?.id) return;
  patchQueriesData<BusinessDayStatusResponse>(
    queryClient,
    { queryKey: queryKeys.businessDayStatusPrefix(stationId) },
    (status) => withClosedBusinessDay(status, day),
  );
}
