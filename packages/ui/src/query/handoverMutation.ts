import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CloudShiftService, type RecordHandoverPayload, type RecordHandoverResult } from '../services/cloud.js';
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

export function resolveHandoverRequestIdentity(
  current: HandoverRequestIdentity | null | undefined,
  payload: RecordHandoverPayload,
  createKey = createIdempotencyKey,
): HandoverRequestIdentity {
  const fingerprint = handoverPayloadFingerprint(payload);
  return current?.fingerprint === fingerprint ? current : { fingerprint, idempotencyKey: createKey() };
}

export function selectHandoverSummary(
  preview: { expectedTotal: number; declaredTotal: number; varianceAmount: number },
  accepted?: RecordHandoverResult | null,
) {
  return accepted ? {
    source: 'accepted' as const,
    expectedTotal: accepted.expectedTotal,
    declaredTotal: accepted.declaredTotal,
    varianceAmount: accepted.varianceAmount,
  } : { source: 'preview' as const, ...preview };
}

export interface RecordHandoverMutationInput {
  stationId: string;
  payload: RecordHandoverPayload;
  idempotencyKey: string;
}

export function handoverInvalidationKeys(stationId: string): readonly (readonly unknown[])[] {
  return [
    ['shift-status', stationId],
    queryKeys.myAssignment(),
    ['dssr-preview', stationId],
    ['activity-groups', stationId],
  ];
}

export function useRecordHandoverMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ payload, idempotencyKey }: RecordHandoverMutationInput) =>
      shiftService.recordHandover(payload, { idempotencyKey }),
    onSuccess: async (_result, { stationId }) => {
      await Promise.all(handoverInvalidationKeys(stationId).map((queryKey) => queryClient.invalidateQueries({ queryKey })));
    },
  });
}
