import React from 'react';
import { Button, Chip, Sparkline } from '../../../../pump-ds/index.js';
import { formatBusinessDate, formatMoney } from '../../../../utils/format.js';
import { formatClockInZone, formatDayMonth, formatQty } from '../../../../utils/format.js';
import {
  coverFallback,
  isYesterday,
  needsAttention,
  shouldPlanPurchase,
  type PendingDecant,
  type DensityState,
  type FuelTank,
  type TankTone,
} from './fuelsModel.js';

const TONE_TEXT: Record<TankTone, string> = {
  red: 'text-danger-fg',
  amber: 'text-warning-fg',
  ok: 'text-success-fg',
  unknown: 'text-ink-muted',
};

const TONE_BAR: Record<TankTone, string> = {
  red: 'bg-danger-fg',
  amber: 'bg-warning-fg',
  ok: 'bg-success-fg',
  unknown: 'bg-ink-faint',
};

/** Part state: each of density / tanks loads (and fails) on its own. */
export type Part<T> =
  { status: 'loading' } | { status: 'error'; retry: () => void } | { status: 'ready'; value: T };

export interface FuelBlockProps {
  name: string;
  code: string;
  price: number;
  effectiveFrom: string | null;
  density: Part<{ state: DensityState; trend: number[] }>;
  tanks: Part<FuelTank[]>;
  pendingDecant: PendingDecant | null;
  timeZone: string | undefined;
  businessDate: string;
  canRecord: boolean;
  canDecant: boolean;
  canPlan: boolean;
  onRecord: () => void;
  onDecant: () => void;
  onPlan: () => void;
}

const PartError: React.FC<{ what: string; retry: () => void }> = ({ what, retry }) => (
  <div className="flex items-center gap-2 text-[12px] text-ink-muted" role="alert">
    <span>Couldn&apos;t load {what} ·</span>
    <Button variant="secondary" size="xs" onClick={retry}>
      Retry
    </Button>
  </div>
);

const Pulse: React.FC<{ h: number }> = ({ h }) => (
  <div className="animate-pulse rounded bg-surface-alt" style={{ height: h }} aria-hidden="true" />
);

const Label: React.FC<React.PropsWithChildren> = ({ children }) => (
  <div className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">{children}</div>
);

const ROW = 'border-t border-dashed border-border-soft px-3 py-2';

const DensityRow: React.FC<
  Pick<FuelBlockProps, 'density' | 'timeZone' | 'businessDate' | 'canRecord' | 'onRecord'>
> = ({ density, timeZone, businessDate, canRecord, onRecord }) => {
  if (density.status === 'loading')
    return (
      <div className={ROW}>
        <Pulse h={32} />
      </div>
    );
  if (density.status === 'error')
    return (
      <div className={ROW}>
        <PartError what="density" retry={density.retry} />
      </div>
    );
  const { state, trend } = density.value;
  if (state.kind === 'not-recorded') {
    return (
      <div className={`${ROW} flex items-center justify-between gap-2`}>
        <div>
          <Label>Density at 15 °C</Label>
          <div className="text-[12px] text-ink-muted">
            {state.last != null ? `last ${state.last.toFixed(1)}` : 'no reading yet'}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Chip tone="warning" size="xs">
            Not recorded
          </Chip>
          {canRecord && (
            <Button variant="ghost" size="xs" onClick={onRecord}>
              Record ›
            </Button>
          )}
        </div>
      </div>
    );
  }
  const change = state.kind === 'recorded' || state.kind === 'jump' ? state.change : null;
  const observed = state.observedDensity;
  return (
    <div className={`${ROW} flex items-center justify-between gap-3`}>
      <div className="min-w-0">
        <Label>Density at 15 °C</Label>
        <div className="text-[12px] text-ink-muted">
          {observed != null && `${observed.toFixed(1)} `}
          {state.tempC != null && `at ${state.tempC} °C · `}
          {formatClockInZone(state.at, timeZone)}
        </div>
      </div>
      {trend.length > 1 && (
        <Sparkline
          data={trend}
          width={60}
          height={20}
          tone={state.kind === 'jump' ? 'danger' : 'brand'}
          aria-label="Density, last 14 days"
        />
      )}
      <div className="shrink-0 text-right">
        <div className="font-mono text-[13px] font-semibold tabular-nums text-ink">
          {state.density.toFixed(1)}
        </div>
        <div className="text-[11.5px] text-ink-muted">
          {change
            ? `${change.delta > 0 ? '+' : ''}${change.delta.toFixed(1)} vs ${
                isYesterday(change.from, businessDate) ? 'yday' : formatBusinessDate(change.from)
              }`
            : 'first reading'}
        </div>
        {state.kind === 'jump' && (
          <Chip tone="danger" size="xs">
            Unexplained jump
          </Chip>
        )}
      </div>
    </div>
  );
};

