import { useMemo } from 'react';
import { useShiftStatus, useShiftSummaryHistory } from '@pump/ui';
import { businessDateSettings, resolveBusinessDate } from '@pump/shared';
import type { Station } from '@pump/shared';
import { deriveShiftHistory, settledDays, type ShiftSummaryRow } from '../../lib/shifts/history.js';
import { deriveLiveShiftCard } from '../../lib/shifts/liveCard.js';
import { usePastOpenDates } from '../../lib/pastOpenDays.js';
import { useNow } from '../../lib/useNow.js';

/**
 * Everything the Shifts tab shows, from existing read endpoints (operational
 * tier: shift status, Business Day status, shift summaries). The derivations are
 * pure and live in `lib/shifts`; this only wires queries to them.
 */
export function useShiftsData(station: Station) {
  const { timeZone, dayStartsAt } = businessDateSettings(station.settings);
  const now = useNow();
  const today = resolveBusinessDate({ now: new Date(now), timeZone, dayStartsAt });

  const statusQ = useShiftStatus(station.id);
  const historyQ = useShiftSummaryHistory(station.id);
  // Every past Business Day still open (a newer open day does not hide an older one).
  const staleOpenDates = usePastOpenDates(station.id);
  const status = statusQ.data;
  const pages = historyQ.data?.pages;
  const { hasNextPage, fetchNextPage } = historyQ;

  return useMemo(() => {
    const summaries = (pages ?? []).flat() as ShiftSummaryRow[];
    return {
      live: deriveLiveShiftCard(status, now, timeZone),
      // A day's total is only complete once its older shifts are loaded.
      history: settledDays(deriveShiftHistory(summaries, { timeZone, today }), hasNextPage),
      hasMoreHistory: hasNextPage,
      loadMoreHistory: () => fetchNextPage(),
      // A past Business Day that is still open can only be closed on desktop.
      staleOpenDates,
      statusLoading: statusQ.isLoading,
      historyLoading: historyQ.isLoading,
      historyError: historyQ.isError && !pages,
      loadingMore: historyQ.isFetchingNextPage,
    };
  }, [
    status,
    pages,
    now,
    timeZone,
    today,
    staleOpenDates,
    statusQ.isLoading,
    historyQ.isLoading,
    historyQ.isError,
    hasNextPage,
    historyQ.isFetchingNextPage,
    fetchNextPage,
  ]);
}
