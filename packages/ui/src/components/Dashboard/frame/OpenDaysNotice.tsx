import React from 'react';
import { TriangleAlert } from 'lucide-react';
import { Button } from '../../../pump-ds/index.js';
import { useBusinessDayStatus } from '../../../query/hooks.js';
import { useCardEnabled, useDashboard } from './DashboardContext.js';
import { joinDates } from './headerText.js';

/**
 * Full-width bar (Owner/Manager/Accountant) shown while earlier Business Days
 * are still open. Own query, hidden for roles the gating table excludes (no
 * request). Nothing renders while loading; a failure shows a quiet Retry.
 */
export const OpenDaysNotice: React.FC = () => {
  const { station, businessDate, onNavigate } = useDashboard();
  const enabled = useCardEnabled('openDaysNotice');
  const q = useBusinessDayStatus(station.id, businessDate, { enabled });

  if (!enabled || q.isPending) return null;
  if (q.isError) {
    return (
      <div
        role="alert"
        className="flex items-center gap-3 rounded-input border border-border-soft bg-surface-alt px-3.5 py-2 text-[12.5px] text-ink-muted"
      >
        Couldn&apos;t load open days ·
        <Button variant="secondary" size="xs" onClick={() => void q.refetch()}>
          Retry
        </Button>
      </div>
    );
  }
  const days = (q.data?.pastOpenBusinessDays ?? []).map((d) => d.businessDate).sort();
  if (days.length === 0) return null;

  return (
    <div
      role="status"
      data-dashboard-card="openDaysNotice"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-input border border-warning-fg/30 bg-warning-bg px-3.5 py-2 text-[12.5px] text-warning-fg"
    >
      <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <strong className="font-semibold">{joinDates(days)}</strong>{' '}
        {days.length === 1 ? 'is' : 'are'} still open. Their daily reports stay drafts until each
        day is closed.
      </span>
      <button
        type="button"
        className="whitespace-nowrap font-semibold underline-offset-2 hover:underline"
        onClick={() => onNavigate('/shifts', { openPastDays: true })}
      >
        Review in Shifts ›
      </button>
    </div>
  );
};
