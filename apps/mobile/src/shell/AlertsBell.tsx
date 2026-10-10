import React from 'react';
import { useMobileAlerts } from '../lib/alerts.js';
import { IconButton } from '../ui/IconButton.js';
import { BellIcon } from '../ui/icons.js';
import { useOpenAttention } from './attention.js';
import { useShell } from './context.js';

/**
 * The header bell: the open-alert count (`useMobileAlerts`, the same list as
 * Home's "All N" and the Needs attention page) and a tap that opens that page.
 * Home's header and every tab header (for a Role that may see alerts) render it.
 */
export const AlertsBell: React.FC = () => {
  const { station } = useShell();
  const alerts = useMobileAlerts(station);
  const openAttention = useOpenAttention();
  const count = alerts.length;
  const danger = alerts.some((a) => a.severity === 'danger');

  return (
    <IconButton label={count ? `Alerts, ${count} open` : 'Alerts'} onClick={openAttention}>
      <BellIcon size={17} />
      {count > 0 && (
        <span
          aria-hidden="true"
          className={`num absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full border-2 border-background px-0.5 text-[9px] font-bold text-on-accent ${
            danger ? 'bg-bad' : 'bg-warn'
          }`}
        >
          {count > 9 ? '9+' : count}
        </span>
      )}
    </IconButton>
  );
};
