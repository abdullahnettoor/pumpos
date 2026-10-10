import React from 'react';
import type { BusinessDayListItem, Station } from '@pump/shared';
import { useBusinessDayList } from '@pump/ui';
import { compactRupees, plural, signedRupees } from '../lib/home/format.js';
import {
  STATUS_LABEL,
  barWidths,
  dayParts,
  draftDates,
  monthLabel,
  shortDate,
  weekChange,
} from '../lib/reports/days.js';
import { useNav } from '../shell/nav.js';
import { ListGroup, SectionLabel, StatTile, StatusBadge, type BadgeTone } from '../ui/index.js';
import { ChevronRightIcon } from '../ui/icons.js';
import { ReportDayPage } from './reports/ReportDayPage.js';

const TONE: Record<BusinessDayListItem['status'], BadgeTone> = {
  LIVE: 'good',
  DRAFT: 'warn',
  SEALED: 'muted',
};

const DayRow: React.FC<{ day: BusinessDayListItem; width: number; onPress: () => void }> = ({
  day,
  width,
  onPress,
}) => {
  const { weekday, day: dom } = dayParts(day.businessDate);
  const live = day.status === 'LIVE';
  const cash =
    day.cashVariance === 0
      ? 'Cash balanced'
      : `Cash ${day.cashVariance > 0 ? '+' : ''}${signedRupees(day.cashVariance)}`;
  return (
    <button
      type="button"
      onClick={onPress}
      aria-label={`${weekday} ${shortDate(day.businessDate)}, ${STATUS_LABEL[day.status]}`}
      className="flex w-full items-center gap-3 px-3 py-[11px] text-left"
    >
      <div className="w-10 flex-shrink-0 text-center">
        <div className="text-[9.5px] font-bold uppercase tracking-[0.06em] text-text-faint">
          {weekday}
        </div>
        <div className="text-[19px] font-extrabold leading-[1.1] text-text-high">{dom}</div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="num text-sm font-semibold text-text-high">
            {live && day.totalSales === 0 ? 'In progress' : compactRupees(day.totalSales)}
          </span>
          <StatusBadge tone={TONE[day.status]}>{STATUS_LABEL[day.status]}</StatusBadge>
        </div>
        <div className="mt-[7px] h-1.5 overflow-hidden rounded-full bg-track">
          <div
            className={`h-full rounded-full ${live ? 'bg-line' : 'bg-accent'} ${day.status === 'SEALED' ? 'opacity-55' : ''}`}
            style={{ width: `${width}%` }}
          />
        </div>
        <div className="num mt-[5px] flex justify-between text-[11px] text-text-muted">
          <span>
            {day.shiftCount > 0 ? `${Math.round(day.volume).toLocaleString('en-IN')} L` : '—'}
          </span>
          <span
            className={
              day.cashVariance < 0 ? 'text-bad-fg' : day.cashVariance > 0 ? 'text-warn-fg' : ''
            }
          >
            {live ? 'See Home' : cash}
          </span>
        </div>
      </div>
      <span className="flex-shrink-0 text-text-faint">
        <ChevronRightIcon size={16} strokeWidth={2.2} />
      </span>
    </button>
  );
};

/**
 * Reports tab: the Station's Business Days, newest first by month, each with its
 * Live / Draft / Sealed status. Live goes to Home (no DSSR until the day closes);
 * Draft and Sealed push the daily report page.
 */
export const ReportsScreen: React.FC<{ station: Station }> = ({ station }) => {
  const nav = useNav();
  const q = useBusinessDayList(station.id);
  const pages = q.data?.pages ?? [];
  const first = pages[0];

  if (q.isLoading)
    return <p className="px-4 py-10 text-center text-sm text-text-muted">Loading…</p>;
  if (q.isError || !first)
    return (
      <p className="px-4 py-10 text-center text-sm text-bad-fg">
        Could not load the daily reports.
      </p>
    );

  const open = (day: BusinessDayListItem) =>
    day.status === 'LIVE'
      ? nav.select('home')
      : nav.push(
          <ReportDayPage station={station} businessDate={day.businessDate} />,
          `report:${day.businessDate}`,
        );
  const change = weekChange(first.week.total, first.week.previousTotal);
  const drafts = draftDates(pages.flatMap((p) => p.days));
  const n = first.week.openPastDays;

  return (
    <>
      <div className="grid grid-cols-2 gap-2 px-3">
        <StatTile
          label="This week"
          value={compactRupees(first.week.total)}
          tone="default"
          sub={
            change === null
              ? 'No prior week'
              : `${change >= 0 ? '▲' : '▼'} ${Math.abs(change)}% vs last`
          }
        />
        <StatTile
          label="Waiting to close"
          value={plural(n, 'day')}
          tone={n > 0 ? 'warn' : 'default'}
          sub={
            n === 0
              ? 'All caught up'
              : drafts.length
                ? drafts.slice(0, 2).map(shortDate).join(' & ')
                : 'Drafts'
          }
        />
      </div>
      {pages.map((page) => {
        const widths = barWidths(page.days);
        return (
          <section key={page.month}>
            <SectionLabel>{monthLabel(page.month)}</SectionLabel>
            {page.days.length === 0 ? (
              <p className="px-4 pb-2 text-sm text-text-muted">No business days this month.</p>
            ) : (
              <ListGroup>
                {page.days.map((day, i) => (
                  <DayRow
                    key={day.businessDate}
                    day={day}
                    width={widths[i] ?? 0}
                    onPress={() => open(day)}
                  />
                ))}
              </ListGroup>
            )}
          </section>
        );
      })}
      {q.hasNextPage && (
        <div className="px-3 pt-4">
          <button
            type="button"
            onClick={() => void q.fetchNextPage()}
            disabled={q.isFetchingNextPage}
            className="w-full rounded-[14px] border border-line bg-card py-3 text-[13px] font-semibold text-accent disabled:opacity-60"
          >
            {q.isFetchingNextPage ? 'Loading…' : 'Load older months'}
          </button>
        </div>
      )}
    </>
  );
};
