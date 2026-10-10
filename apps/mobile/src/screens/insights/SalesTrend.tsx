import React from 'react';
import { INSIGHTS_MIN_COMPARABLE_DAYS, type InsightsSales } from '@pump/shared';
import { compactRupees } from '../../lib/format.js';
import { rangeLabel, weekdayDate, weekdayInitial } from '../../lib/insights/format.js';
import { barGap, LABELLED_BARS, trendChart } from '../../lib/insights/trend.js';
import { ChangeBadge } from './ChangeBadge.js';

/** What a screen reader gets in place of the bars: the range, the total and the best day. */
function chartSummary(data: InsightsSales, weekly: boolean): string {
  const what = weekly ? 'Weekly average sales per closed day' : 'Daily sales';
  const best = data.best
    ? `, best day ${weekdayDate(data.best.date)} ${compactRupees(data.best.sales)}`
    : '';
  return `${what}, ${rangeLabel(data.range!.from, data.range!.to)}: total ${compactRupees(data.total)}${best}`;
}

export const SalesTrend: React.FC<{ data: InsightsSales; days: number }> = ({ data, days }) => {
  if (!data.range || data.closedDays === 0) return null;
  const { granularity, bars } = trendChart(data.trend, data.best?.date ?? null);
  const weekly = granularity === 'week';
  const labelled = !weekly && bars.length <= LABELLED_BARS;
  return (
    <div className="mx-3 rounded-[14px] border border-line bg-card p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-medium text-text-muted">
            Total sales · {rangeLabel(data.range.from, data.range.to)}
          </p>
          <p className="num mt-1 text-[26px] font-semibold tracking-[-0.03em] text-text-high">
            {compactRupees(data.total)}
          </p>
        </div>
        <ChangeBadge changePct={data.changePct} days={days} />
      </div>
      <div
        className="mt-3.5 flex h-24 items-end"
        style={{ gap: barGap(bars.length) }}
        role="img"
        aria-label={chartSummary(data, weekly)}
      >
        {bars.map((b) => (
          <div
            key={b.date}
            aria-hidden="true"
            className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
          >
            <div
              className={`w-full rounded-t-[3px] ${b.best ? 'bg-accent' : 'bg-track'} ${b.closed ? '' : 'border-t border-dashed border-line'}`}
              style={{ height: b.closed ? `${b.heightPct}%` : '2px' }}
            />
            {labelled && (
              <span className="text-[9.5px] text-text-muted">{weekdayInitial(b.date)}</span>
            )}
          </div>
        ))}
      </div>
      {weekly && (
        <p className="mt-1.5 text-[10.5px] text-text-faint">
          Each bar is a week&rsquo;s average per closed day.
        </p>
      )}
      <p className="mt-2 text-[11px] text-text-muted">
        {data.best && (
          <>
            Best day:{' '}
            <b className="font-semibold text-text-high">
              {weekdayDate(data.best.date)} · {compactRupees(data.best.sales)}
            </b>{' '}
            ·{' '}
          </>
        )}
        avg <b className="num font-semibold text-text-high">{compactRupees(data.average)}</b> a
        closed day
        {data.previousAverage > 0 && <> (prior {compactRupees(data.previousAverage)})</>}
      </p>
      {data.changePct === null && data.previousClosedDays > 0 && (
        <p className="mt-1 text-[11px] text-text-faint">
          Not compared with the prior {days} days: that needs {INSIGHTS_MIN_COMPARABLE_DAYS}+ closed
          days in each period ({data.closedDays} now, {data.previousClosedDays} before).
        </p>
      )}
    </div>
  );
};
