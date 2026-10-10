import React from 'react';
import { useMobileAlerts } from '../lib/alerts.js';
import { Avatar } from '../ui/Avatar.js';
import { IconButton } from '../ui/IconButton.js';
import { BellIcon, ChevronDownIcon } from '../ui/icons.js';
import { initialsOf } from '@pump/ui';
import { useShell } from './context.js';
import { useOpenAttention } from './attention.js';

/**
 * Header of the Home tab: station button, alerts bell and avatar. The station
 * button and the avatar open the Account sheet. The bell shows the open-alert
 * count (`useMobileAlerts`, the same list as Home's "All N" and the Needs
 * attention page) and opens that page (`useOpenAttention`).
 */
export const HomeHeader: React.FC = () => {
  const { station, stationName, userName, openAccount } = useShell();
  const openAttention = useOpenAttention();
  const alerts = useMobileAlerts(station);
  const count = alerts.length;
  const danger = alerts.some((a) => a.severity === 'danger');

  return (
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
        <IconButton label={count ? `Alerts, ${count} open` : 'Alerts'} onClick={openAttention}>
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
        <button type="button" onClick={openAccount} aria-label="Account" className="rounded-full">
          <Avatar name={userName} />
        </button>
      </div>
    </header>
  );
};
