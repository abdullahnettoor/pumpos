import React, { useId } from 'react';
import type { TeamWriteAccess } from '../../lib/team/permissions.js';

/**
 * Props for a team action button that the access mode may pause. A paused
 * action stays focusable (`aria-disabled`, not `disabled`) and is described by
 * the visible reason, so a screen reader reaches it and hears why.
 */
export function useWriteGate(access: TeamWriteAccess) {
  const reasonId = useId();
  const paused = access.status === 'disabled';
  return {
    paused,
    reason: access.status === 'disabled' ? access.reason : null,
    reasonId,
    /** Spread onto the button, with the real handler as `onPress`. */
    buttonProps: (onPress: () => void) => ({
      onClick: paused ? undefined : onPress,
      'aria-disabled': paused || undefined,
      'aria-describedby': paused ? reasonId : undefined,
    }),
  };
}

/** The visible reason an action is paused. */
export const WriteReason: React.FC<{ id: string; children: React.ReactNode }> = ({
  id,
  children,
}) => (
  <p id={id} className="m-0 px-1 text-center text-[11.5px] text-text-muted">
    {children}
  </p>
);
