import { useMemo } from 'react';
import { useBusinessDayStatus } from '@pump/ui';

/**
 * Past Open Business Days: days before the Current Business Date that are still
 * open (Delayed Closure). Several can be open at once, so this reads the Business
 * Day status's `pastOpenBusinessDays`, which lists every one of them; the shift
 * status only names the newest open day and hides the rest. The Shifts banner
 * and the Home attention list both read it here, so they cannot disagree.
 */

/** Oldest first: the day that has been waiting longest leads. */
export function pastOpenDates(
  status: { pastOpenBusinessDays?: readonly { businessDate: string }[] } | null | undefined,
): string[] {
  return [...new Set((status?.pastOpenBusinessDays ?? []).map((d) => d.businessDate))].sort();
}

export function usePastOpenDates(stationId: string | null | undefined): string[] {
  const status = useBusinessDayStatus(stationId).data;
  return useMemo(() => pastOpenDates(status), [status]);
}
