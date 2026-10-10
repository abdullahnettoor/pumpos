import React from 'react';
import type { BusinessDayListItem, Station } from '@pump/shared';
import { useBusinessDayList } from '@pump/ui';
import { plural } from '../lib/format.js';
import {
  barWidths,
  dayView,
  draftDates,
  monthLabel,
  shortDate,
  weekTile,
  type DayView,
} from '../lib/reports/days.js';
import { useNav } from '../shell/nav.js';
import { ListGroup, Note, SectionLabel, StatTile, StatusBadge } from '../ui/index.js';
import { ChevronRightIcon } from '../ui/icons.js';
import { ReportDayPage } from './reports/ReportDayPage.js';

const NOTE_TONE: Record<DayView['noteTone'], string> = {
  bad: 'text-bad-fg',
  warn: 'text-warn-fg',
  plain: '',
};

const DayRow: React.FC<{ day: BusinessDayListItem; width: number; onPress: () => void }> = ({
  day,
  width,
  onPress,
}) => {
  const v = dayView(day);
  const body = (
    <>
      <div className="w-10 flex-shrink-0 text-center">
        <div className="text-[9.5px] font-bold uppercase tracking-[0.06em] text-text-faint">
          {v.weekday}
        </div>
        <div className="text-[19px] font-extrabold leading-[1.1] text-text-high">
          {v.dayOfMonth}
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="num text-sm font-semibold text-text-high">{v.headline}</span>
          <StatusBadge tone={v.tone}>{v.statusLabel}</StatusBadge>
        </div>
        {v.bar !== 'none' && (
          <div aria-hidden="true" className="mt-[7px] h-1.5 overflow-hidden rounded-full bg-track">
            <div
              className={`h-full rounded-full ${
                v.bar === 'hatched'
                  ? 'bg-hatch'
                  : `bg-accent ${day.status === 'SEALED' ? 'opacity-55' : ''}`
              }`}
              style={{ width: v.bar === 'hatched' ? '100%' : `${width}%` }}
            />
          </div>
        )}
        <div className="num mt-[5px] flex justify-between text-[11px] text-text-muted">
          <span>{v.volume}</span>
          <span className={NOTE_TONE[v.noteTone]}>{v.note}</span>
        </div>
      </div>
      {v.action !== 'none' && (
        <span aria-hidden="true" className="flex-shrink-0 text-text-faint">
          <ChevronRightIcon size={16} strokeWidth={2.2} />
        </span>
      )}
    </>
  );
  // The whole row is one control, so its label carries every figure it shows.
  return v.action === 'none' ? (
    <div
      className="flex w-full items-center gap-3 px-3 py-[11px]"
      aria-label={v.label}
      role="group"
    >
      {body}
    </div>
  ) : (
    <button
      type="button"
      onClick={onPress}
      aria-label={v.label}
      className="flex w-full items-center gap-3 px-3 py-[11px] text-left"
    >
      {body}
    </button>
  );
};

/**
 * Reports tab: the Station's Business Days, newest first by month, each with its
 * Live / Draft / Sealed status. Live goes to Home (no DSSR until the day closes);
 * Draft and Sealed push the DSSR page; a closed day with no DSSR snapshot is
 * shown as Report missing and does not open.
 */
export const ReportsScreen: React.FC<{ station: Station }> = ({ station }) => {
  const nav = useNav();
  const q = useBusinessDayList(station.id);
  const pages = q.data?.pages ?? [];
  const first = pages[0];

  if (q.isLoading) return <Note>Loading…</Note>;
  if (q.isError || !first)
    return (
      <div role="alert" className="px-4 py-10 text-center text-sm text-bad-fg">
        Couldn’t load the business days.{' '}
        <button type="button" onClick={() => void q.refetch()} className="font-bold text-accent">
          Retry
        </button>
      </div>
    );

  const open = (day: BusinessDayListItem) => {
    const { action } = dayView(day);
    if (action === 'home') nav.select('home');
    else if (action === 'report')
      nav.push(
        <ReportDayPage station={station} businessDate={day.businessDate} />,
        `report:${day.businessDate}`,
      );
  };
  const allDays = pages.flatMap((p) => p.days);
  // One bar scale across every loaded month, so bars compare between months.
  const widths = barWidths(allDays);
  const widthOf = new Map(allDays.map((d, i) => [d.businessDate, widths[i] ?? 0]));
  const tile = weekTile(first.week);
  const drafts = draftDates(allDays);
  const n = first.week.openPastDays;

  return (
    <>
      <div className="grid grid-cols-2 gap-2 px-3">
        <StatTile
          label="Last 7 days"
          value={tile.value}
          tone="default"
          sub={
            <>
              {tile.arrow && (
                <>
                  <span aria-hidden="true">{tile.arrow}</span>
                  <span className="sr-only">{tile.srDirection}</span>{' '}
                </>
              )}
              {tile.text}
            </>
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
      {pages.map((page) => (
        <section key={page.month}>
          <SectionLabel>{monthLabel(page.month)}</SectionLabel>
          {page.days.length === 0 ? (
            <p className="px-4 pb-2 text-sm text-text-muted">No business days this month.</p>
          ) : (
            <ListGroup>
              {page.days.map((day) => (
                <DayRow
                  key={day.businessDate}
                  day={day}
                  width={widthOf.get(day.businessDate) ?? 0}
                  onPress={() => open(day)}
                />
              ))}
            </ListGroup>
          )}
        </section>
      ))}
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
