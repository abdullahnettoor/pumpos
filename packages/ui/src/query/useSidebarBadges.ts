import React from 'react';
import { useShiftStatus } from './hooks.js';
import { alertBadgeCounts, useStationAlerts } from './useStationAlerts.js';

/**
 * Live sidebar badges. Every count comes from the shared alert derivation
 * (`useStationAlerts`); only the running-shift dot reads the shift status.
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

/**
 * `includeMoneyAlerts` false (Staff) skips only the money queries; stock alerts
 * are not money data, so Staff still get the Inventory badge.
 */
export function useSidebarBadges(
  stationId: string | null | undefined,
  enabled: boolean,
  includeMoneyAlerts: boolean,
  businessDate?: string,
): SidebarBadges {
  const alerts = useStationAlerts(stationId, enabled, null, {
    enabled: includeMoneyAlerts,
    businessDate,
  });
  const { data: shift } = useShiftStatus(stationId, {
    lite: true,
    enabled: enabled && !!stationId,
  });

  return React.useMemo(() => {
    if (!enabled) return NO_BADGES;
    return { shiftRunning: !!shift?.activeShift, ...alertBadgeCounts(alerts) };
  }, [enabled, shift, alerts]);
}
