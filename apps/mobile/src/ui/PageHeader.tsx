import React from 'react';
import { useShell } from '../shell/context.js';

interface Props {
  title: string;
  /** Page actions on the right (an `IconButton`, a segmented toggle). */
  right?: React.ReactNode;
}

/**
 * Header of a tab's own screen: the station name (tap to open the Account
 * sheet) above a large title, with page actions on the right. Home uses
 * `HomeHeader` instead.
 */
export const PageHeader: React.FC<Props> = ({ title, right }) => {
  const { stationName, openAccount } = useShell();
  return (
    <header className="flex items-center gap-2 px-4 pb-3 pt-1.5">
      <div className="min-w-0">
        <button
          type="button"
          onClick={openAccount}
          className="block max-w-full truncate text-left text-[11px] font-semibold text-text-muted"
        >
          {stationName}
        </button>
        <h1 className="truncate text-[22px] font-extrabold tracking-[-0.03em] text-text-high">
          {title}
        </h1>
      </div>
      {right && <div className="ml-auto flex flex-shrink-0 items-center gap-2">{right}</div>}
    </header>
  );
};
