import React from 'react';
import { PausedReason, pausedButtonProps } from '../../ui/PausedAction.js';

/** The quiet "Record payment" button; absent when this user may not record one. */
export interface PaymentAction {
  onPress: () => void;
  /** Set while the action is paused (Suspension): why, shown under the button. */
  disabledReason?: string;
}

/**
 * The outline "Record payment" button in a balance card (Customer: a Collection;
 * Supplier: a Supplier Payment). Quiet on purpose: an outline, not the accent
 * fill; the action bar stays Share / Download. aria-disabled, not disabled: the
 * button stays focusable, so a screen reader reaches it and hears the reason it is
 * paused (`PaymentReason`, linked by `reasonId`).
 */
export const RecordPaymentButton: React.FC<{ action: PaymentAction; reasonId: string }> = ({
  action,
  reasonId,
}) => {
  const paused = Boolean(action.disabledReason);
  return (
    <button
      type="button"
      {...pausedButtonProps(paused, reasonId, action.onPress)}
      className="min-h-[36px] rounded-lg border border-line-strong px-3 text-[12.5px] font-bold text-text-high aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
    >
      Record payment
    </button>
  );
};

/** Why the button is paused, under it; nothing while it is available. */
export const PaymentReason: React.FC<{ action?: PaymentAction; reasonId: string }> = ({
  action,
  reasonId,
}) =>
  action?.disabledReason ? (
    <PausedReason id={reasonId}>{action.disabledReason}</PausedReason>
  ) : null;
