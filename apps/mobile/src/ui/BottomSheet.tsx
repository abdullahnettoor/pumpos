import React, { useEffect, useRef } from 'react';
import { useBackLayer } from '../shell/nav.js';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Accessible name of the dialog. */
  label: string;
  children: React.ReactNode;
}

/**
 * Modal bottom sheet. Mounts its content only while open, so data hooks inside
 * fetch on open. Closes on the scrim, Escape and the system back gesture.
 */
export const BottomSheet: React.FC<Props> = ({ open, onClose, label, children }) => {
  const sheetRef = useRef<HTMLDivElement>(null);
  useBackLayer(open, onClose);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    sheetRef.current?.focus();
    return () => previous?.focus?.();
  }, [open]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-40"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div className="absolute inset-0 bg-scrim" onClick={onClose} aria-hidden="true" />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className="absolute inset-x-0 bottom-0 max-h-[88%] overflow-y-auto rounded-t-[26px] border-t border-line bg-background pt-2 shadow-sheet outline-none"
        style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }}
      >
        <div className="mx-auto mb-3 mt-0.5 h-[5px] w-[38px] rounded-full bg-line-strong" />
        {children}
      </div>
    </div>
  );
};