const TankRow: React.FC<{ tank: FuelTank }> = ({ tank }) => (
  <li className={`${ROW} flex items-center gap-3`} data-tone={tank.tone}>
    <span
      className="relative h-[30px] w-3 shrink-0 overflow-hidden rounded-sm border border-border-strong bg-surface-alt"
      aria-hidden="true"
    >
      <span
        className={`absolute inset-x-0 bottom-0 ${TONE_BAR[tank.tone]}`}
        style={{ height: `${tank.fill}%` }}
      />
    </span>
    <div className="min-w-0 flex-1">
      <div className="truncate text-[13px] font-medium text-ink">{tank.name}</div>
      <div className="text-[12px] text-ink-muted">
        {formatQty(tank.currentKl, 1)} of {tank.capacityKl.toFixed(0)} KL
      </div>
    </div>
    <div className="shrink-0 text-right">
      <div className={`font-mono text-[13px] font-semibold tabular-nums ${TONE_TEXT[tank.tone]}`}>
        {tank.pct === null ? '—' : `${tank.pct}%`}
      </div>
      <div className="text-[12px] text-ink-muted">
        {tank.cover ? (
          <>
            <span className="font-semibold text-ink">{tank.cover.replace(/ days?$/, '')}</span>
            {' days cover'}
          </>
        ) : (
          coverFallback
        )}
      </div>
    </div>
  </li>
);

export const FuelBlock: React.FC<FuelBlockProps> = (p) => {
  const densityState = p.density.status === 'ready' ? p.density.value.state : null;
  const tanks = p.tanks.status === 'ready' ? p.tanks.value : [];
  const alert = needsAttention(tanks, densityState);
  const pending = tanks.filter((t) => t.waitingOnDecantation);
  const showPlan = p.canPlan && p.tanks.status === 'ready' && shouldPlanPurchase(tanks);
  const pd = p.pendingDecant;

  return (
    <article
      className={`overflow-hidden rounded-lg border bg-surface ${
        alert ? 'border-danger-fg/40' : 'border-border-soft'
      }`}
      data-testid={`fuel-${p.code}`}
      data-alert={alert ? 'true' : 'false'}
    >
      <header className="flex items-center justify-between gap-2 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />
          <h3 className="text-[14px] font-semibold text-ink">{p.name}</h3>
          <span className="text-[11px] text-ink-muted">{p.code}</span>
        </div>
        <div className="text-right">
          <div className="font-mono text-[15px] font-semibold tabular-nums text-ink">
            {p.price > 0 ? `${formatMoney(p.price)}/L` : 'No price'}
          </div>
          {p.effectiveFrom && (
            <div className="text-[11px] text-ink-muted">
              since {formatDayMonth(p.effectiveFrom, p.timeZone)}
            </div>
          )}
        </div>
      </header>
      <DensityRow {...p} />
      {p.tanks.status === 'loading' && (
        <div className={ROW}>
          <Pulse h={30} />
        </div>
      )}
      {p.tanks.status === 'error' && (
        <div className={ROW}>
          <PartError what="tanks" retry={p.tanks.retry} />
        </div>
      )}
      {p.tanks.status === 'ready' && (
        <ul>
          {p.tanks.value.map((t) => (
            <TankRow key={t.id} tank={t} />
          ))}
        </ul>
      )}
      {showPlan && (
        <div className={`${ROW} flex justify-end`}>
          <Button variant="ghost" size="xs" onClick={p.onPlan}>
            Plan purchase ›
          </Button>
        </div>
      )}
      {pending.length > 0 && (
        <div className="flex items-center justify-between gap-2 bg-warning-bg px-3 py-2 text-[12px] text-warning-fg">
          <span>
            {pd?.qtyL != null ? (
              <>
                <b>{formatQty(pd.qtyL / 1000, 1)} KL</b> tanker waiting to decant
              </>
            ) : (
              <>Tanker waiting to decant · {pending.map((t) => t.name).join(', ')}</>
            )}
            {pd?.since && ` · since ${formatClockInZone(pd.since, p.timeZone)}`}
          </span>
          {p.canDecant && (
            <Button variant="ghost" size="xs" onClick={p.onDecant}>
              Decant ›
            </Button>
          )}
        </div>
      )}
    </article>
  );
};
