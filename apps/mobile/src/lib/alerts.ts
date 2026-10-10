import { useMemo } from 'react';
import { useStationAlerts, useCustomers, useShiftSummaries } from '@pump/ui';
import type { Station } from '@pump/shared';
import { deriveAlerts } from './attention/derive.js';
import type { MobileAlert } from './attention/types.js';
import { useOwnHandover } from './handover/useOwnHandover.js';
import type { MoneyCustomer } from './money/parties.js';
import { usePastOpenDates } from './pastOpenDays.js';

export type { MobileAlert } from './attention/types.js';

/**
 * The one "needs attention" list of the mobile app: the header bell's badge,
 * Home's top two and "All N", and the Needs attention page all read it, so the
 * count and the source are the same everywhere. See `attention/derive.ts` for
 * what goes in it and why nothing is recomputed on the client.
 */
export function useMobileAlerts(station: Station | null): MobileAlert[] {
  const stock = useStationAlerts(station?.id, !!station);
  const customersQ = useCustomers();
  const pastOpen = usePastOpenDates(station?.id);
  const summariesQ = useShiftSummaries(station?.id);
  const ownHandover = useOwnHandover(!!station);

  return useMemo(() => {
    if (!station) return [];
    return deriveAlerts({
      stock,
      customers: (customersQ.data ?? []) as MoneyCustomer[],
      pastOpenDates: pastOpen,
      summaries: summariesQ.data ?? [],
      ownHandover,
    });
  }, [station, stock, customersQ.data, pastOpen, summariesQ.data, ownHandover]);
}
