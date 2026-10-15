import React from 'react';
import { historicalShiftMessage, type ShiftStatusState } from '@pump/shared';
import { StatusChip } from '../../pump-ds/index.js';
import { Banner } from '../primitives/Banner.js';
import { formatClockInZone, formatElapsedSince, formatHHMM } from '../../utils/format.js';

export interface LiveShiftBarProps {
  templateName: string;
  state: ShiftStatusState;
  openedAt: string;
  openedByName?: string | null;
  scheduledEndTime?: string | null;
  businessDate: string;
  currentBusinessDate: string;
  timeZone?: string;
  handoversRecorded: number;
  handoversExpected: number;
  /** The close flow has started (its draft is kept while the operator works). */
  closing: boolean;
}

/**
 * The open shift's one line (#533): its name and status, who opened it and
 * when, how long it has run, the scheduled end, and how many Drawers have
 * handed over. A shift on a past Business Day says so underneath.
 */
export const LiveShiftBar: React.FC<LiveShiftBarProps> = ({
  templateName,
  state,
  openedAt,
  openedByName,
  scheduledEndTime,
  businessDate,
  currentBusinessDate,
  timeZone,
  handoversRecorded,
  handoversExpected,
  closing,
}) => {
  const historical = historicalShiftMessage(businessDate, currentBusinessDate);
  const end = formatHHMM(scheduledEndTime);
  return (
    <div className="flex flex-col gap-2">
      <div
        className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-card border border-border-soft bg-surface px-4 py-2.5 text-[13px]"
        data-testid="live-shift-bar"
      >
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-semibold text-ink-strong">{templateName}</span>
          <StatusChip status={state} size="md" />
          {closing && <span className="text-[12px] font-medium text-ink-muted">Closing</span>}
        </div>
        <span className="text-ink-muted">
          Opened{' '}
          <span className="font-mono tabular-nums text-ink-strong">
            {formatClockInZone(openedAt, timeZone)}
          </span>
          {openedByName ? ` by ${openedByName}` : ''}
        </span>
        <span className="text-ink-muted">
          Running{' '}
          <span className="font-mono tabular-nums text-ink-strong">
            {formatElapsedSince(openedAt)}
          </span>
        </span>
        {end && (
          <span className="text-ink-muted">
            Scheduled end <span className="font-mono tabular-nums text-ink-strong">{end}</span>
          </span>
        )}
        <span className="text-ink-muted">
          Handovers{' '}
          <span className="font-mono tabular-nums text-ink-strong">
            {handoversRecorded} of {handoversExpected}
          </span>
        </span>
      </div>
      {historical && <Banner severity="warning">{historical}</Banner>}
    </div>
  );
};
