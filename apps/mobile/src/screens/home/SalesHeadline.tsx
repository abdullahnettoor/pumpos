import React from 'react';
import { rupees } from '../../lib/home/format.js';
import type { LiveShift } from '../../lib/home/live.js';
import {
  sparklinePath,
  type SalesFigures,
  type SplitSegment,
  type TrendPoint,
} from '../../lib/home/sales.js';

interface Props {
  sales: SalesFigures;
  split: SplitSegment[];
  /** The Shift whose fuel is still to be counted (hatched), if one is running in this day. */
  openShift: LiveShift | null;
  trend: TrendPoint[];
}

const Sparkline: React.FC<{ trend: TrendPoint[] }> = ({ trend }) => (
  <svg
    width="84"
    height="40"
    viewBox="0 0 84 40"
    role="img"
    aria-label={`Sales over the last ${trend.length} closed days`}
    className="flex-shrink-0"
  >
    <path
      d={sparklinePath(
        trend.map((p) => p.total),
        84,
        40,
      )}
      fill="none"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="stroke-accent"
    />
  </svg>
);

/**
 * "Sales so far today": closed-Shift fuel plus every Product Sale. The bar shows
 * closed Shifts solid and the running Shift hatched: its fuel is counted at close,
 * never estimated into the headline.
 */
export const SalesHeadline: React.FC<Props> = ({ sales, split, openShift, trend }) => {
  const closedLabel = sales.closedShifts.length
    ? `${sales.closedShifts.map((s) => s.label).join(' + ')} · closed`
    : 'No closed Shift yet';
  return (
    <div className="col-span-2 rounded-[14px] border border-line bg-card p-3">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-text-muted">Sales so far today</p>
          <p className="num mt-1 text-[30px] font-semibold tracking-[-0.03em] text-text-high">
            {rupees(sales.total)}
          </p>
          <p className="num text-[11px] text-text-muted">
            {sales.fuelVolumeLabel} fuel · {rupees(sales.productsValue)} products
          </p>
        </div>
        {trend.length >= 2 && <Sparkline trend={trend} />}
      </div>
      {split.length > 0 && (
        <>
          <div aria-hidden="true" className="mt-3 flex h-2 gap-[3px]">
            {split.map((seg) => (
              <div
                key={seg.key}
                data-segment={seg.kind}
                className={`first:rounded-l-full last:rounded-r-full ${
                  seg.kind === 'closed' ? 'bg-accent' : 'bg-hatch'
                }`}
                style={{ flex: seg.weight }}
              />
            ))}
          </div>
          <div className="mt-1.5 flex justify-between gap-3 text-[11px] text-text-muted">
            <span className="truncate">{closedLabel}</span>
            {openShift && (
              <span className="flex-shrink-0">{openShift.name} fuel · counted at close</span>
            )}
          </div>
        </>
      )}
    </div>
  );
};
