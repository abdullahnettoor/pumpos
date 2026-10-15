import { queryKeys } from '../../query/hooks.js';

interface ShiftStatusQueryClient {
  refetchQueries(
    filters: { queryKey: readonly unknown[]; type: 'active' },
    options?: { throwOnError?: boolean },
  ): Promise<unknown>;
}

/** `throwOnError`: reject when a refetch fails, so the caller can report it (#606). */
export async function refreshShiftStatus(
  queryClient: ShiftStatusQueryClient,
  invalidateOperational: (
    stationId?: string | null,
    opts?: { throwOnError?: boolean },
  ) => Promise<void>,
  stationId: string | null,
  opts?: { throwOnError?: boolean },
): Promise<void> {
  await (opts ? invalidateOperational(stationId, opts) : invalidateOperational(stationId));
  if (!stationId) return;
  const filters = { queryKey: queryKeys.shiftStatus(stationId, false), type: 'active' as const };
  await (opts ? queryClient.refetchQueries(filters, opts) : queryClient.refetchQueries(filters));
}
