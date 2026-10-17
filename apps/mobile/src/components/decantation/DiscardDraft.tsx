import React, { useState } from 'react';
import { useDiscardDecantation, useToast, withNextStep } from '@pump/ui';
import { useBack } from '../../ui/backStack.js';

/** Discard a draft visit (a tanker that never unloaded), with an inline confirm. */
export const DiscardDraft: React.FC<{ stationId: string; decantationId: string }> = ({
  stationId,
  decantationId,
}) => {
  const toast = useToast();
  const back = useBack();
  const discard = useDiscardDecantation(stationId);
  const [confirming, setConfirming] = useState(false);

  const run = async () => {
    try {
      await discard.mutateAsync({ decantationId });
      toast.success('Draft discarded.');
      back();
    } catch (e) {
      setConfirming(false);
      toast.error(
        withNextStep(
          (e as { message?: string } | null)?.message || "Couldn't discard the draft",
          'Try again.',
        ),
      );
    }
  };

  if (!confirming)
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="h-11 rounded-[13px] border border-line bg-card text-[13.5px] font-bold text-bad-fg"
      >
        Discard draft
      </button>
    );
  return (
    <div
      role="group"
      aria-label="Confirm discard draft"
      className="flex flex-col gap-2 rounded-xl border border-bad-line bg-bad-soft p-3"
    >
      <p className="text-[12px] text-bad-fg">
        Discard this draft? The tanker is removed from the day-close warning.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={discard.isPending}
          onClick={() => void run()}
          className="h-11 flex-1 rounded-[13px] bg-bad text-[13.5px] font-bold text-on-accent disabled:opacity-60"
        >
          Confirm discard
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="h-11 flex-1 rounded-[13px] border border-line bg-card text-[13.5px] font-bold text-text-high"
        >
          Keep
        </button>
      </div>
    </div>
  );
};
