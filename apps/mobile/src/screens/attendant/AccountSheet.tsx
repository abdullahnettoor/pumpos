import React, { useEffect } from 'react';
import { initialsOf } from './AttendantHeader.js';

/**
 * The attendant's account sheet: who they are, where, and Sign out. Nothing
 * else belongs here (no team, station switcher or appearance setting).
 */
export const AccountSheet: React.FC<{
  open: boolean;
  userName: string;
  stationName: string;
  onClose: () => void;
  onSignOut: () => void;
}> = ({ open, userName, stationName, onClose, onSignOut }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-scrim" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Account"
        className="mobile-safe-bottom relative rounded-t-3xl border-t border-line bg-card px-4 pt-2.5 shadow-sheet"
      >
        <div aria-hidden className="mx-auto mb-3 h-1 w-9 rounded-full bg-track" />
        <div className="flex items-center gap-3 pb-3">
          <span className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-full border border-line bg-card-alt text-[15px] font-bold text-text-high">
            {initialsOf(userName)}
          </span>
          <div className="min-w-0">
            <p className="m-0 truncate text-[15px] font-bold text-text-high">{userName}</p>
            <p className="m-0 truncate text-xs text-text-muted">Attendant · {stationName}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          className="flex h-12 w-full items-center gap-3 rounded-xl border border-line bg-card-alt px-3.5 text-left text-sm font-semibold text-bad-fg"
        >
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <path d="m16 17 5-5-5-5" />
            <path d="M21 12H9" />
          </svg>
          Sign out
        </button>
      </div>
    </div>
  );
};
