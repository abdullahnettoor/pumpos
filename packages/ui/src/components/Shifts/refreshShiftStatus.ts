import { queryKeys } from '../../query/hooks.js';

interface ShiftStatusQueryClient {
  refetchQueries(filters: { queryKey: readonly unknown[]; type: 'active' }): Promise<unknown>;
}

export async function refreshShiftStatus(
  queryClient: ShiftStatusQueryClient,
  invalidateOperational: (stationId?: string | null) => Promise<void>,
  stationId: string | null,
): Promise<void> {
  await invalidateOperational(stationId);
  if (!stationId) return;
  await queryClient.refetchQueries({
    queryKey: queryKeys.shiftStatus(stationId, false),
    type: 'active',
  });
}
