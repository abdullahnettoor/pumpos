import React from 'react';
import type { InsightsSales } from '@pump/shared';
import {
  compactRupees,
  percent,
  rangeLabel,
  weekdayDate,
  weekdayInitial,
} from '../../lib/insights/format.js';
import { trendBars } from '../../lib/insights/trend.js';
import { StatusBadge } from '../../ui/index.js';

/** Change vs the previous period as a badge; null change (nothing to compare) shows none. */
export const ChangeBadge: React.FC<{ changePct: number | null; days: number }> = ({
  changePct,
  days,
}) => {
  if (changePct === null) return null;
  const up = changePct >= 0;
  return (
    <StatusBadge tone={up ? 'good' : 'bad'}>
      <span aria-hidden="true">{up ? '▲' : '▼'}</span>
      <span className="sr-only">{up ? 'Up' : 'Down'}</span> {percent(changePct)} vs prior {days}
    </StatusBadge>
  );
};

export const SalesTrend: React.FC<{ data: InsightsSales; days: number }> = ({ data, days }) => {
  if (!data.range || data.closedDays === 0) return null;
  const bars = trendBars(data.trend, data.best?.date ?? null);
  const dense = bars.length > 14;
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
        className="mt-3.5 flex h-24 items-end gap-[3px]"
        role="img"
        aria-label={`Daily sales, ${bars.length} days`}
      >
        {bars.map((b) => (
          <div
            key={b.date}
            className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
          >
            <div
              className={`w-full rounded-t-[3px] ${b.best ? 'bg-accent' : 'bg-track'} ${b.closed ? '' : 'border-t border-dashed border-line'}`}
              style={{ height: b.closed ? `${b.heightPct}%` : '2px' }}
            />
            {!dense && (
              <span className="text-[9.5px] text-text-muted">{weekdayInitial(b.date)}</span>
            )}
          </div>
        ))}
      </div>
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
        avg <b className="num font-semibold text-text-high">{compactRupees(data.average)}</b>
      </p>
    </div>
  );
};
