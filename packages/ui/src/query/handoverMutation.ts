import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CloudShiftService,
  type RecordHandoverPayload,
  type RecordHandoverResult,
} from '../services/cloud.js';
import { runTask } from '../utils/runTask.js';
import { queryKeys } from './hooks.js';

const shiftService = new CloudShiftService();

export function handoverPayloadFingerprint(payload: RecordHandoverPayload): string {
  return JSON.stringify(payload);
}

export function createIdempotencyKey(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export interface HandoverRequestIdentity {
  fingerprint: string;
  idempotencyKey: string;
}

const handoverRequestKey = (
  stationId: string,
  shiftId: string,
  attendantId: string,
  duId: string,
) => `pumpos:pending-handover:${stationId}:${shiftId}:${attendantId}:${duId}`;

export function loadHandoverRequestIdentity(
  stationId: string,
  shiftId: string,
  attendantId: string,
  duId: string,
): HandoverRequestIdentity | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    return JSON.parse(
      localStorage.getItem(handoverRequestKey(stationId, shiftId, attendantId, duId)) ?? 'null',
    ) as HandoverRequestIdentity | null;
  } catch {
    return null;
  }
}

export function saveHandoverRequestIdentity(
  stationId: string,
  shiftId: string,
  attendantId: string,
  duId: string,
  identity: HandoverRequestIdentity | null,
): void {
  if (typeof localStorage === 'undefined') return;
  const key = handoverRequestKey(stationId, shiftId, attendantId, duId);
  if (identity) localStorage.setItem(key, JSON.stringify(identity));
  else localStorage.removeItem(key);
}

export function resolveHandoverRequestIdentity(
  current: HandoverRequestIdentity | null | undefined,
  payload: RecordHandoverPayload,
  createKey = createIdempotencyKey,
): HandoverRequestIdentity {
  const fingerprint = handoverPayloadFingerprint(payload);
  return current?.fingerprint === fingerprint
    ? current
    : { fingerprint, idempotencyKey: createKey() };
}

export function selectHandoverSummary(
  preview: { expectedTotal: number; declaredTotal: number; varianceAmount: number },
  accepted?: RecordHandoverResult | null,
) {
  return accepted
    ? {
        source: 'accepted' as const,
        expectedTotal: accepted.expectedTotal,
        declaredTotal: accepted.declaredTotal,
        varianceAmount: accepted.varianceAmount,
      }
    : { source: 'preview' as const, ...preview };
}

export interface RecordHandoverMutationInput {
  stationId: string;
  payload: RecordHandoverPayload;
  idempotencyKey: string;
}

export function handoverInvalidationKeys(stationId: string): readonly (readonly unknown[])[] {
  return [
    queryKeys.shiftStatusPrefix(stationId),
    queryKeys.dashboardSummary(stationId),
    queryKeys.myAssignment(),
    queryKeys.dssrPreviewPrefix(stationId),
    queryKeys.activityGroupsPrefix(stationId),
  ];
}

export interface HandoverInvalidationClient {
  invalidateQueries(filters: { queryKey: readonly unknown[] }): Promise<unknown>;
}

/**
 * Refreshes every projection a Handover moves. Deliberately separate from the
 * mutation's `onSuccess` so the submit path can start it without awaiting it.
 */
export async function refreshAfterHandover(
  queryClient: HandoverInvalidationClient,
  stationId: string,
): Promise<void> {
  await Promise.all(
    handoverInvalidationKeys(stationId).map((queryKey) =>
      queryClient.invalidateQueries({ queryKey }),
    ),
  );
}

/**
 * Mutation options as a value so the "never gate success on the refetch"
 * convention is assertable in a test rather than only readable in review.
 *
 * `onSuccess` must stay synchronous: React Query awaits whatever it returns
 * before settling `mutateAsync`, so returning the invalidation cascade would
 * make the submitting spinner and the drawer close wait on five dependent
 * queries the operator's feedback does not need.
 */
export function recordHandoverMutationOptions(queryClient: HandoverInvalidationClient) {
  return {
    mutationFn: ({ payload, idempotencyKey }: RecordHandoverMutationInput) =>
      shiftService.recordHandover(payload, { idempotencyKey }),
    onSuccess: (
      _result: RecordHandoverResult,
      { stationId }: RecordHandoverMutationInput,
    ): void => {
      runTask(refreshAfterHandover(queryClient, stationId), (error) =>
        console.error('Handover recorded, but the screen could not be refreshed.', error),
      );
    },
  };
}

export function useRecordHandoverMutation() {
  const queryClient = useQueryClient();
  return useMutation(recordHandoverMutationOptions(queryClient));
}
