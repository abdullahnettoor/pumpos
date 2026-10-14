import React, { type ReactNode } from 'react';
import { Chip } from '../chip/index.js';
import { Sparkline } from '../sparkline/index.js';
import { cn } from '../lib/cn.js';
import {
  formatDensityReading,
  type DensityFormatContext,
  type DensityState,
} from './densityModel.js';

/**
 * DensityReading — one fuel's density (#521), identical on the Dashboard
 * Fuels card and the Inventory density tab: value at 15 °C (mono), observed
 * value at temperature and the time in the station timezone, change vs
 * yesterday, a sparkline of recent days (danger on a jump), and the "Unexplained
 * jump" / "Not recorded" chips.
 */
export interface DensityReadingProps {
  state: DensityState;
  /** 15 °C values, oldest first. */
  trend: readonly number[];
  /** Station timezone and business date; render only once the station has loaded. */
  context: DensityFormatContext;
  /** Shown beside "Not recorded" (e.g. a Record button). */
  action?: ReactNode;
  className?: string;
}

export const DensityReading: React.FC<DensityReadingProps> = ({
  state,
  trend,
  context,
  action,
  className,
}) => {
  const display = formatDensityReading(state, context);
  const recorded = display.value != null;
  const jump = display.status === 'jump';
  const flag = display.flag && (
    <Chip tone={display.flag.tone} size="xs">
      {display.flag.label}
    </Chip>
  );

  return (
    <div
      className={cn('flex items-center justify-between', recorded ? 'gap-3' : 'gap-2', className)}
      data-state={display.status}
    >
      <div className="min-w-0">
        <div className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
          Density at 15 °C
        </div>
        <div className="text-[12px] text-ink-muted">{display.detail}</div>
      </div>
      {recorded ? (
        <>
          {trend.length > 1 && (
            <Sparkline
              data={[...trend]}
              width={60}
              height={20}
              tone={jump ? 'danger' : 'brand'}
              aria-label={`Density, last ${trend.length} days with readings`}
            />
          )}
          <div className="shrink-0 text-right">
            <div className="font-mono text-[13px] font-semibold tabular-nums text-ink">
              {display.value}
            </div>
            <div className={cn('text-[11.5px]', jump ? 'text-danger-fg' : 'text-ink-muted')}>
              {display.change}
            </div>
            {flag}
          </div>
        </>
      ) : (
        <div className="flex items-center gap-2">
          {flag}
          {action}
        </div>
      )}
    </div>
  );
};
