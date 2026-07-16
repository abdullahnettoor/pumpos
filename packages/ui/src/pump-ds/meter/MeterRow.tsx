import React, { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '../lib/cn.js';
import type { DotTone } from '../dot/Dot.js';

/**
 * MeterRow — a labeled progress bar with a value readout. Built for tank
 * levels (fill vs capacity) but reusable for quotas, usage, or any
 * bounded-value display. `tone='auto'` derives danger/warning/brand from the
 * fill percentage against `lowThreshold` / `criticalThreshold`.
 */

export type MeterTone = DotTone | 'auto';

export interface MeterRowProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  label: ReactNode;
  sublabel?: ReactNode;
  value: number;
  max: number;
  /** Right-aligned readout (e.g. "320 / 9,000 L"). Defaults to value/max. */
  valueLabel?: ReactNode;
  tone?: MeterTone;
  /** Percent at/below which auto-tone is 'warning'. Default 15. */
  lowThreshold?: number;
  /** Percent at/below which auto-tone is 'danger'. Default 5. */
  criticalThreshold?: number;
}

const FILL: Record<DotTone, string> = {
  brand: 'bg-brand',
  info: 'bg-info-fg',
  success: 'bg-success-fg',
  warning: 'bg-warning-fg',
  danger: 'bg-danger-fg',
  neutral: 'bg-ink-faint',
};

export const MeterRow = forwardRef<HTMLDivElement, MeterRowProps>(function MeterRow(
  { className, label, sublabel, value, max, valueLabel, tone = 'auto', lowThreshold = 15, criticalThreshold = 5, ...rest },
  ref
) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const resolved: DotTone =
    tone !== 'auto'
      ? tone
      : pct <= criticalThreshold ? 'danger'
      : pct <= lowThreshold ? 'warning'
      : 'brand';

  return (
    <div ref={ref} className={cn('min-w-0', className)} {...rest}>
      <div className="mb-1 flex items-baseline justify-between gap-3 text-[12px]">
        <span className="min-w-0 truncate">
          <span className="font-medium text-ink-strong">{label}</span>
          {sublabel && <span className="text-ink-faint"> · {sublabel}</span>}
        </span>
        <span className={cn('shrink-0 font-mono', resolved === 'danger' ? 'text-danger-fg' : resolved === 'warning' ? 'text-warning-fg' : 'text-ink-muted')}>
          {valueLabel ?? `${value} / ${max}`}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-alt" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
        <div className={cn('h-full rounded-full transition-[width] duration-300', FILL[resolved])} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
});
