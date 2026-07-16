import React, { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '../lib/cn.js';
import { Dot, type DotTone } from '../dot/Dot.js';

/**
 * BreakdownBar — a single horizontal bar split into proportional tone
 * segments, with a legend beneath. Built for "collections by method"
 * (cash / UPI / card / credit) but reusable for any part-to-whole split.
 * Segments with a zero value are dropped from the bar but kept in the legend.
 */

export interface BreakdownSegment {
  label: string;
  value: number;
  tone: DotTone;
}

export interface BreakdownBarProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  segments: BreakdownSegment[];
  /** Explicit total; defaults to the sum of segment values. */
  total?: number;
  /** Formatter for legend values (e.g. currency). */
  formatValue?: (n: number) => string;
  showLegend?: boolean;
  /** Bar thickness. Default 'md'. */
  size?: 'sm' | 'md';
}

const SEG_BG: Record<DotTone, string> = {
  brand: 'bg-brand',
  info: 'bg-info-fg',
  success: 'bg-success-fg',
  warning: 'bg-warning-fg',
  danger: 'bg-danger-fg',
  neutral: 'bg-ink-faint',
};

export const BreakdownBar = forwardRef<HTMLDivElement, BreakdownBarProps>(function BreakdownBar(
  { className, segments, total, formatValue = (n) => String(n), showLegend = true, size = 'md', ...rest },
  ref
) {
  const sum = total ?? segments.reduce((s, x) => s + Math.max(0, x.value), 0);
  const safeTotal = sum > 0 ? sum : 1;

  return (
    <div ref={ref} className={cn('min-w-0', className)} {...rest}>
      <div className={cn('flex w-full gap-0.5 overflow-hidden rounded-full bg-surface-alt', size === 'sm' ? 'h-1.5' : 'h-2.5')}>
        {segments.map((seg, i) =>
          seg.value > 0 ? (
            <div
              key={`${seg.label}-${i}`}
              className={cn('h-full first:rounded-l-full last:rounded-r-full', SEG_BG[seg.tone])}
              style={{ width: `${(seg.value / safeTotal) * 100}%` }}
              title={`${seg.label}: ${formatValue(seg.value)}`}
            />
          ) : null,
        )}
      </div>
      {showLegend && (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {segments.map((seg, i) => {
            const pct = Math.round((Math.max(0, seg.value) / safeTotal) * 100);
            return (
              <span key={`${seg.label}-${i}`} className="inline-flex items-center gap-1.5 text-[11.5px]">
                <Dot tone={seg.tone} size="sm" />
                <span className="text-ink-muted">{seg.label}</span>
                <span className="font-mono font-medium text-ink-strong">{formatValue(seg.value)}</span>
                <span className="font-mono text-ink-faint">{pct}%</span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
});
