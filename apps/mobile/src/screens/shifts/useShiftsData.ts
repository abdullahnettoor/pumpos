import { useMemo } from 'react';
import { useShiftStatus, useShiftSummaries } from '@pump/ui';
import { businessDateSettings, resolveBusinessDate } from '@pump/shared';
import type { Station } from '@pump/shared';
import { deriveShiftHistory, type ShiftSummaryRow } from '../../lib/shifts/history.js';
import { deriveLiveShiftCard } from '../../lib/shifts/liveCard.js';
import { useNow } from '../../lib/useNow.js';

/**
 * Everything the Shifts tab shows, from existing read endpoints (operational
 * tier: shift status, shift summaries). The derivations are pure and live in
 * `lib/shifts`; this only wires queries to them.
 */
export function useShiftsData(station: Station) {
  const { timeZone, dayStartsAt } = businessDateSettings(station.settings);
  const now = useNow();
  const today = resolveBusinessDate({ now: new Date(now), timeZone, dayStartsAt });

  const statusQ = useShiftStatus(station.id);
  const summariesQ = useShiftSummaries(station.id);
  const status = statusQ.data;
  const summaries = summariesQ.data;

  return useMemo(() => {
    const day = (status as { businessDay?: { status?: string; businessDate?: string } } | undefined)
      ?.businessDay;
    return {
      live: deriveLiveShiftCard(status, now, timeZone),
      history: deriveShiftHistory((summaries ?? []) as ShiftSummaryRow[], { timeZone, today }),
      // A past Business Day that is still open can only be closed on desktop.
      staleOpenDate:
        day?.status === 'OPEN' && day.businessDate && day.businessDate < today
          ? day.businessDate
          : null,
      statusLoading: statusQ.isLoading,
      historyLoading: summariesQ.isLoading,
      historyError: summariesQ.isError && !summaries,
    };
  }, [
    status,
    summaries,
    now,
    timeZone,
    today,
    statusQ.isLoading,
    summariesQ.isLoading,
    summariesQ.isError,
  ]);
}
