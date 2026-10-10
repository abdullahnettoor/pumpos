import React from 'react';
import { Avatar } from '../ui/Avatar.js';
import { PinnedHeader } from '../ui/PinnedHeader.js';
import { ChevronDownIcon } from '../ui/icons.js';
import { initialsOf } from '@pump/ui';
import { AlertsBell } from './AlertsBell.js';
import { useShell } from './context.js';

/**
 * Header of the Home tab (pinned): station button, alerts bell and avatar. The station
 * button and the avatar open the Account sheet; the bell is `AlertsBell`.
 */
export const HomeHeader: React.FC = () => {
  const { stationName, userName, openAccount } = useShell();

  return (
    <PinnedHeader>
      <header className="flex items-center gap-2 px-4 pb-3 pt-1.5">
        <button
          type="button"
          onClick={openAccount}
          aria-label={`${stationName}, open account`}
          data-station-button=""
          className="flex min-w-0 items-center gap-2 rounded-xl border border-line bg-card py-1.5 pl-1.5 pr-2.5"
        >
          <span className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-[7px] bg-accent text-[11px] font-extrabold text-on-accent">
            {initialsOf(stationName)}
          </span>
          <span className="truncate text-[13px] font-semibold text-text-high">{stationName}</span>
          <span className="flex-shrink-0 text-text-faint">
            <ChevronDownIcon size={14} strokeWidth={2.4} />
          </span>
        </button>
        <div className="ml-auto flex items-center gap-2">
          <AlertsBell />
          <button type="button" onClick={openAccount} aria-label="Account" className="rounded-full">
            <Avatar name={userName} />
          </button>
        </div>
      </header>
    </PinnedHeader>
  );
};
