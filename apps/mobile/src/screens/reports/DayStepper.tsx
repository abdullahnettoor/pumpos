import React from 'react';
import { liveTabLabel } from '../../lib/reports/days.js';
import type { StepTarget } from '../../lib/reports/dssr.js';
import { BackIcon, ChevronRightIcon } from '../../ui/icons.js';
import { IconButton } from '../../ui/index.js';

interface Props {
  older: StepTarget | null;
  newer: StepTarget | null;
  busy: boolean;
  onOlder: () => void;
  onNewer: () => void;
}

/** ‹ › in the page header: the previous / next day of the Reports list. */
export const DayStepper: React.FC<Props> = ({ older, newer, busy, onOlder, onNewer }) => (
  <div className="flex gap-1.5">
    <IconButton
      label="Previous day"
      className="disabled:opacity-40"
      disabled={!older || busy}
      onClick={onOlder}
    >
      <BackIcon size={16} strokeWidth={2.2} />
    </IconButton>
    <IconButton
      label={
        newer?.kind === 'live' ? `Next day (today, opens ${liveTabLabel(newer.tab)})` : 'Next day'
      }
      className="disabled:opacity-40"
      disabled={!newer || busy}
      onClick={onNewer}
    >
      <ChevronRightIcon size={16} strokeWidth={2.2} />
    </IconButton>
  </div>
);
