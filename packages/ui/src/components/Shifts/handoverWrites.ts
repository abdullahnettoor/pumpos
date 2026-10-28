import { mutationKeys, queryKeys } from '../../query/hooks.js';
import type { RecordHandoverMutationInput } from '../../query/handoverMutation.js';
import { useQueryClient, type QueryClient, type UseQueryResult } from '@tanstack/react-query';
import { patchConfirmation } from '../../query/patches/applyPatch.js';
import { useWriteStates, type WriteEntry } from '../../query/pendingWrites.js';
import { DRAWER_KEY } from './liveShiftInputs.js';

export type HandoverWrites = ReadonlyMap<string, WriteEntry<RecordHandoverMutationInput>>;

/** A Handover write's Drawer on this shift (`userId|duId`); null for another shift. */
export const handoverWriteKey = (
  v: RecordHandoverMutationInput,
  shiftId: string | null,
): string | null =>
  shiftId && v.payload.shiftId === shiftId && v.payload.userId
    ? DRAWER_KEY(v.payload.userId, v.payload.duId)
    : null;

/** The shift's Handovers still saving or failed, by Drawer key (#606). */
export const useHandoverWrites = (shiftId: string | null): HandoverWrites =>
  useWriteStates(mutationKeys.handover(), handoverWriteKey, shiftId);

/**
 * Where the shift's money stands after a Handover (#606):
 * - `saving`: a Handover is in flight, or the board holds its patch and the
 *   refetch has not answered yet;
 * - `unconfirmed`: that refetch failed. The shift-level figures a Handover
 *   moves (cash sales, expected office cash) are not in its answer, so they
 *   stay "Saving…" with an inline Retry, and the shift cannot close, until a
 *   refetch succeeds;
 * - `confirmed`: everything shown is the server's.
 */
export type ShiftMoneyState = 'confirmed' | 'saving' | 'unconfirmed';

export function shiftMoneyState(
  writes: HandoverWrites,
  qc: QueryClient,
  stationId: string | null,
): ShiftMoneyState {
  for (const w of writes.values()) if (w.state === 'saving') return 'saving';
  if (!stationId) return 'confirmed';
  const patch = patchConfirmation(qc, queryKeys.shiftStatus(stationId, false));
  return patch === 'awaiting' ? 'saving' : patch === 'failed' ? 'unconfirmed' : 'confirmed';
}

/**
 * The shift's money state, re-read whenever the status query moves (its
 * update count, status or fetch state), so a failed or retried refetch shows.
 */
export function useShiftMoneyState(
  writes: HandoverWrites,
  stationId: string | null,
  statusQ: Pick<UseQueryResult, 'dataUpdatedAt' | 'status' | 'fetchStatus'>,
): ShiftMoneyState {
  const qc = useQueryClient();
  // Read so the caller re-renders when they change (tracked query results).
  void [statusQ.dataUpdatedAt, statusQ.status, statusQ.fetchStatus];
  return shiftMoneyState(writes, qc, stationId);
}

/** What a failed write says on its row. */
export const notSavedMessage = (entry: WriteEntry<unknown> | undefined): string | null =>
  entry?.state === 'failed'
    ? `Not saved: ${entry.error?.message || 'the server refused it'}. Open it to try again.`
    : null;
