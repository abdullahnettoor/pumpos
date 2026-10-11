import React from 'react';
import { Avatar, BottomSheet, BrandFooter, ListGroup } from '../../ui/index.js';
import { SignOutIcon } from '../../ui/icons.js';

/**
 * The attendant's account sheet: who they are, where, and Sign out (plus the
 * quiet brand footer). Nothing else belongs here (no team, station switcher or appearance setting).
 */
export const AccountSheet: React.FC<{
  open: boolean;
  userName: string;
  stationName: string;
  onClose: () => void;
  onSignOut: () => void;
}> = ({ open, userName, stationName, onClose, onSignOut }) => (
  <BottomSheet open={open} onClose={onClose} label="Account">
    <div className="flex items-center gap-3 px-4 pb-3">
      <Avatar name={userName} size="lg" />
      <div className="min-w-0">
        <p className="m-0 truncate text-[15px] font-bold text-text-high">{userName}</p>
        <p className="m-0 truncate text-xs text-text-muted">Attendant · {stationName}</p>
      </div>
    </div>
    <ListGroup>
      <button
        type="button"
        onClick={onSignOut}
        className="flex w-full items-center gap-2.5 px-3 py-[11px] text-bad-fg"
      >
        <SignOutIcon size={17} />
        <span className="text-[13px] font-semibold">Sign out</span>
      </button>
    </ListGroup>
    <BrandFooter />
  </BottomSheet>
);
