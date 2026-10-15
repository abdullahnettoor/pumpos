import { mutationKeys, queryKeys } from '../../query/hooks.js';
import type { RecordHandoverMutationInput } from '../../query/handoverMutation.js';
import { isAwaitingConfirmation } from '../../query/patches/applyPatch.js';
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
 * Whether the shift's money is still to be confirmed: a Handover is saving, or
 * the board holds a patch its refetch has not replaced yet. The shift-level
 * figures a Handover moves (cash sales, expected office cash) are not in its
 * answer, so until then they read "Saving…", never the old or a predicted value.
 */
export function shiftMoneyConfirming(
  writes: HandoverWrites,
  stationId: string | null,
  statusState: { dataUpdatedAt?: number; errorUpdatedAt?: number } | undefined,
): boolean {
  for (const w of writes.values()) if (w.state === 'saving') return true;
  return (
    !!stationId && isAwaitingConfirmation(queryKeys.shiftStatus(stationId, false), statusState)
  );
}

/** What a failed write says on its row. */
export const notSavedMessage = (entry: WriteEntry<unknown> | undefined): string | null =>
  entry?.state === 'failed'
    ? `Not saved: ${entry.error?.message || 'the server refused it'}. Open it to try again.`
    : null;
