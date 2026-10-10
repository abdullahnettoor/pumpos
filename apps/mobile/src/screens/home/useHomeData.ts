import { useMemo } from 'react';
import {
  useCustomers,
  useDailyDssrPreview,
  useDailyDssrRange,
  useInventoryStatus,
  useShiftStatus,
  useSuppliers,
} from '@pump/ui';
import { businessDateSettings, resolveBusinessDate, shiftBusinessDate } from '@pump/shared';
import type { Station } from '@pump/shared';
import { useMobileAlerts } from '../../lib/alerts.js';
import { deriveMoney, deriveTanks, deriveTiles } from '../../lib/home/figures.js';
import { businessDateLabel } from '../../lib/home/dates.js';
import { deriveLiveShift } from '../../lib/home/live.js';
import {
  deriveComparison,
  deriveSales,
  deriveSplitBar,
  deriveTrend,
  readSnapshot,
  trendWindow,
} from '../../lib/home/sales.js';
import { useNow } from '../../lib/useNow.js';

/**
 * Everything Home shows, from the existing read endpoints (operational tier:
 * DSSR preview, shift status, inventory; semi: customers, suppliers). The
 * derivations are pure and live in `lib/home`; this only wires queries to them.
 */
export function useHomeData(station: Station) {
  const { timeZone, dayStartsAt } = businessDateSettings(station.settings);
  const now = useNow();
  // The Current Business Date: station timezone, rolled back before Day Start.
  const today = resolveBusinessDate({ now: new Date(now), timeZone, dayStartsAt });
  const previousDate = shiftBusinessDate(today, -1);
  const window = trendWindow(today);

  const previewQ = useDailyDssrPreview(station.id, today);
  const previousQ = useDailyDssrPreview(station.id, previousDate);
  const rangeQ = useDailyDssrRange(station.id, window.from, window.to);
  const statusQ = useShiftStatus(station.id);
  const tanksQ = useInventoryStatus(station.id);
  const customersQ = useCustomers();
  const suppliersQ = useSuppliers();
  const alerts = useMobileAlerts(station);

  const preview = previewQ.data;
  const previous = previousQ.data;
  const range = rangeQ.data;
  const status = statusQ.data;
  const tanks = tanksQ.data;
  const customers = customersQ.data;
  const suppliers = suppliersQ.data;

  return useMemo(() => {
    const snap = readSnapshot(preview);
    const sales = deriveSales(snap);
    const live = deriveLiveShift(status, today, now, timeZone);
    // Only a Shift of today's Business Day has fuel still to be counted into the headline.
    const openShiftInDay = !!live?.inCurrentDay;
    const trend = deriveTrend(range);
    return {
      today,
      dateLabel: businessDateLabel(today),
      live,
      openShiftInDay,
      sales,
      split: deriveSplitBar(sales.closedShifts, openShiftInDay),
      comparison: previous ? deriveComparison(sales, readSnapshot(previous), previousDate) : null,
      trend: trend.length >= 2 ? trend : [],
      tiles: deriveTiles(snap),
      tanks: deriveTanks(tanks),
      money: deriveMoney(customers, suppliers),
      alerts,
      salesLoading: previewQ.isLoading,
      salesError: previewQ.isError && !preview,
      shiftLoading: statusQ.isLoading,
    };
  }, [
    preview,
    previous,
    range,
    status,
    tanks,
    customers,
    suppliers,
    alerts,
    today,
    previousDate,
    now,
    timeZone,
    previewQ.isLoading,
    previewQ.isError,
    statusQ.isLoading,
  ]);
}
