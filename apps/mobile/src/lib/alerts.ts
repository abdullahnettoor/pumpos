import { useMemo } from 'react';
import {
  useStationAlerts,
  useCustomers,
  useDensityTodaySummary,
  useDecantations,
  useShiftSummaries,
  useProducts,
} from '@pump/ui';
import type { Role, Station } from '@pump/shared';
import { businessDateSettings, can, principalOf } from '@pump/shared';
import { deriveAlerts } from './attention/derive.js';
import type { MobileAlert } from './attention/types.js';
import { useOwnHandover } from './handover/useOwnHandover.js';
import type { MoneyCustomer } from './money/parties.js';
import { usePastOpenDates } from './pastOpenDays.js';

export type { MobileAlert } from './attention/types.js';

const canSeeInventoryAttention = (role: Role | null): boolean =>
  can(principalOf(role), 'pages.inventory');

/**
 * The one "needs attention" list of the mobile app: the header bell's badge,
 * Home's top two and "All N", and the Needs attention page all read it, so the
 * count and the source are the same everywhere. See `attention/derive.ts` for
 * what goes in it and why nothing is recomputed on the client.
 */
export function useMobileAlerts(station: Station | null, role: Role | null = null): MobileAlert[] {
  const stock = useStationAlerts(station?.id, !!station);
  const customersQ = useCustomers();
  const pastOpen = usePastOpenDates(station?.id);
  const summariesQ = useShiftSummaries(station?.id);
  const ownHandover = useOwnHandover(!!station, businessDateSettings(station?.settings).timeZone);
  const decantationsQ = useDecantations(station?.id ?? null, '', {
    enabled: !!station && canSeeInventoryAttention(role),
  });
  const productsQ = useProducts();
  const densityQ = useDensityTodaySummary(station?.id ?? null, undefined, {
    // Follows the shared guard (Staff record density too).
    enabled: !!station && role !== null && can(principalOf(role), 'inventory.density'),
  });

  const productNames = useMemo(
    () =>
      Object.fromEntries((productsQ.data ?? []).map((p) => [p.id, p.name || p.code])) as Record<
        string,
        string
      >,
    [productsQ.data],
  );

  return useMemo(() => {
    if (!station) return [];
    return deriveAlerts({
      stock,
      customers: (customersQ.data ?? []) as MoneyCustomer[],
      pastOpenDates: pastOpen,
      summaries: summariesQ.data ?? [],
      ownHandover,
      role,
      decantations: decantationsQ.data ?? [],
      productNames,
      densityToday: densityQ.data,
    });
  }, [
    station,
    stock,
    customersQ.data,
    pastOpen,
    summariesQ.data,
    ownHandover,
    role,
    decantationsQ.data,
    productNames,
    densityQ.data,
  ]);
}
