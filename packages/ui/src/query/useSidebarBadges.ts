import React from 'react';
import { RECEIVABLES_AGING_EDGES } from '@pump/shared';
import { useBusinessDayStatus, useReceivables, useShiftStatus } from './hooks.js';
import { useStationAlerts } from './useStationAlerts.js';

/**
 * Live sidebar badges. Counts come from the shared alert derivation
 * (`useStationAlerts`) and the cached operational queries the status bar and
 * dashboard already use, so nothing here recomputes per page.
 */
export interface SidebarBadges {
  /** A shift is running: a dot on Shifts. */
  shiftRunning: boolean;
  /** Stock alerts on Inventory. */
  inventoryAlerts: number;
  /** Customers whose oldest unpaid debit is past the mid aging edge, on Customers. */
  overdueCustomers: number;
  /** Earlier Business Days still open, on Reports. */
  openPastDays: number;
}

export const NO_BADGES: SidebarBadges = {
  shiftRunning: false,
  inventoryAlerts: 0,
  overdueCustomers: 0,
  openPastDays: 0,
};

export function countOverdueCustomers(
  customers: { oldestUnpaidDays: number | null }[] = [],
): number {
  return customers.filter((c) => (c.oldestUnpaidDays ?? 0) > RECEIVABLES_AGING_EDGES.midMaxDays)
    .length;
}

/** `canSeeFinancials` false (Staff) skips the money queries entirely. */
export function useSidebarBadges(
  stationId: string | null | undefined,
  enabled: boolean,
  canSeeFinancials: boolean,
  businessDate?: string,
): SidebarBadges {
  const alerts = useStationAlerts(stationId, enabled && canSeeFinancials);
  const { data: shift } = useShiftStatus(stationId, true, { enabled: enabled && !!stationId });
  const { data: receivables } = useReceivables(stationId, {
    enabled: enabled && canSeeFinancials && !!stationId,
  });
  const { data: day } = useBusinessDayStatus(stationId, businessDate, {
    enabled: enabled && canSeeFinancials && !!stationId,
  });

  return React.useMemo(() => {
    if (!enabled) return NO_BADGES;
    return {
      shiftRunning: !!shift?.activeShift,
      inventoryAlerts: alerts.length,
      overdueCustomers: countOverdueCustomers(receivables?.customers),
      openPastDays: day?.pastOpenBusinessDays?.length ?? 0,
    };
  }, [enabled, shift, alerts, receivables, day]);
}
