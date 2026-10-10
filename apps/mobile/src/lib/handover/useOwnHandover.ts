import { useMemo } from 'react';
import { useMyAssignment } from '@pump/ui';
import type { MyAssignment } from './model.js';
import { deriveOwnHandover, type OwnHandover } from './own.js';

/**
 * The signed-in user's own Handover from `my-assignment` (the same query the
 * handover form reads), or null when they hold no Dispenser Unit on an open
 * Shift. Pass `enabled: false` where the answer is not wanted (the Attendant
 * app reads its assignment itself).
 */
export function useOwnHandover(enabled = true): OwnHandover | null {
  const assignmentQ = useMyAssignment({ enabled });
  const data: MyAssignment | null | undefined = assignmentQ.data;
  return useMemo(() => (enabled ? deriveOwnHandover(data) : null), [enabled, data]);
}
