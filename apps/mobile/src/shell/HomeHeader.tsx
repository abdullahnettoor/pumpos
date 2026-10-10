import React from 'react';
import { useMobileAlerts } from '../lib/alerts.js';
import { IconButton } from '../ui/IconButton.js';
import { BellIcon, ChevronDownIcon } from './icons.js';
import { initialsOf, useShell } from './context.js';
import { useNav } from './nav.js';

/**
 * Header of the Home tab: station button, alerts bell and avatar. The station
 * button and the avatar open the Account sheet. The bell shows the open-alert
 * count and, until the Needs attention page exists, returns to Home.
 */
export const HomeHeader: React.FC = () => {
  const { station, stationName, userName, openAccount } = useShell();
  const nav = useNav();
  const alerts = useMobileAlerts(station);
  const count = alerts.length;
  const danger = alerts.some((a) => a.severity === 'danger');

  return (
    <header className="flex items-center gap-2 px-4 pb-3 pt-1.5">
      <button
        type="button"
        onClick={openAccount}
        aria-label={`${stationName}, open account`}
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
        <IconButton
          label={count ? `Alerts, ${count} open` : 'Alerts'}
          onClick={() => nav.select('home', { toRoot: true })}
        >
          <BellIcon size={17} />
          {count > 0 && (
            <span
              className={`num absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full border-2 border-background px-0.5 text-[9px] font-bold text-on-accent ${
                danger ? 'bg-bad' : 'bg-warn'
              }`}
            >
              {count > 9 ? '9+' : count}
            </span>
          )}
        </IconButton>
        <button
          type="button"
          onClick={openAccount}
          aria-label="Account"
          className="grid h-[34px] w-[34px] place-items-center rounded-full bg-accent-soft text-[11px] font-extrabold text-accent"
        >
          {initialsOf(userName)}
        </button>
      </div>
    </header>
  );
};
