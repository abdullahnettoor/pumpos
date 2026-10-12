import { useQuery } from '@tanstack/react-query';
import { CloudEventsService, type ActivityDayFeed } from '../services/cloud.js';
import { TIER } from './hooks.js';

const eventsSvc = new CloudEventsService();

/**
 * Key of one station's activity for one Business Day. Starts with
 * `['activity-groups', stationId]` so the existing operational invalidation of
 * the activity prefixes refreshes it too.
 */
export const dayActivityKey = (stationId: string, date: string) =>
  ['activity-groups', stationId, 'day', date] as const;

/** The dashboard timeline's events (operational tier, not persisted). */
export function useDayActivity(
  stationId: string | null | undefined,
  date: string | null | undefined,
  options?: { enabled?: boolean },
) {
  return useQuery<ActivityDayFeed>({
    queryKey: dayActivityKey(stationId ?? '', date ?? ''),
    queryFn: () => eventsSvc.getDayActivity(stationId!, date!),
    ...TIER.operational,
    ...options,
    enabled: !!stationId && !!date && (options?.enabled ?? true),
  });
}
