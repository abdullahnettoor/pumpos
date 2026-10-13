import React, { type ReactNode } from 'react';
import { TANK_TONE_LABEL, type TankLevel, type TankTone } from '@pump/shared';
import { cn } from '../lib/cn.js';
import { formatQty } from '../../utils/format.js';
import { stockOfCapacity } from './stockOfCapacity.js';

/**
 * TankGauge — one tank's level (#520): fill in its tone, the % in that tone,
 * "12.4 of 20 KL" and days of cover. The tone comes from the shared tank-level
 * model (`deriveTankLevel` + the station's `resolveTankLevelSettings`), so the
 * gauge never decides a threshold itself.
 *
 * `tube` is a vertical tank beside the figures (a list row); `bar` is a
 * horizontal meter under them (a card).
 */

export type TankGaugeVariant = 'tube' | 'bar';

export interface TankGaugeProps {
  /** Tank name (or product code). */
  name: ReactNode;
  level: TankLevel;
  variant?: TankGaugeVariant;
  /** Product unit; litres (the default) read as KL. */
  unit?: string | null;
  /** Shown where days of cover goes when the tank has no sales history. */
  coverFallback?: ReactNode;
  /** Over-capacity and pending-decantation lines; off when the caller shows them. */
  showStatus?: boolean;
  className?: string;
}

const TONE_TEXT: Record<TankTone, string> = {
  critical: 'text-danger-fg',
  low: 'text-warning-fg',
  ok: 'text-success-fg',
  unknown: 'text-ink-muted',
};

const TONE_FILL: Record<TankTone, string> = {
  critical: 'bg-danger-fg',
  low: 'bg-warning-fg',
  ok: 'bg-success-fg',
  unknown: 'bg-ink-faint',
};

/** Days of cover under which the figure turns red. */
const SHORT_COVER_DAYS = 1.5;

const Cover: React.FC<{ days: number | null; fallback?: ReactNode }> = ({ days, fallback }) => {
  if (days == null) return fallback ? <>{fallback}</> : null;
  const shown = formatQty(days, 1);
  return (
    <>
      <b className={days < SHORT_COVER_DAYS ? 'text-danger-fg' : 'text-ink'}>{shown}</b>{' '}
      {shown === '1.0' ? 'day' : 'days'} cover
    </>
  );
};

const Status: React.FC<{ level: TankLevel }> = ({ level }) => (
  <>
    {level.overCapacity && <div className="text-[11.5px] text-info-fg">Over capacity</div>}
    {level.waitingOnDecantation && (
      <div className="text-[11.5px] font-semibold text-warning-fg">Waiting on decantation</div>
    )}
  </>
);

export const TankGauge: React.FC<TankGaugeProps> = ({
  name,
  level,
  variant = 'tube',
  unit,
  coverFallback,
  showStatus = true,
  className,
}) => {
  const pct = (
    <span className={cn('font-mono text-[13px] font-semibold tabular-nums', TONE_TEXT[level.tone])}>
      {level.pct === null ? '—' : `${level.pct}%`}
    </span>
  );
  const word = TANK_TONE_LABEL[level.tone];
  const stock = (
    <span className="font-mono text-[12px] text-ink-muted">
      {stockOfCapacity(level.stock, level.capacity, unit)}
    </span>
  );
  const meter = {
    role: 'meter',
    'aria-valuenow': level.pct ?? undefined,
    'aria-valuemin': 0,
    'aria-valuemax': 100,
    'aria-label': typeof name === 'string' ? `${name} level` : 'Tank level',
  } as const;

  if (variant === 'bar') {
    return (
      <div className={cn('min-w-0', className)} data-tone={level.tone}>
        <div className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 truncate text-[12.5px] font-semibold text-ink">{name}</span>
          <span className="shrink-0">
            {pct}
            {word && <span className="sr-only"> {word}</span>}
          </span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-alt" {...meter}>
          <div
            className={cn('h-full rounded-full', TONE_FILL[level.tone])}
            style={{ width: `${level.fill}%` }}
          />
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-3">
          {stock}
          <span className="shrink-0 text-[12px] text-ink-muted">
            <Cover days={level.daysOfCover} fallback={coverFallback} />
          </span>
        </div>
        {showStatus && <Status level={level} />}
      </div>
    );
  }

  return (
    <div className={cn('flex items-center gap-3', className)} data-tone={level.tone}>
      <span
        className="relative h-[30px] w-3 shrink-0 overflow-hidden rounded-sm border border-border-strong bg-surface-alt"
        {...meter}
      >
        <span
          className={cn('absolute inset-x-0 bottom-0', TONE_FILL[level.tone])}
          style={{ height: `${level.fill}%` }}
        />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12.5px] font-semibold text-ink">{name}</div>
        {stock}
        {showStatus && <Status level={level} />}
      </div>
      <div className="shrink-0 text-right">
        <div>
          {pct}
          {word && <span className="sr-only"> {word}</span>}
        </div>
        <div className="text-[12px] text-ink-muted">
          <Cover days={level.daysOfCover} fallback={coverFallback} />
        </div>
      </div>
    </div>
  );
};
