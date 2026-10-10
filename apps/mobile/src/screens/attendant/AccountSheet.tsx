import React from 'react';
import { Avatar, BottomSheet } from '../../ui/index.js';
import { SignOutIcon } from '../../ui/icons.js';

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
}> = ({ open, userName, stationName, onClose, onSignOut }) => (
  <BottomSheet open={open} onClose={onClose} label="Account">
    <div className="px-4">
      <div className="flex items-center gap-3 pb-3">
        <Avatar name={userName} size="lg" />
        <div className="min-w-0">
          <p className="m-0 truncate text-[15px] font-bold text-text-high">{userName}</p>
          <p className="m-0 truncate text-xs text-text-muted">Attendant · {stationName}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onSignOut}
        className="flex h-12 w-full items-center gap-3 rounded-xl border border-line bg-card px-3.5 text-left text-sm font-semibold text-bad-fg"
      >
        <SignOutIcon size={17} />
        Sign out
      </button>
    </div>
  </BottomSheet>
);
