import React, { useId } from 'react';

/**
 * Props that pause a button without hiding it. A paused action stays focusable
 * (`aria-disabled`, not `disabled`) and is described by its visible reason
 * (`PausedReason`, linked by `reasonId`), so a screen reader reaches it and
 * hears why. Spread onto the button; `onPress` is the real handler.
 */
export function pausedButtonProps(paused: boolean, reasonId: string, onPress: () => void) {
  return {
    onClick: paused ? undefined : onPress,
    'aria-disabled': paused || undefined,
    'aria-describedby': paused ? reasonId : undefined,
  };
}

/** One paused-or-available action: `reason` set means paused (Restricted Access, Suspension). */
export function usePausedAction(reason?: string | null) {
  const reasonId = useId();
  const paused = Boolean(reason);
  return {
    paused,
    reason: reason || null,
    reasonId,
    buttonProps: (onPress: () => void) => pausedButtonProps(paused, reasonId, onPress),
  };
}

/** The visible reason an action is paused. */
export const PausedReason: React.FC<{
  id: string;
  children: React.ReactNode;
  className?: string;
}> = ({ id, children, className = 'text-[11px]' }) => (
  <p id={id} className={`m-0 text-text-muted ${className}`}>
    {children}
  </p>
);
