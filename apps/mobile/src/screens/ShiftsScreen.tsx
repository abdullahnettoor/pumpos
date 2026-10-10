import React, { useState } from 'react';
import type { Station } from '@pump/shared';
import { businessDateLabel } from '../lib/home/dates.js';
import type { ShiftHistoryRow } from '../lib/shifts/history.js';
import { useNav } from '../shell/nav.js';
import { SectionLabel } from '../ui/index.js';
import { LiveShiftCard } from './shifts/LiveShiftCard.js';
import { ShiftHistory } from './shifts/ShiftHistory.js';
import { useShiftsData } from './shifts/useShiftsData.js';
import { ShiftSummaryPage } from './ShiftSummaryPage.js';

interface Props {
  station: Station;
}

/** Business days of history shown before "Show older days". */
const DAYS_PER_PAGE = 10;

const Note: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="mx-3 rounded-[14px] border border-line bg-card px-3.5 py-3 text-xs text-text-muted">
    {children}
  </p>
);

/**
 * The Shifts tab, view-only: the running Shift, then every closed Shift grouped
 * by Shift Business Date. A row opens that Shift's full Summary (with Share and
 * Download inside it). Writing to a Shift (cash drop, close) stays on desktop.
 */
export const ShiftsScreen: React.FC<Props> = ({ station }) => {
  const nav = useNav();
  const m = useShiftsData(station);
  const [visibleDays, setVisibleDays] = useState(DAYS_PER_PAGE);

  const open = (row: ShiftHistoryRow) =>
    nav.push(
      <ShiftSummaryPage station={station} shiftId={row.shiftId} initial={row.summary} />,
      `shift:${row.shiftId}`,
    );

  return (
    <div className="pb-2">
      {m.staleOpenDate && (
        <p
          role="status"
          className="mx-3 mb-1 rounded-[14px] border border-warn-line bg-warn-soft px-3.5 py-3 text-xs font-semibold text-warn-fg"
        >
          Business day {businessDateLabel(m.staleOpenDate)} still open. Close it on desktop.
        </p>
      )}

      <SectionLabel right={m.live ? `Opened by ${m.live.openedBy}` : undefined}>
        Live shift
      </SectionLabel>
      {m.live ? (
        <LiveShiftCard shift={m.live} />
      ) : (
        <Note>{m.statusLoading ? 'Checking shift…' : 'No open shift right now.'}</Note>
      )}

      {m.historyLoading && <Note>Loading closed shifts…</Note>}
      {m.historyError && <Note>Could not load closed shifts.</Note>}
      {!m.historyLoading && !m.historyError && m.history.length === 0 && (
        <>
          <SectionLabel>Closed shifts</SectionLabel>
          <Note>No closed shifts yet.</Note>
        </>
      )}
      <ShiftHistory days={m.history.slice(0, visibleDays)} onOpen={open} />
      {m.history.length > visibleDays && (
        <div className="px-3 pt-3">
          <button
            type="button"
            onClick={() => setVisibleDays((n) => n + DAYS_PER_PAGE)}
            className="h-10 w-full rounded-[13px] border border-line bg-card text-[13px] font-bold text-text-high"
          >
            Show older days
          </button>
        </div>
      )}
    </div>
  );
};
