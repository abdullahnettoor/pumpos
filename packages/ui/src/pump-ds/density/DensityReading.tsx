import React, { type ReactNode } from 'react';
import { Chip } from '../chip/index.js';
import { Sparkline } from '../sparkline/index.js';
import { cn } from '../lib/cn.js';
import { formatDensityReading, type DensityState } from './densityModel.js';

/**
 * DensityReading — one fuel's density (#521), identical on the Dashboard
 * Fuels card and the Inventory density tab: value at 15 °C (mono), observed
 * value at temperature and the time in the station timezone, change vs
 * yesterday, a 14-day sparkline (danger on a jump), and the "Unexplained
 * jump" / "Not recorded" chips.
 */
export interface DensityReadingProps {
  state: DensityState;
  /** 15 °C values, oldest first. */
  trend: readonly number[];
  /** The station's IANA timezone; never the device's. */
  timeZone?: string;
  businessDate: string;
  /** Shown beside "Not recorded" (e.g. a Record button). */
  action?: ReactNode;
  className?: string;
}

const Label: React.FC = () => (
  <div className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
    Density at 15 °C
  </div>
);

export const DensityReading: React.FC<DensityReadingProps> = ({
  state,
  trend,
  timeZone,
  businessDate,
  action,
  className,
}) => {
  const r = formatDensityReading(state, { timeZone, businessDate });
  const jump = r.status === 'jump';

  if (r.value == null) {
    return (
      <div
        className={cn('flex items-center justify-between gap-2', className)}
        data-state={r.status}
      >
        <div>
          <Label />
          <div className="text-[12px] text-ink-muted">{r.detail}</div>
        </div>
        <div className="flex items-center gap-2">
          {r.flag && (
            <Chip tone={r.flag.tone} size="xs">
              {r.flag.label}
            </Chip>
          )}
          {action}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex items-center justify-between gap-3', className)} data-state={r.status}>
      <div className="min-w-0">
        <Label />
        <div className="text-[12px] text-ink-muted">{r.detail}</div>
      </div>
      {trend.length > 1 && (
        <Sparkline
          data={[...trend]}
          width={60}
          height={20}
          tone={jump ? 'danger' : 'brand'}
          aria-label="Density, last 14 days"
        />
      )}
      <div className="shrink-0 text-right">
        <div className="font-mono text-[13px] font-semibold tabular-nums text-ink">{r.value}</div>
        <div className={cn('text-[11.5px]', jump ? 'text-danger-fg' : 'text-ink-muted')}>
          {r.change}
        </div>
        {r.flag && (
          <Chip tone={r.flag.tone} size="xs">
            {r.flag.label}
          </Chip>
        )}
      </div>
    </div>
  );
};
