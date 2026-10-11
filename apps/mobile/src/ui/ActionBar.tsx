import React, { useState } from 'react';
import { DownloadIcon, ShareIcon } from './icons.js';

export interface ActionSlot {
  /** May return a promise: the button shows a busy state until it settles. */
  onPress: () => void | Promise<unknown>;
  /** Defaults to "Share" / "Download". */
  label?: string;
  disabled?: boolean;
}

interface Props {
  share?: ActionSlot;
  download?: ActionSlot;
  /** Replaces the Share / Download slots (a form's Save draft / Submit). */
  children?: React.ReactNode;
  /** Receives the message when a slot's promise rejects. */
  onError?: (message: string) => void;
}

const BASE =
  'flex h-11 items-center justify-center gap-2 rounded-[13px] text-[13.5px] font-bold disabled:opacity-60';

const Slot: React.FC<{
  slot: ActionSlot;
  fallback: string;
  icon: React.ReactNode;
  primary?: boolean;
  onError?: (message: string) => void;
}> = ({ slot, fallback, icon, primary, onError }) => {
  const [busy, setBusy] = useState(false);
  const press = async () => {
    setBusy(true);
    try {
      await slot.onPress();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Something went wrong.';
      if (onError) onError(message);
      else console.error(message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      onClick={() => void press()}
      disabled={busy || slot.disabled}
      className={`${BASE} ${primary ? 'bg-accent text-on-accent' : 'border border-line bg-card text-text-high'}`}
    >
      {icon}
      {busy ? 'Preparing…' : (slot.label ?? fallback)}
    </button>
  );
};

/**
 * Bottom bar of a detail page; it takes the dock's place. Sticks to the bottom
 * of the page's scroll area. Use `DetailPage` rather than rendering it directly.
 */
export const ActionBar: React.FC<Props> = ({ share, download, children, onError }) => {
  const cols = share && download ? '1fr 1.4fr' : '1fr';
  return (
    <div
      className="sticky bottom-0 z-10 grid gap-2 border-t border-dock-line bg-dock px-3.5 pt-2.5 backdrop-blur-xl"
      style={{
        gridTemplateColumns: children ? '1fr' : cols,
        paddingBottom: 'calc(14px + env(safe-area-inset-bottom))',
      }}
    >
      {children ?? (
        <>
          {share && (
            <Slot slot={share} fallback="Share" icon={<ShareIcon size={16} />} onError={onError} />
          )}
          {download && (
            <Slot
              slot={download}
              fallback="Download"
              icon={<DownloadIcon size={16} strokeWidth={2.2} />}
              primary
              onError={onError}
            />
          )}
        </>
      )}
    </div>
  );
};
